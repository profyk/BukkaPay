"""Every money route is protected: a retried or double-tapped request with
the same Idempotency-Key runs once and replays its first response."""

import uuid
from decimal import Decimal

from httpx import AsyncClient

from tests.conftest import TEST_PIN
from tests.test_ledger import card_balance
from tests.test_network import signup


async def test_retry_replays_instead_of_paying_twice(client: AsyncClient, funded_user: dict):
    b = await signup(client)
    key = uuid.uuid4().hex
    body = {"pin": TEST_PIN, "fromCardId": funded_user["card_id"], "toUserId": b["user"]["walletId"], "amount": "75.00"}
    h = {**funded_user["headers"], "Idempotency-Key": key}
    r1 = await client.post("/api/transfer", json=body, headers=h)
    r2 = await client.post("/api/transfer", json=body, headers=h)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
    assert r2.headers.get("idempotent-replayed") == "true" and r2.json() == r1.json()
    assert await card_balance(b["card_id"]) == Decimal("75.00")  # once, not twice

    # The same key can't be reused for a different payment.
    r3 = await client.post("/api/transfer", json={**body, "amount": "10.00"}, headers=h)
    assert r3.status_code == 422


async def test_keys_are_scoped_to_the_caller(client: AsyncClient, funded_user: dict, other_user: dict):
    key = uuid.uuid4().hex
    r = await client.post("/api/payment-requests", json={"toUserId": other_user["user"]["walletId"], "amount": "5.00"},
                          headers={**funded_user["headers"], "Idempotency-Key": key})
    r2 = await client.post("/api/payment-requests", json={"toUserId": funded_user["user"]["walletId"], "amount": "5.00"},
                           headers={**other_user["headers"], "Idempotency-Key": key})
    assert r2.headers.get("idempotent-replayed") is None
    assert r.status_code in (200, 201, 400, 404) and r2.status_code in (200, 201, 400, 404)
