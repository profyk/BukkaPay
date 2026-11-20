"""Email one-time codes go through Supabase Auth (delivered by Resend SMTP).
Supabase's HTTP API is faked here; the real wire format is in
app/integrations/supabase_auth.py."""

import pytest

from app.integrations import supabase_auth
from tests.conftest import unique_email, unique_username


@pytest.fixture
def fake_supabase(monkeypatch):
    sent: dict[str, str] = {}

    async def send(email: str) -> None:
        sent[email] = "482913"

    async def verify(email: str, code: str) -> bool:
        return sent.get(email) == code

    monkeypatch.setattr(supabase_auth, "is_configured", lambda: True)
    monkeypatch.setattr(supabase_auth, "send_email_otp", send)
    monkeypatch.setattr(supabase_auth, "verify_email_otp", verify)
    return sent


async def _signup(client, email: str) -> None:
    r = await client.post("/api/auth/signup", json={
        "name": "Otp", "email": email, "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 201, r.text


async def test_signup_sends_code_and_verify_signs_in(client, fake_supabase) -> None:
    email = unique_email()
    await _signup(client, email)
    assert email in fake_supabase  # code sent at signup

    r = await client.post("/api/auth/otp/verify", json={"email": email, "code": "000000"})
    assert r.status_code == 401

    r = await client.post("/api/auth/otp/verify", json={"email": email, "code": "482913"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token"] and body["user"]["verified"] is True
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json()["kycLevel"] >= 1


async def test_request_does_not_reveal_unknown_accounts(client, fake_supabase) -> None:
    email = unique_email()
    r = await client.post("/api/auth/otp/request", json={"email": email})
    assert r.status_code == 200 and r.json()["success"] is True
    assert email not in fake_supabase


async def test_request_resends_for_existing_account(client, fake_supabase) -> None:
    email = unique_email()
    await _signup(client, email)
    fake_supabase.clear()
    r = await client.post("/api/auth/otp/request", json={"email": email})
    assert r.status_code == 200
    assert email in fake_supabase


async def test_unconfigured_environment_says_so(client, monkeypatch) -> None:
    monkeypatch.setattr(supabase_auth, "is_configured", lambda: False)
    r = await client.post("/api/auth/otp/request", json={"email": unique_email()})
    assert r.status_code == 503


async def test_codes_cannot_sign_in_a_verified_account(client, fake_supabase) -> None:
    """Codes confirm a new sign-up; they're never a password replacement."""
    email = unique_email()
    await _signup(client, email)
    r = await client.post("/api/auth/otp/verify", json={"email": email, "code": "482913"})
    assert r.status_code == 200  # first confirmation signs in

    fake_supabase.clear()
    r = await client.post("/api/auth/otp/request", json={"email": email})
    assert r.status_code == 200
    assert email not in fake_supabase  # no code sent to a verified account

    fake_supabase[email] = "482913"  # even with a valid code in hand
    r = await client.post("/api/auth/otp/verify", json={"email": email, "code": "482913"})
    assert r.status_code == 400
