"""Idempotency for every mutating API request, as ASGI middleware.

A client sends `Idempotency-Key` on POST/PUT/PATCH/DELETE (the BukkaPay apps
do this automatically for every request). Keys are scoped to the caller
(their bearer token / admin token, else their IP) and stored in Redis:

  * first request      → runs; its response is stored for 24 hours
  * same key, same body → the stored response is replayed
                          (header `Idempotent-Replayed: true`), nothing runs again
  * same key, still running → 409, so a double tap can't run twice in parallel
  * same key, different body → 422 (a key is for one request only)
  * 5xx responses aren't stored, so a retry after a server error can run
  * sign-in and session routes are never replayed: a replayed sign-in would
    hand back a session that was signed out since (or an old "wrong
    password" / "confirm your email" answer), so signing in again within the
    apps' 2-minute key window failed. They have their own rate limits.

The ledger keeps its own database-level guard on transfers; this layer
covers every other money route the same way.
"""

from __future__ import annotations

import base64
import hashlib
import json

from app.core.redis import get_redis

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
TTL_DONE = 24 * 3600
TTL_INFLIGHT = 120
MAX_STORED_BODY = 256 * 1024
SKIP_PREFIXES = (
    "/webhooks/", "/api/card-issuer/", "/api/webhooks/", "/api/bank-partner/",
    # Sessions: customer + merchant, admin console, Boardroom, passkeys.
    "/api/auth/", "/api/admin/auth/", "/api/admin/invitations/", "/api/board/auth/", "/api/webauthn/",
)


def _h(*parts: bytes) -> str:
    d = hashlib.sha256()
    for p in parts:
        d.update(p)
        d.update(b"\x00")
    return d.hexdigest()


async def _send_json(send, status: int, payload: dict, extra: list | None = None):
    body = json.dumps(payload).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
                + (extra or [])})
    await send({"type": "http.response.body", "body": body})


class IdempotencyMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in MUTATING:
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        key = headers.get(b"idempotency-key", b"").strip()
        if not key or not path.startswith(("/api/", "/webhooks/")) or path.startswith(SKIP_PREFIXES):
            return await self.app(scope, receive, send)
        if len(key) > 200:
            return await _send_json(send, 400, {"error": "Idempotency-Key is too long"})

        # Read the whole body once, then replay it to the app.
        chunks, more = [], True
        while more:
            msg = await receive()
            if msg["type"] != "http.request":
                break
            chunks.append(msg.get("body", b""))
            more = msg.get("more_body", False)
        body = b"".join(chunks)

        async def replay_receive():
            return {"type": "http.request", "body": body, "more_body": False}

        who = headers.get(b"authorization") or headers.get(b"x-admin-token") or \
            str((scope.get("client") or ("anon",))[0]).encode()
        rkey = f"idem:{_h(who)[:24]}:{_h(key)[:32]}"
        fingerprint = _h(scope["method"].encode(), path.encode(), scope.get("query_string", b""), body)

        try:
            redis = get_redis()
            got = await redis.set(rkey, json.dumps({"fp": fingerprint, "state": "inflight"}), nx=True, ex=TTL_INFLIGHT)
        except Exception:  # Redis down: don't block payments; the DB-level guards still apply
            return await self.app(scope, replay_receive, send)

        if not got:
            raw = await redis.get(rkey)
            stored = json.loads(raw) if raw else None
            if stored is None:
                return await _send_json(send, 409, {"error": "This request is being processed. Please wait."})
            if stored.get("fp") != fingerprint:
                return await _send_json(send, 422, {"error": "This Idempotency-Key was already used for a different request"})
            if stored.get("state") == "inflight":
                return await _send_json(send, 409, {"error": "This payment is already being processed. Please wait a moment."})
            out = base64.b64decode(stored["body"])
            await send({"type": "http.response.start", "status": stored["status"],
                        "headers": [(b"content-type", stored.get("ct", "application/json").encode()),
                                    (b"content-length", str(len(out)).encode()), (b"idempotent-replayed", b"true")]})
            await send({"type": "http.response.body", "body": out})
            return

        status, ct, parts = 500, "application/json", []

        async def capture_send(message):
            nonlocal status, ct
            if message["type"] == "http.response.start":
                status = message["status"]
                for k, v in message.get("headers", []):
                    if k.lower() == b"content-type":
                        ct = v.decode()
            elif message["type"] == "http.response.body":
                parts.append(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, replay_receive, capture_send)
        finally:
            try:
                out = b"".join(parts)
                if status < 500 and len(out) <= MAX_STORED_BODY:
                    await redis.set(rkey, json.dumps({"fp": fingerprint, "state": "done", "status": status, "ct": ct,
                                                      "body": base64.b64encode(out).decode()}), ex=TTL_DONE)
                else:
                    await redis.delete(rkey)
            except Exception:
                pass
