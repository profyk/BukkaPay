"""JIT card webhooks at /webhooks/card/{auth,settle,reverse}: atomic holds,
exactly-once settle/reverse, signatures required."""

import json
import uuid
from decimal import Decimal

from httpx import AsyncClient

from app.cards import issuers
from tests.test_cards import SANDBOX, card_holder
from tests.test_ledger import assert_ledger_consistent, card_balance


def _signed(payload: dict) -> tuple[bytes, dict]:
    body = json.dumps(payload).encode()
    return body, {"X-Card-Issuer": "sandbox", "X-Card-Issuer-Signature": issuers.sign(SANDBOX, body)}


async def test_auth_hold_settle_once_and_reverse(client: AsyncClient):
    u = await card_holder(client, fund="300.00")
    card = u["card"]
    auth_id = "auth_" + uuid.uuid4().hex[:12]
    body, h = _signed({"authorizationId": auth_id, "cardId": card.issuer_card_id, "amount": "120.00",
                       "currency": card.billing_currency, "merchantName": "Corner Shop", "merchantCountry": "ZA"})
    r = await client.post("/webhooks/card/auth", content=body, headers=h)
    assert r.status_code == 200 and r.json()["approved"] is True
    assert await card_balance(u["card_id"]) == Decimal("180.00")  # held

    settle = {"eventId": "evt_" + uuid.uuid4().hex, "transactionId": "txn_" + uuid.uuid4().hex[:12],
              "authorizationId": auth_id, "cardId": card.issuer_card_id, "amount": "120.00",
              "currency": card.billing_currency, "final": True}
    body, h = _signed(settle)
    assert (await client.post("/webhooks/card/settle", content=body, headers=h)).json()["status"] == "processed"
    # The issuer retries the same event: nothing happens twice.
    assert (await client.post("/webhooks/card/settle", content=body, headers=h)).json()["status"] == "duplicate"
    assert await card_balance(u["card_id"]) == Decimal("180.00")

    # A second authorisation, reversed: the hold goes back to the wallet.
    auth2 = "auth_" + uuid.uuid4().hex[:12]
    body, h = _signed({"authorizationId": auth2, "cardId": card.issuer_card_id, "amount": "50.00",
                       "currency": card.billing_currency, "merchantName": "Fuel", "merchantCountry": "ZA"})
    assert (await client.post("/webhooks/card/auth", content=body, headers=h)).json()["approved"] is True
    assert await card_balance(u["card_id"]) == Decimal("130.00")
    body, h = _signed({"eventId": "evt_" + uuid.uuid4().hex, "authorizationId": auth2})
    assert (await client.post("/webhooks/card/reverse", content=body, headers=h)).json()["status"] == "processed"
    assert await card_balance(u["card_id"]) == Decimal("180.00")
    await assert_ledger_consistent()


async def test_unsigned_or_unknown_issuer_is_refused(client: AsyncClient):
    body = json.dumps({"eventId": "x", "authorizationId": "y"}).encode()
    r = await client.post("/webhooks/card/reverse", content=body,
                          headers={"X-Card-Issuer": "sandbox", "X-Card-Issuer-Signature": "t=1,v1=bad"})
    assert r.status_code == 401
    r = await client.post("/webhooks/card/reverse", content=body, headers={"X-Card-Issuer": "nope"})
    assert r.status_code == 404
