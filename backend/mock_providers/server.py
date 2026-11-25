"""Standalone mock provider server for local end-to-end testing.

    uvicorn mock_providers.server:app --port 8099   (from backend/)

It plays the card processor and the payout rail against a running BukkaPay
API (BUKKAPAY_API, default http://localhost:8000), so you can click through
the app and watch money move:

    POST /cards/authorize     {"cardId", "amount", "currency", ...}  → approve/decline
    POST /cards/clear         {"cardId", "authorizationId", "amount", "currency"}
    POST /cards/reverse       {"authorizationId", "amount"?}
    POST /cards/late          sends a stale-signed event (must be rejected)
    POST /payouts/scenario    {"scenario": "accept|reject|timeout|paid_now"}  (in-process rail only)
    POST /payouts/status      {"reference", "status", "reason"?}  → status webhook
    POST /payouts/duplicate   re-sends the last payout webhook

Never point this at production: BukkaPay refuses sandbox/mock providers there.
"""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI

from mock_providers.scenarios import MockCardProcessor, MockPayoutRail

API = os.environ.get("BUKKAPAY_API", "http://localhost:8000")
app = FastAPI(title="BukkaPay mock providers")
_last: dict = {}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=API, timeout=10)


@app.post("/cards/authorize")
async def authorize(body: dict) -> dict:
    async with _client() as c:
        return await MockCardProcessor(c).authorize(body["cardId"], str(body["amount"]), body.get("currency", "ZAR"),
                                                    **{k: v for k, v in body.items() if k not in ("cardId", "amount", "currency")})


@app.post("/cards/clear")
async def clear(body: dict) -> dict:
    async with _client() as c:
        r = await MockCardProcessor(c).clear(body["cardId"], body.get("authorizationId"), str(body["amount"]),
                                             body.get("currency", "ZAR"))
        return {"status": r.status_code, "body": r.json()}


@app.post("/cards/reverse")
async def reverse(body: dict) -> dict:
    async with _client() as c:
        r = await MockCardProcessor(c).reverse(body["authorizationId"], body.get("amount"))
        return {"status": r.status_code, "body": r.json()}


@app.post("/cards/late")
async def late(body: dict) -> dict:
    async with _client() as c:
        r = await MockCardProcessor(c).event("transaction.cleared", body, stale=True)
        return {"status": r.status_code}


@app.post("/payouts/scenario")
async def scenario(body: dict) -> dict:
    MockPayoutRail(httpx.AsyncClient()).script(body["scenario"])
    return {"scenario": body["scenario"]}


@app.post("/payouts/status")
async def payout_status(body: dict) -> dict:
    import uuid

    event_id = body.get("eventId") or "pevt_" + uuid.uuid4().hex
    async with _client() as c:
        r = await MockPayoutRail(c).webhook(body["reference"], body["status"], reason=body.get("reason"),
                                            event_id=event_id)
    _last["payout"] = body | {"eventId": event_id}  # /payouts/duplicate re-sends this exact event
    return {"status": r.status_code, "body": r.json()}


@app.post("/payouts/duplicate")
async def duplicate() -> dict:
    body = _last.get("payout")
    if not body:
        return {"status": "nothing to repeat"}
    return await payout_status(body)
