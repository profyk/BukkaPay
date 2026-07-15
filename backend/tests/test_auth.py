import pytest
from httpx import AsyncClient

from tests.conftest import unique_email, unique_username

pytestmark = pytest.mark.asyncio


async def test_signup_creates_default_card(client: AsyncClient):
    r = await client.post("/api/auth/signup", json={
        "name": "Alice", "email": unique_email(), "username": unique_username(),
        "password": "password123",
    })
    assert r.status_code == 201
    body = r.json()
    assert "token" in body
    assert body["user"]["walletId"].startswith("BKP-")
    assert body["user"]["loyaltyPoints"] == 0


async def test_signup_duplicate_email_rejected(client: AsyncClient):
    email = unique_email()
    payload = {"name": "Bob", "email": email, "username": unique_username(), "password": "password123"}
    r1 = await client.post("/api/auth/signup", json=payload)
    assert r1.status_code == 201

    payload2 = {**payload, "username": unique_username()}
    r2 = await client.post("/api/auth/signup", json=payload2)
    assert r2.status_code == 400
    assert "error" in r2.json()


async def test_signup_short_password_rejected(client: AsyncClient):
    r = await client.post("/api/auth/signup", json={
        "name": "Carl", "email": unique_email(), "username": unique_username(), "password": "short",
    })
    assert r.status_code == 400


async def test_login_wrong_password(client: AsyncClient):
    email = unique_email()
    await client.post("/api/auth/signup", json={
        "name": "Dana", "email": email, "username": unique_username(), "password": "password123",
    })
    r = await client.post("/api/auth/login", json={"email": email, "password": "wrongpassword"})
    assert r.status_code == 401
    assert r.json()["error"] == "Invalid email or password"


async def test_login_lockout_after_ten_failures(client: AsyncClient):
    email = unique_email()
    await client.post("/api/auth/signup", json={
        "name": "Eve", "email": email, "username": unique_username(), "password": "password123",
    })
    for _ in range(10):
        await client.post("/api/auth/login", json={"email": email, "password": "wrong"})

    r = await client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 429
    assert "locked" in r.json()["error"].lower()


async def test_me_requires_auth(client: AsyncClient):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


async def test_me_and_logout(client: AsyncClient, user: dict):
    r = await client.get("/api/auth/me", headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["walletId"] == user["user"]["walletId"]

    r = await client.post("/api/auth/logout", headers=user["headers"])
    assert r.status_code == 200

    r = await client.get("/api/auth/me", headers=user["headers"])
    assert r.status_code == 401


async def test_update_profile(client: AsyncClient, user: dict):
    r = await client.patch("/api/auth/profile", json={"name": "New Name"}, headers=user["headers"])
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


async def test_update_profile_requires_a_field(client: AsyncClient, user: dict):
    r = await client.patch("/api/auth/profile", json={}, headers=user["headers"])
    assert r.status_code == 400
