"""Personal accounts use the BukkaPay app, Business accounts the merchant
dashboard, and admin emails are never customer or business accounts."""

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.base import get_session_factory
from app.services import social_auth_service as social
from tests.conftest import SUPER_ADMIN_EMAIL, unique_email, unique_username

pytestmark = pytest.mark.asyncio


async def test_routes_are_closed_to_the_other_account_type(client: AsyncClient, user: dict, business_user: dict):
    r = await client.post("/api/merchants", json={"businessName": "Nope", "businessType": "retail"},
                          headers=user["headers"])
    assert r.status_code == 403 and "personal" in r.json()["error"].lower()
    r = await client.get("/api/merchants/anything/trade-invoices", headers=user["headers"])
    assert r.status_code == 403

    r = await client.get("/api/cards", headers=business_user["headers"])
    assert r.status_code == 403 and "business" in r.json()["error"].lower()
    r = await client.get("/api/v1/transactions", headers=business_user["headers"])
    assert r.status_code == 403

    # Shared routes work for both.
    for who in (user, business_user):
        assert (await client.get("/api/auth/me", headers=who["headers"])).status_code == 200
    r = await client.post("/api/merchants", json={"businessName": "Yes", "businessType": "retail"},
                          headers=business_user["headers"])
    assert r.status_code == 201, r.text


async def test_sign_in_only_from_the_right_app(client: AsyncClient, user: dict, business_user: dict):
    p = "password123"
    r = await client.post("/api/auth/login", json={"email": user["user"]["email"], "password": p, "app": "merchant"})
    assert r.status_code == 403 and "app.bukkapay.com" in r.json()["error"]
    r = await client.post("/api/auth/login", json={"email": user["user"]["email"], "password": p})
    assert r.status_code == 200

    r = await client.post("/api/auth/login", json={"email": business_user["user"]["email"], "password": p})
    assert r.status_code == 403 and "merchant.bukkapay.com" in r.json()["error"]
    r = await client.post("/api/auth/login",
                          json={"email": business_user["user"]["email"], "password": p, "app": "merchant"})
    assert r.status_code == 200 and r.json()["user"]["accountType"] == "business"


async def test_google_creates_business_accounts_from_the_merchant_dashboard(client: AsyncClient, monkeypatch):
    email = unique_email()
    monkeypatch.setattr(social, "verify_google", lambda _t: social.VerifiedIdentity("google", "g-biz", email, "Biz"))
    body = {"idToken": "x", "app": "merchant"}
    r = await client.post("/api/auth/google", json=body)
    assert r.status_code == 428  # new: needs username, phone, country, terms
    r = await client.post("/api/auth/google", json={**body, "residenceCountry": "ZA", "acceptTerms": True,
                                                    "username": unique_username(), "phone": "0821234567"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["accountType"] == "business"
    # The same Google account can't then sign in to the customer app.
    r = await client.post("/api/auth/google", json={"idToken": "x"})
    assert r.status_code == 403


async def test_admin_emails_are_never_customer_accounts(client: AsyncClient, admin: dict, user: dict):
    # The owner (an admin) can't sign up as a customer or business.
    r = await client.post("/api/auth/signup", json={
        "name": "Owner", "email": SUPER_ADMIN_EMAIL, "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 403
    # A customer's email can't be invited as an admin.
    r = await client.post("/api/admin/invites", json={"email": user["user"]["email"], "name": "C", "role": "auditor"},
                          headers=admin["headers"])
    assert r.status_code == 409


async def test_database_keeps_admin_and_customer_emails_apart(client: AsyncClient, admin: dict, user: dict):
    async with get_session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text("UPDATE users SET email = :e WHERE id = :id"),
                             {"e": SUPER_ADMIN_EMAIL, "id": user["user"]["id"]})
        await db.rollback()
    async with get_session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text(
                "INSERT INTO admin_users (id, email, name, password, role, is_active, mfa_enabled, created_at) "
                "VALUES (gen_random_uuid(), :e, 'X', 'x', 'auditor', true, false, now())"), {"e": user["user"]["email"]})
        await db.rollback()
