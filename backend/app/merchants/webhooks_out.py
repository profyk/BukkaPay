"""Outbound webhooks to merchants' own systems.

Events are queued through the transactional outbox (so they are only sent
for payments that actually committed) and signed with the endpoint's
secret: ``X-BukkaPay-Signature: t=<unix>,v1=<hmac_sha256(secret, "<t>.<body>")>``.
"""

import hashlib
import hmac
import json
import secrets
import time
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import MerchantWebhookEndpoint
from app.network import outbox

EVENTS = ("payment.succeeded", "refund.succeeded", "payout.submitted", "payment_link.paid")


async def emit(db: AsyncSession, merchant_id: uuid.UUID, event: str, data: dict) -> int:
    endpoints = (await db.execute(select(MerchantWebhookEndpoint).where(
        MerchantWebhookEndpoint.merchant_id == merchant_id, MerchantWebhookEndpoint.active.is_(True)))).scalars()
    queued = 0
    for ep in endpoints:
        if ep.events and event not in ep.events:
            continue
        await outbox.enqueue(db, "merchant.webhook", {
            "endpoint_id": str(ep.id), "event_id": "evt_" + secrets.token_hex(10), "type": event, "data": data,
        })
        queued += 1
    return queued


def sign(secret: str, body: bytes, timestamp: int) -> str:
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={mac}"


async def deliver(db: AsyncSession, payload: dict) -> None:
    endpoint = await db.get(MerchantWebhookEndpoint, uuid.UUID(payload["endpoint_id"]))
    if endpoint is None or not endpoint.active:
        return
    body = json.dumps({"id": payload["event_id"], "type": payload["type"], "data": payload["data"]}).encode()
    headers = {"Content-Type": "application/json",
               "X-BukkaPay-Signature": sign(endpoint.secret, body, int(time.time()))}
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(endpoint.url, content=body, headers=headers)
    if response.status_code >= 300:
        raise RuntimeError(f"merchant endpoint returned {response.status_code}")
