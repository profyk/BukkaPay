"""Inbound provider webhooks: verify signature and timestamp, store every
event once (unique provider+event id → duplicates are acknowledged, not
re-applied), then process idempotently.

Signature scheme for BukkaPay-format providers (sandbox, bank partners that
adopt it): header ``X-BukkaPay-Signature: t=<unix>,v1=<hex hmac_sha256(secret,
"<t>.<raw body>")>``; events older than 5 minutes are rejected.
"""

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models.platform import ProviderWebhook

TOLERANCE_SECONDS = 300


def _secret(provider: str) -> str | None:
    settings = get_settings()
    if provider == "sandbox":
        return settings.sandbox_webhook_secret
    if provider == "bank_partner":
        return settings.bank_partner_webhook_secret
    return None


def signature_header(provider: str, body: bytes, *, timestamp: int | None = None) -> str:
    t = timestamp or int(time.time())
    mac = hmac.new(_secret(provider).encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={t},v1={mac}"


def verify(provider: str, body: bytes, header: str | None, *, now: float | None = None) -> bool:
    secret = _secret(provider)
    if not secret or not header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        t = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs((now or time.time()) - t) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, given)


async def receive(db: AsyncSession, provider: str, body: bytes, header: str | None) -> dict:
    if _secret(provider) is None:
        raise ApiError("Unknown webhook provider", status_code=404)
    valid = verify(provider, body, header)
    try:
        payload = json.loads(body)
        event_id = str(payload["id"])
        event_type = str(payload["type"])
    except (ValueError, KeyError, TypeError) as e:
        raise ApiError("Malformed webhook", status_code=400) from e
    if not valid:
        # Recorded for monitoring under a distinct id so a forged event can't
        # block the genuine one with the same id.
        db.add(ProviderWebhook(provider=provider, event_id=f"rejected:{event_id}:{time.time_ns()}",
                               event_type=event_type, signature_valid=False, payload=payload, status="rejected"))
        await db.flush()
        raise ApiError("Invalid webhook signature", status_code=401)

    inserted = (
        await db.execute(
            insert(ProviderWebhook)
            .values(provider=provider, event_id=event_id, event_type=event_type, signature_valid=True,
                    payload=payload, status="received", attempts=0)
            .on_conflict_do_nothing(constraint="uq_provider_webhooks_event")
            .returning(ProviderWebhook.id)
        )
    ).scalar_one_or_none()
    if inserted is None:
        return {"status": "duplicate"}
    record = await db.get(ProviderWebhook, inserted)
    record.attempts = 1
    try:
        async with db.begin_nested():
            outcome = await _process(db, provider, event_type, payload.get("data") or {})
        record.status = "processed" if outcome else "ignored"
    except ApiError as e:
        record.status = "failed"
        record.error = e.message
    record.processed_at = datetime.now(UTC)
    await db.flush()
    return {"status": record.status}


async def _process(db: AsyncSession, provider: str, event_type: str, data: dict) -> bool:
    from app.network import transfers

    if event_type == "transfer.settled":
        await transfers.settle(db, data["transfer_reference"], rail_reference=data.get("rail_reference"))
        return True
    if event_type == "transfer.failed":
        await transfers.fail(db, data["transfer_reference"], reason=data.get("reason") or "rail failure")
        return True
    return False


async def sandbox_settle(db: AsyncSession, transfer_reference: str, rail_reference: str) -> None:
    """The sandbox rail's simulated settlement, delivered through the same
    signed-webhook path a real rail would use."""
    body = json.dumps({
        "id": f"sbx-settle-{transfer_reference}", "type": "transfer.settled",
        "data": {"transfer_reference": transfer_reference, "rail_reference": rail_reference},
    }).encode()
    await receive(db, "sandbox", body, signature_header("sandbox", body))
