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


async def test_sign_in_is_never_replayed(client: AsyncClient):
    """Signing out and back in within the apps' key window must give a fresh,
    working session, not a replay of the signed-out one."""
    u = await signup(client)
    body = {"email": u["user"]["email"], "password": "password123"}
    h = {"Idempotency-Key": "app-same-window"}
    r1 = await client.post("/api/auth/login", json=body, headers=h)
    assert r1.status_code == 200, r1.text
    t1 = r1.json()["token"]
    assert (await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {t1}"})).status_code == 200
    r2 = await client.post("/api/auth/login", json=body, headers=h)
    assert r2.status_code == 200 and r2.headers.get("idempotent-replayed") is None
    t2 = r2.json()["token"]
    assert t2 != t1
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {t2}"})).status_code == 200

    # A wrong password isn't replayed onto the right one either (same key, v1 path).
    bad = await client.post("/api/v1/auth/login", json={**body, "password": "nope-nope"}, headers={"Idempotency-Key": "k2"})
    assert bad.status_code == 401
    ok = await client.post("/api/v1/auth/login", json=body, headers={"Idempotency-Key": "k2"})
    assert ok.status_code == 200, ok.text
