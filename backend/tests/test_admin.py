import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_master_key_grants_access(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/users", headers=admin["master_headers"])
    assert r.status_code == 200
    assert "pagination" in r.json()


async def test_session_login_grants_access(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/auth/me", headers=admin["headers"])
    assert r.status_code == 200
    assert r.json()["role"] == "super_admin"


async def test_no_credentials_rejected(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/users")
    assert r.status_code == 401


async def test_wrong_master_key_rejected(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/users", headers={"x-admin-token": "wrong-key"})
    assert r.status_code == 401


async def test_freeze_and_unfreeze_user_wallet(client: AsyncClient, admin: dict, other_user: dict, funded_user: dict):
    r = await client.patch(
        f"/api/admin/wallets/{funded_user['card_id']}/freeze", json={"frozen": True}, headers=admin["master_headers"]
    )
    assert r.status_code == 200
    assert r.json()["frozen"] is True

    r = await client.post("/api/transfer", json={
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "10.00",
    }, headers=funded_user["headers"])
    assert r.status_code == 403
    assert "frozen" in r.json()["error"].lower()

    r = await client.patch(
        f"/api/admin/wallets/{funded_user['card_id']}/freeze", json={"frozen": False}, headers=admin["master_headers"]
    )
    assert r.status_code == 200
    assert r.json()["frozen"] is False


async def test_set_wallet_balance(client: AsyncClient, admin: dict, user: dict):
    r = await client.get("/api/cards", headers=user["headers"])
    card_id = r.json()[0]["id"]

    r = await client.patch(
        f"/api/admin/wallets/{card_id}/balance", json={"balance": "555.55"}, headers=admin["master_headers"]
    )
    assert r.status_code == 200
    assert r.json()["card"]["balance"] == "555.55"


async def test_freeze_user_account(client: AsyncClient, admin: dict, user: dict):
    r = await client.patch(
        f"/api/admin/users/{user['user']['id']}/freeze", json={"frozen": True}, headers=admin["master_headers"]
    )
    assert r.status_code == 200
    assert r.json()["user"]["status"] == "frozen"


async def test_broadcast_notification(client: AsyncClient, admin: dict, user: dict):
    r = await client.post("/api/admin/broadcast", json={
        "title": "Maintenance", "message": "We'll be down briefly tonight.",
    }, headers=admin["master_headers"])
    assert r.status_code == 200
    assert r.json()["sent"] >= 1

    r = await client.get("/api/notifications", headers=user["headers"])
    assert r.status_code == 200
    assert any(n["title"] == "Maintenance" for n in r.json())


async def test_non_super_admin_cannot_manage_admins(client: AsyncClient, admin: dict):
    r = await client.post("/api/admin/admins", json={
        "email": "second@example.com", "name": "Second Admin", "password": "password123", "role": "admin",
    }, headers=admin["master_headers"])
    assert r.status_code == 201
    second_email = "second@example.com"

    r = await client.post("/api/admin/auth/login", json={"email": second_email, "password": "password123"})
    assert r.status_code == 200
    second_headers = {"Authorization": f"Bearer {r.json()['token']}"}

    r = await client.post("/api/admin/admins", json={
        "email": "third@example.com", "name": "Third", "password": "password123",
    }, headers=second_headers)
    assert r.status_code == 403
