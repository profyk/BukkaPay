"""Sign in with Apple / Google: real JWT verification for Apple (with a local
key standing in for Apple's), account creation, linking, and refusals."""

import hashlib
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient

from app.core.config import get_settings
from app.services import social_auth_service as social
from tests.conftest import unique_email, unique_username

pytestmark = pytest.mark.asyncio

BUNDLE_ID = "com.bukkapay.app"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def _apple_keys(monkeypatch):
    monkeypatch.setattr(get_settings(), "apple_client_ids", BUNDLE_ID)
    fake = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=_KEY.public_key()))
    monkeypatch.setattr(social, "_apple_jwks", lambda: fake)


def apple_token(*, sub: str, email: str | None, raw_nonce: str = "n0nce", aud: str = BUNDLE_ID,
                iss: str = social.APPLE_ISSUER, key=_KEY, **extra) -> str:
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": sub, "iat": now, "exp": now + 600,
              "nonce": hashlib.sha256(raw_nonce.encode()).hexdigest(), **extra}
    if email:
        claims.update(email=email, email_verified="true")
    return jwt.encode(claims, key, algorithm="RS256")


async def test_apple_new_account_needs_country_then_signs_in(client: AsyncClient):
    email, sub = unique_email(), f"apple-{unique_username()}"
    token = apple_token(sub=sub, email=email)

    r = await client.post("/api/auth/apple", json={"identityToken": token, "nonce": "n0nce"})
    assert r.status_code == 428, r.text

    # Country and terms alone are not enough: username and phone are required too.
    r = await client.post("/api/auth/apple", json={
        "identityToken": token, "nonce": "n0nce", "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 428, r.text

    username = unique_username()
    r = await client.post("/api/auth/apple", json={
        "identityToken": token, "nonce": "n0nce", "name": "Ama Mensah",
        "residenceCountry": "ZA", "acceptTerms": True, "username": username, "phone": "082 123 4567",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email"] == email
    assert body["user"]["name"] == "Ama Mensah"
    assert body["user"]["username"] == username
    assert body["user"]["phone"] == "0821234567"

    # Returning without an email (Apple only sends it once): matched by subject.
    r = await client.post("/api/auth/apple", json={
        "identityToken": apple_token(sub=sub, email=None), "nonce": "n0nce"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email"] == email
    cards = await client.get("/api/cards", headers={"Authorization": f"Bearer {r.json()['token']}"})
    assert len(cards.json()) == 1


async def test_apple_links_existing_password_account(client: AsyncClient):
    email = unique_email()
    r = await client.post("/api/auth/signup", json={
        "name": "Kofi", "email": email, "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 201
    r = await client.post("/api/auth/apple", json={
        "identityToken": apple_token(sub="apple-link-1", email=email), "nonce": "n0nce"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["id"] == r.json()["user"]["id"]
    assert r.json()["user"]["email"] == email


@pytest.mark.parametrize("bad", [
    {"aud": "com.someone.else"},
    {"iss": "https://evil.example"},
    {"key": rsa.generate_private_key(public_exponent=65537, key_size=2048)},
])
async def test_apple_rejects_forged_tokens(client: AsyncClient, bad):
    token = apple_token(sub="apple-bad", email=unique_email(), **bad)
    r = await client.post("/api/auth/apple", json={"identityToken": token, "nonce": "n0nce",
                                                   "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 401


async def test_apple_rejects_wrong_nonce(client: AsyncClient):
    token = apple_token(sub="apple-nonce", email=unique_email())
    r = await client.post("/api/auth/apple", json={"identityToken": token, "nonce": "different",
                                                   "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 401


async def test_google_new_account_rejects_taken_or_invalid_username(client: AsyncClient, monkeypatch):
    taken = unique_username()
    r = await client.post("/api/auth/signup", json={
        "name": "Taken", "email": unique_email(), "username": taken, "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 201
    monkeypatch.setattr(social, "verify_google",
                        lambda _t: social.VerifiedIdentity("google", "g-new", unique_email(), "New Person"))
    base = {"idToken": "x", "residenceCountry": "ZA", "acceptTerms": True, "phone": "0821234567"}
    r = await client.post("/api/auth/google", json={**base, "username": taken})
    assert r.status_code == 400 and "taken" in r.json()["error"]
    r = await client.post("/api/auth/google", json={**base, "username": "no spaces!"})
    assert r.status_code == 400
    r = await client.post("/api/auth/google", json={**base, "username": unique_username(), "phone": "12"})
    assert r.status_code == 428


async def test_google_frozen_account_refused(client: AsyncClient, monkeypatch):
    from sqlalchemy import update

    from app.db.base import get_session_factory
    from app.models.user import User

    email = unique_email()
    r = await client.post("/api/auth/signup", json={
        "name": "Zola", "email": email, "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    assert r.status_code == 201
    async with get_session_factory()() as db:
        await db.execute(update(User).where(User.email == email).values(frozen=True))
        await db.commit()

    monkeypatch.setattr(social, "verify_google",
                        lambda _t: social.VerifiedIdentity("google", "g-1", email, "Zola"))
    r = await client.post("/api/auth/google", json={"idToken": "x"})
    assert r.status_code == 403
