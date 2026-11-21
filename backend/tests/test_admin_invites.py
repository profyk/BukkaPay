"""The owner is the only super admin (API and database), and admins join by
emailed invitation: they set their own password and enrol MFA."""

import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.business.mfa import current_totp
from app.db.base import get_session_factory
from tests.conftest import SUPER_ADMIN_EMAIL

pytestmark = pytest.mark.asyncio


def _email() -> str:
    return f"invitee-{uuid.uuid4().hex[:8]}@example.com"


def _token(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


async def _invite(client: AsyncClient, admin: dict, email: str, role: str = "finance_admin"):
    r = await client.post("/api/admin/invites", json={"email": email, "name": "Nia Invitee", "role": role},
                          headers=admin["headers"])
    return r


async def test_invite_accept_with_password_and_mfa_then_login(client: AsyncClient, admin: dict):
    email = _email()
    r = await _invite(client, admin, email)
    assert r.status_code == 201, r.text
    link = r.json()["link"]
    assert "/accept-invite?token=" in link
    token = _token(link)

    r = await client.get("/api/admin/invites", headers=admin["headers"])
    assert any(i["email"] == email and i["status"] == "pending" for i in r.json())

    r = await client.get(f"/api/admin/invitations/{token}")
    assert r.status_code == 200 and r.json()["roleLabel"] == "Finance Admin"

    # Must enrol MFA: no secret yet -> refused.
    r = await client.post(f"/api/admin/invitations/{token}/accept", json={"password": "a-long-password", "otp": "000000"})
    assert r.status_code == 400

    r = await client.post(f"/api/admin/invitations/{token}/mfa")
    assert r.status_code == 200
    secret = r.json()["secret"]
    assert (await client.post(f"/api/admin/invitations/{token}/mfa")).json()["secret"] == secret

    r = await client.post(f"/api/admin/invitations/{token}/accept", json={"password": "a-long-password", "otp": "000000"})
    assert r.status_code == 400
    r = await client.post(f"/api/admin/invitations/{token}/accept", json={"password": "short", "otp": current_totp(secret)})
    assert r.status_code == 400

    r = await client.post(f"/api/admin/invitations/{token}/accept",
                          json={"password": "a-long-password", "otp": current_totp(secret)})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "finance_admin"

    # Link is single-use.
    assert (await client.get(f"/api/admin/invitations/{token}")).status_code == 404

    # MFA is on: the right password alone asks for the code (428) ...
    r = await client.post("/api/admin/auth/login", json={"email": email, "password": "a-long-password"})
    assert r.status_code == 428
    # ... a wrong password never reveals that step ...
    r = await client.post("/api/admin/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401
    # ... and a wrong code is refused.
    r = await client.post("/api/admin/auth/login", json={"email": email, "password": "a-long-password", "otp": "000000"})
    assert r.status_code == 401
    r = await client.post("/api/admin/auth/login",
                          json={"email": email, "password": "a-long-password", "otp": current_totp(secret)})
    assert r.status_code == 200, r.text


async def test_resend_replaces_link_and_revoke_kills_it(client: AsyncClient, admin: dict):
    r = await _invite(client, admin, _email(), role="customer_support")
    first = r.json()
    r = await client.post(f"/api/admin/invites/{first['invite']['id']}/resend", headers=admin["headers"])
    assert r.status_code == 200
    second = r.json()
    assert (await client.get(f"/api/admin/invitations/{_token(first['link'])}")).status_code == 404
    assert (await client.get(f"/api/admin/invitations/{_token(second['link'])}")).status_code == 200

    r = await client.delete(f"/api/admin/invites/{first['invite']['id']}", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "revoked"
    assert (await client.get(f"/api/admin/invitations/{_token(second['link'])}")).status_code == 404


async def test_super_admin_can_never_be_invited_created_or_granted(client: AsyncClient, admin: dict):
    assert (await _invite(client, admin, _email(), role="super_admin")).status_code == 403
    assert (await _invite(client, admin, SUPER_ADMIN_EMAIL, role="auditor")).status_code == 403

    r = await client.post("/api/admin/admins", json={"email": _email(), "name": "X", "password": "password123",
                                                     "role": "super_admin"}, headers=admin["headers"])
    assert r.status_code == 403

    email = _email()
    r = await client.post("/api/admin/admins", json={"email": email, "name": "Y", "password": "password123",
                                                     "role": "auditor"}, headers=admin["headers"])
    assert r.status_code == 201
    r = await client.patch(f"/api/admin/admins/{r.json()['id']}", json={"role": "super_admin"}, headers=admin["headers"])
    assert r.status_code == 403

    r = await client.post("/api/admin/setup", json={"email": _email(), "name": "Z", "password": "password123"},
                          headers=admin["master_headers"])
    assert r.status_code == 403


async def test_owner_cannot_be_demoted_suspended_renamed_or_deleted(client: AsyncClient, admin: dict):
    me = (await client.get("/api/admin/auth/me", headers=admin["headers"])).json()
    owner_id = me["id"]
    for body in ({"role": "auditor"}, {"isActive": False}, {"email": "someone@example.com"}):
        r = await client.patch(f"/api/admin/admins/{owner_id}", json=body, headers=admin["master_headers"])
        assert r.status_code == 403, body
    r = await client.delete(f"/api/admin/admins/{owner_id}", headers=admin["master_headers"])
    assert r.status_code == 403


@pytest.mark.parametrize("sql", [
    ("INSERT INTO admin_users (id, email, name, password, role, is_active, mfa_enabled, created_at) "
     "VALUES (gen_random_uuid(), 'sneaky@example.com', 'S', 'x', 'super_admin', true, false, now())"),
    "UPDATE admin_users SET role = 'auditor' WHERE lower(email) = 'profykersha18@gmail.com'",
    "UPDATE admin_users SET is_active = false WHERE lower(email) = 'profykersha18@gmail.com'",
    "UPDATE admin_users SET email = 'x@example.com' WHERE lower(email) = 'profykersha18@gmail.com'",
    "DELETE FROM admin_users WHERE lower(email) = 'profykersha18@gmail.com'",
])
async def test_database_refuses_bypassing_the_api(client: AsyncClient, admin: dict, sql: str):
    async with get_session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text(sql))
        await db.rollback()


async def test_owner_invite_master_key_only_and_resets_owner(client: AsyncClient, admin: dict, monkeypatch):
    from app.services import admin_auth_service as svc

    captured = {}

    async def fake_send(invite, link, inviter):
        captured["link"] = link
        return True

    monkeypatch.setattr(svc, "_send_invite_email", fake_send)
    # A super admin's session isn't enough; only the master key.
    assert (await client.post("/api/admin/owner-invite", headers=admin["headers"])).status_code == 403
    r = await client.post("/api/admin/owner-invite", headers=admin["master_headers"])
    assert r.status_code == 201, r.text
    assert r.json()["to"] == SUPER_ADMIN_EMAIL and "link" not in r.json()

    try:
        token = _token(captured["link"])
        secret = (await client.post(f"/api/admin/invitations/{token}/mfa")).json()["secret"]
        r = await client.post(f"/api/admin/invitations/{token}/accept",
                              json={"password": "new-owner-pass-1", "otp": current_totp(secret)})
        assert r.status_code == 201, r.text
        assert r.json()["role"] == "super_admin"

        # Old session revoked; new password + MFA required.
        assert (await client.get("/api/admin/auth/me", headers=admin["headers"])).status_code == 401
        r = await client.post("/api/admin/auth/login", json={"email": SUPER_ADMIN_EMAIL, "password": "new-owner-pass-1",
                                                             "otp": current_totp(secret)})
        assert r.status_code == 200, r.text
    finally:
        # Restore the shared fixture's credentials for other tests.
        async with get_session_factory()() as db:
            from app.core.security import hash_secret
            await db.execute(text("UPDATE admin_users SET password = :p, mfa_enabled = false, mfa_secret = NULL "
                                  "WHERE lower(email) = :e"), {"p": hash_secret("password123"), "e": SUPER_ADMIN_EMAIL})
            await db.commit()


async def test_database_refuses_super_admin_invite_for_anyone_else(client: AsyncClient, admin: dict):
    async with get_session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text(
                "INSERT INTO admin_invites (email, name, role, token_hash, expires_at) "
                "VALUES ('x@example.com', 'X', 'super_admin', md5(random()::text), now() + interval '1 day')"))
        await db.rollback()


def test_every_email_is_branded():
    """Raw content passed to the sender is wrapped in the BukkaPay layout, and
    the Supabase auth templates carry the brand plus Supabase's token."""
    from app.integrations import email_brand as eb

    wrapped = eb.layout("<p>hi</p>")
    assert eb.is_branded(wrapped) and "<p>hi</p>" in wrapped
    for name, t in eb.supabase_templates().items():
        assert eb.is_branded(t["content"]), name
        assert "{{ .Token }}" in t["content"], name
        assert t["subject"]


async def test_master_key_is_limited_to_owner_recovery_in_production(client: AsyncClient, admin: dict, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "env", "production")
    for method, path in (("get", "/api/admin/users"), ("get", "/api/admin/admins"), ("post", "/api/admin/setup")):
        r = await getattr(client, method)(path, headers=admin["master_headers"])
        assert r.status_code == 403, (path, r.text)


async def test_only_the_owner_appoints_a_ceo(client: AsyncClient, admin: dict):
    # The master key (no owner session) can't appoint a CEO.
    r = await client.post("/api/admin/invites", json={"email": _email(), "name": "C", "role": "ceo"},
                          headers=admin["master_headers"])
    assert r.status_code == 403 and "owner" in r.json()["error"].lower()
    # The owner can.
    r = await client.post("/api/admin/invites", json={"email": _email(), "name": "C", "role": "ceo"},
                          headers=admin["headers"])
    assert r.status_code == 201, r.text
