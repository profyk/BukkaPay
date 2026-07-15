import pytest
from httpx import AsyncClient

from tests.conftest import unique_email, unique_username

pytestmark = pytest.mark.asyncio


async def test_transfer_happy_path(client: AsyncClient, funded_user: dict, other_user: dict):
    r = await client.post("/api/transfer", json={
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
        "password": "password123",
    })
    recipient_wallet_id = r.json()["user"]["walletId"]

    r = await client.post("/api/transfer", json={
        "fromCardId": card_id, "toUserId": recipient_wallet_id, "amount": "50.00",
    }, headers=user["headers"])
    assert r.status_code == 400
    assert "insufficient" in r.json()["error"].lower()


async def test_transfer_to_self_rejected(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/transfer", json={
        "fromCardId": funded_user["card_id"], "toUserId": funded_user["user"]["walletId"], "amount": "10.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "yourself" in r.json()["error"].lower()


async def test_transfer_exceeds_max_limit(client: AsyncClient, funded_user: dict, other_user: dict):
    r = await client.post("/api/transfer", json={
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "99999.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "50" in r.json()["error"]


async def test_transfer_recipient_not_found(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/transfer", json={
        "fromCardId": funded_user["card_id"], "toUserId": "BKP-DOESNOTEXIST", "amount": "10.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 404


async def test_create_card_and_list(client: AsyncClient, user: dict):
    r = await client.post("/api/cards", json={"title": "Groceries"}, headers=user["headers"])
    assert r.status_code == 201
    assert r.json()["balance"] == "0.00"  # string, not a JSON number

    r = await client.get("/api/cards", headers=user["headers"])
    assert r.status_code == 200
    assert len(r.json()) == 2  # default card + the one just created


async def test_transaction_history_records_transfer(client: AsyncClient, funded_user: dict, other_user: dict):
    await client.post("/api/transfer", json={
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "25.00",
    }, headers=funded_user["headers"])

    r = await client.get("/api/transactions", headers=funded_user["headers"])
    assert r.status_code == 200
    assert any(t["category"] == "transfer" and t["type"] == "debit" for t in r.json())
