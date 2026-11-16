import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN, unique_email, unique_username

pytestmark = pytest.mark.asyncio


async def test_transfer_happy_path(client: AsyncClient, funded_user: dict, other_user: dict):
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "100.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["newBalance"] == "900.00"
    assert body["recipient"]["walletId"] == other_user["user"]["walletId"]


async def test_transfer_insufficient_balance(client: AsyncClient, user: dict):
    r = await client.get("/api/cards", headers=user["headers"])
    card_id = r.json()[0]["id"]

    r = await client.post("/api/auth/signup", json={
        "name": "Recipient", "email": unique_email(), "username": unique_username(),
        "password": "password123", "residenceCountry": "ZA", "acceptTerms": True,
    })
    recipient_wallet_id = r.json()["user"]["walletId"]

    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": card_id, "toUserId": recipient_wallet_id, "amount": "50.00",
    }, headers=user["headers"])
    assert r.status_code == 400
    assert "insufficient" in r.json()["error"].lower()


async def test_transfer_to_self_rejected(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": funded_user["user"]["walletId"], "amount": "10.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "yourself" in r.json()["error"].lower()


async def test_transfer_exceeds_max_limit(client: AsyncClient, funded_user: dict, other_user: dict):
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "99999.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "verification level" in r.json()["error"]  # KYC-level limit (transaction_limits)


async def test_transfer_recipient_not_found(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": "BKP-DOESNOTEXIST", "amount": "10.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 404


async def test_create_card_requires_fee_balance(client: AsyncClient, user: dict):
    # The user's free signup card starts at a balance of 0, and issuing a
    # second card costs the admin-configured issuance fee — so with nothing
    # to pay it from, the request is rejected rather than issuing for free.
    r = await client.post("/api/cards", json={"pin": TEST_PIN, "title": "Groceries"}, headers=user["headers"])
    assert r.status_code == 400
    assert "insufficient" in r.json()["error"].lower()


async def test_create_card_and_list(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/cards", json={"pin": TEST_PIN, "title": "Groceries"}, headers=funded_user["headers"])
    assert r.status_code == 201
    assert r.json()["balance"] == "0.00"  # string, not a JSON number

    r = await client.get("/api/cards", headers=funded_user["headers"])
    assert r.status_code == 200
    assert len(r.json()) == 2  # default card + the one just created

    default_card = next(c for c in r.json() if c["isDefault"])
    assert default_card["balance"] == "950.00"  # 1000.00 funded - 50.00 issuance fee


async def test_transaction_history_records_transfer(client: AsyncClient, funded_user: dict, other_user: dict):
    await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "25.00",
    }, headers=funded_user["headers"])

    r = await client.get("/api/transactions", headers=funded_user["headers"])
    assert r.status_code == 200
    assert any(t["category"] == "transfer" and t["type"] == "debit" for t in r.json())
