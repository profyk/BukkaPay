"""Scripted provider behaviour, usable in-process (tests) or over HTTP (server.py).

Card processor → BukkaPay:  real-time authorizations, clearing, reversal,
                            refund, duplicate and late (stale-signed) events.
Payout rail → BukkaPay:     status webhooks (processing / paid / failed /
                            returned), duplicates, late events, bad signatures.
"""

from __future__ import annotations

import json
import time
import uuid

import httpx

from app.cards import issuers
from app.payouts import rails

CARD_ISSUER = "sandbox"  # the mock processor signs like the sandbox issuer


class MockCardProcessor:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client

    def _signed(self, payload: dict, *, stale: bool = False) -> tuple[bytes, dict]:
        body = json.dumps(payload).encode()
        ts = int(time.time()) - (3600 if stale else 0)
        return body, {"X-Card-Issuer-Signature": issuers.sign(issuers.by_code(CARD_ISSUER), body, timestamp=ts),
                      "Content-Type": "application/json"}

    async def authorize(self, issuer_card_id: str, amount: str, currency: str, *, auth_id: str | None = None,
                        **extra) -> dict:
        payload = {"authorizationId": auth_id or "auth_" + uuid.uuid4().hex[:12], "cardId": issuer_card_id,
                   "amount": amount, "currency": currency, "merchantName": extra.pop("merchant", "Mock Store"),
                   "merchantMcc": extra.pop("mcc", "5411"), "merchantCountry": extra.pop("country", "ZA"),
                   "channel": extra.pop("channel", "contactless"), **extra}
        body, headers = self._signed(payload)
        r = await self.client.post(f"/api/card-issuer/{CARD_ISSUER}/authorize", content=body, headers=headers)
        return {**r.json(), "authorizationId": payload["authorizationId"], "httpStatus": r.status_code}

    async def event(self, type_: str, data: dict, *, event_id: str | None = None, stale: bool = False) -> httpx.Response:
        payload = {"id": event_id or "evt_" + uuid.uuid4().hex, "type": type_, "data": data}
        body, headers = self._signed(payload, stale=stale)
        return await self.client.post(f"/api/card-issuer/{CARD_ISSUER}/events", content=body, headers=headers)

    async def clear(self, issuer_card_id: str, auth_id: str | None, amount: str, currency: str, **kw) -> httpx.Response:
        return await self.event("transaction.cleared", {"transactionId": "txn_" + uuid.uuid4().hex[:12],
                                                        "cardId": issuer_card_id, "authorizationId": auth_id,
                                                        "amount": amount, "currency": currency, **kw})

    async def reverse(self, auth_id: str, amount: str | None = None) -> httpx.Response:
        return await self.event("authorization.reversed", {"authorizationId": auth_id,
                                                           **({"amount": amount} if amount else {})})


class MockPayoutRail:
    """Drives app.payouts.rails.MOCK and sends its webhooks."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.rail = rails.MOCK

    def script(self, scenario: str) -> None:
        self.rail.scenario = scenario  # accept | reject | timeout | paid_now

    async def webhook(self, provider_reference: str, status: str, *, event_id: str | None = None,
                      reason: str | None = None, stale: bool = False, bad_signature: bool = False) -> httpx.Response:
        payload = {"id": event_id or "pevt_" + uuid.uuid4().hex, "reference": provider_reference, "status": status,
                   **({"reason": reason} if reason else {})}
        body = json.dumps(payload).encode()
        secret = "wrong-secret" if bad_signature else rails.MockPayoutRail.SECRET
        ts = int(time.time()) - (3600 if stale else 0)
        return await self.client.post("/api/webhooks/payouts/mock", content=body,
                                      headers={"X-Payout-Signature": rails.sign(secret, body, timestamp=ts),
                                               "Content-Type": "application/json"})
