import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _create_claim(client: AsyncClient, funded_user: dict, *, pin="1234", amount="100.00"):
    r = await client.post("/api/claim-payments", json={
        "recipientName": "Someone", "recipientContact": "+27821234567",
        "amount": amount, "pin": pin,
    }, headers=funded_user["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_claim_escrows_balance(client: AsyncClient, funded_user: dict):
    claim = await _create_claim(client, funded_user)
    assert claim["recipientName"] == "Someone"
    assert claim["currency"] == "ZAR"

    r = await client.get("/api/cards", headers=funded_user["headers"])
    card = next(c for c in r.json() if c["id"] == funded_user["card_id"])
    assert card["balance"] == "900.00"


async def test_claim_via_wallet_credits_receiver(client: AsyncClient, funded_user: dict, other_user: dict):
    claim = await _create_claim(client, funded_user)

    r = await client.post(f"/api/claim-payments/{claim['id']}/verify-pin", json={"pin": "1234"})
    assert r.status_code == 200

    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-wallet", json={
        "email": other_user["user"]["email"],
    })
    assert r.status_code == 200

    r = await client.get("/api/cards", headers=other_user["headers"])
    assert r.json()[0]["balance"] == "100.00"


async def test_claim_wrong_pin_rejected(client: AsyncClient, funded_user: dict):
    claim = await _create_claim(client, funded_user)
    r = await client.post(f"/api/claim-payments/{claim['id']}/verify-pin", json={"pin": "0000"})
    assert r.status_code == 401
    assert "attempt" in r.json()["error"].lower()


async def test_claim_double_claim_rejected(client: AsyncClient, funded_user: dict, other_user: dict):
    claim = await _create_claim(client, funded_user)
    await client.post(f"/api/claim-payments/{claim['id']}/claim-wallet", json={"email": other_user["user"]["email"]})

    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-wallet", json={"email": other_user["user"]["email"]})
    assert r.status_code == 400
    assert "already claimed" in r.json()["error"].lower()


async def test_claim_cash_pickup_flow(client: AsyncClient, funded_user: dict):
    claim = await _create_claim(client, funded_user)
    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-cash")
    assert r.status_code == 200
    pickup_code = r.json()["pickupCode"]
    assert len(pickup_code) == 15

    r = await client.post("/api/pickup/claim", json={"pickupCode": pickup_code})
    assert r.status_code == 200
    assert r.json()["amount"] == "100.00"

    r = await client.post("/api/pickup/claim", json={"pickupCode": pickup_code})
    assert r.status_code == 400


async def test_cancel_claim_refunds_sender(client: AsyncClient, funded_user: dict):
    claim = await _create_claim(client, funded_user)
    r = await client.delete(f"/api/claim-payments/{claim['id']}", headers=funded_user["headers"])
    assert r.status_code == 200

    r = await client.get("/api/cards", headers=funded_user["headers"])
    card = next(c for c in r.json() if c["id"] == funded_user["card_id"])
    assert card["balance"] == "1000.00"


async def test_create_claim_bad_pin_rejected(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/claim-payments", json={
        "recipientName": "Someone", "recipientContact": "+27821234567",
        "amount": "10.00", "pin": "12",
    }, headers=funded_user["headers"])
    assert r.status_code == 400
