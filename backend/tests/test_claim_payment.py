import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


async def _create_claim(client: AsyncClient, funded_user: dict, *, pin="1234", amount="100.00"):
    r = await client.post("/api/claim-payments", json={"transactionPin": TEST_PIN,
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
        "pin": "1234", "email": other_user["user"]["email"],
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
    body = {"pin": "1234", "email": other_user["user"]["email"]}
    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-wallet", json=body)
    assert r.status_code == 200, r.text

    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-wallet", json=body)
    assert r.status_code == 400
    assert "already claimed" in r.json()["error"].lower()


async def test_claim_cash_pickup_flow(client: AsyncClient, funded_user: dict, admin: dict):
    claim = await _create_claim(client, funded_user)
    r = await client.post(f"/api/claim-payments/{claim['id']}/claim-cash", json={"pin": "1234"})
    assert r.status_code == 200
    pickup_code = r.json()["pickupCode"]
    assert len(pickup_code) == 15

    r = await client.post("/api/pickup/claim", json={"pickupCode": pickup_code})
    assert r.status_code == 401  # staff only
    r = await client.post("/api/pickup/claim", json={"pickupCode": pickup_code}, headers=admin["headers"])
    assert r.status_code == 200
    assert r.json()["amount"] == "100.00"

    r = await client.post("/api/pickup/claim", json={"pickupCode": pickup_code}, headers=admin["headers"])
    assert r.status_code == 400


async def test_cancel_claim_refunds_sender(client: AsyncClient, funded_user: dict):
    claim = await _create_claim(client, funded_user)
    r = await client.delete(f"/api/claim-payments/{claim['id']}", headers=funded_user["headers"])
    assert r.status_code == 200

    r = await client.get("/api/cards", headers=funded_user["headers"])
    card = next(c for c in r.json() if c["id"] == funded_user["card_id"])
    assert card["balance"] == "1000.00"


async def test_create_claim_bad_pin_rejected(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/claim-payments", json={"transactionPin": TEST_PIN,
        "recipientName": "Someone", "recipientContact": "+27821234567",
        "amount": "10.00", "pin": "12",
    }, headers=funded_user["headers"])
    assert r.status_code == 400


async def test_payout_requires_the_pin(client: AsyncClient, funded_user: dict, other_user: dict):
    """Skipping verify-pin and calling the payout endpoints directly must not work."""
    claim = await _create_claim(client, funded_user)
    cid = claim["id"]
    r = await client.post(f"/api/claim-payments/{cid}/claim-wallet", json={"email": other_user["user"]["email"]})
    assert r.status_code == 400  # PIN missing
    r = await client.post(f"/api/claim-payments/{cid}/claim-bank", json={
        "pin": "9999", "accountName": "Thief", "bankName": "Any", "accountNumber": "123456"})
    assert r.status_code == 401
    r = await client.post(f"/api/claim-payments/{cid}/claim-cash", json={"pin": "9999"})
    assert r.status_code == 401
    r = await client.get("/api/cards", headers=other_user["headers"])
    assert r.json()[0]["balance"] == "0.00"


async def test_failed_pin_attempts_are_counted_and_lock_the_claim(client: AsyncClient, funded_user: dict,
                                                                  other_user: dict):
    claim = await _create_claim(client, funded_user)
    cid = claim["id"]
    for _ in range(5):
        r = await client.post(f"/api/claim-payments/{cid}/verify-pin", json={"pin": "0000"})
        assert r.status_code == 401
    # Locked: even the right PIN no longer works, on any endpoint.
    r = await client.post(f"/api/claim-payments/{cid}/verify-pin", json={"pin": "1234"})
    assert r.status_code == 429
    r = await client.post(f"/api/claim-payments/{cid}/claim-wallet",
                          json={"pin": "1234", "email": other_user["user"]["email"]})
    assert r.status_code == 429
