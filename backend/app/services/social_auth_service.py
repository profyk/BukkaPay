"""Sign in with Google and Sign in with Apple.

Both providers hand the app a signed ID token (a JWT). The backend verifies
the signature against the provider's published keys, the audience against
our own client IDs, and the issuer, then uses only the provider's verified
claims, never anything the client typed, to find or create the account.

Account matching, in order:
1. Apple: the stable Apple subject (`users.apple_sub`), because a customer
   who hides their email gets a relay address that can't be matched otherwise.
2. The provider-verified email, linking the provider to an existing
   password account with that email (the provider has proven ownership).
3. Otherwise a new account. That needs a country of residence and accepted
   terms; without them the API answers 428 so the app can ask for both and
   retry with the same token.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache

import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.security import generate_wallet_id, hash_secret
from app.models.user import User

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# Status the app uses to tell "new account, ask for country and terms" apart
# from a real failure.
NEEDS_PROFILE_STATUS = 428


@dataclass
class VerifiedIdentity:
    provider: str
    subject: str
    email: str
    name: str | None


def _split(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def verify_google(token: str) -> VerifiedIdentity:
    settings = get_settings()
    audiences = _split(settings.google_client_id) + _split(settings.google_client_ids)
    if not audiences:
        raise ApiError("Google sign-in is not configured on this environment", status_code=503)
    try:
        # Android, iOS and web each have their own OAuth client ID, and the
        # token's audience is whichever one the app used.
        payload = google_id_token.verify_token(token, google_requests.Request(), audience=audiences)
    except ValueError as exc:
        raise ApiError("Invalid Google token", status_code=401) from exc
    if payload.get("iss") not in GOOGLE_ISSUERS:
        raise ApiError("Invalid Google token", status_code=401)
    email = (payload.get("email") or "").strip().lower()
    if not email or payload.get("email_verified") is not True:
        raise ApiError("Your Google account email is not verified", status_code=401)
    return VerifiedIdentity("google", str(payload["sub"]), email, payload.get("name"))


GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


async def verify_google_access_token(token: str) -> VerifiedIdentity:
    """The web dashboards use BukkaPay's own Google button (Google's account
    chooser in a popup), which hands back an OAuth access token instead of an
    ID token. Google's tokeninfo endpoint tells us which client the token was
    issued to: only our own client IDs are accepted, so a token minted for
    another site can't be used to sign in here."""
    import httpx

    settings = get_settings()
    audiences = _split(settings.google_client_id) + _split(settings.google_client_ids)
    if not audiences:
        raise ApiError("Google sign-in is not configured on this environment", status_code=503)
    if not token or len(token) > 4096:
        raise ApiError("Invalid Google token", status_code=401)
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            info = await http.get(GOOGLE_TOKENINFO_URL, params={"access_token": token})
            if info.status_code != 200:
                raise ApiError("Invalid Google token", status_code=401)
            claims = info.json()
            name = None
            if claims.get("aud") in audiences or claims.get("azp") in audiences:
                profile = await http.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {token}"})
                if profile.status_code == 200:
                    name = profile.json().get("name")
    except httpx.HTTPError as exc:
        raise ApiError("Couldn't reach Google. Please try again.", status_code=503) from exc
    return identity_from_google_tokeninfo(claims, audiences, name)


def identity_from_google_tokeninfo(claims: dict, audiences: list[str], name: str | None) -> VerifiedIdentity:
    if claims.get("aud") not in audiences and claims.get("azp") not in audiences:
        raise ApiError("Invalid Google token", status_code=401)
    try:
        if int(claims.get("expires_in", "0")) <= 0:
            raise ApiError("Your Google sign-in expired. Please try again.", status_code=401)
    except (TypeError, ValueError) as exc:
        raise ApiError("Invalid Google token", status_code=401) from exc
    email = (claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") not in (True, "true"):
        raise ApiError("Your Google account email is not verified", status_code=401)
    if not claims.get("sub"):
        raise ApiError("Invalid Google token", status_code=401)
    return VerifiedIdentity("google", str(claims["sub"]), email, name)


@lru_cache(maxsize=1)
def _apple_jwks() -> jwt.PyJWKClient:
    # Caches Apple's keys and refetches when a token names an unknown key id.
    return jwt.PyJWKClient(APPLE_KEYS_URL, cache_keys=True, lifespan=6 * 3600)


def verify_apple(token: str, raw_nonce: str | None) -> VerifiedIdentity:
    settings = get_settings()
    audiences = _split(settings.apple_client_ids)
    if not audiences:
        raise ApiError("Apple sign-in is not configured on this environment", status_code=503)
    try:
        key = _apple_jwks().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token, key.key, algorithms=["RS256"], audience=audiences, issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]}, leeway=30,
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise ApiError("Invalid Apple token", status_code=401) from exc
    return identity_from_apple_claims(payload, raw_nonce)


def identity_from_apple_claims(payload: dict, raw_nonce: str | None) -> VerifiedIdentity:
    # The app sends Apple the SHA-256 of a one-time nonce and sends us the
    # raw value, so a stolen identity token can't be replayed by another app.
    token_nonce = payload.get("nonce")
    if token_nonce is not None or raw_nonce is not None:
        expected = hashlib.sha256((raw_nonce or "").encode()).hexdigest()
        if not raw_nonce or not hmac.compare_digest(str(token_nonce or ""), expected):
            raise ApiError("Invalid Apple token", status_code=401)
    email = (payload.get("email") or "").strip().lower()
    verified = payload.get("email_verified") in (True, "true")
    if email and not verified:
        raise ApiError("Your Apple ID email is not verified", status_code=401)
    return VerifiedIdentity("apple", str(payload["sub"]), email, None)


async def sign_in(
    db: AsyncSession, identity: VerifiedIdentity, *, name: str | None,
    residence_country: str | None, accept_terms: bool | None,
    username: str | None = None, phone: str | None = None, app: str | None = None,
) -> User:
    user: User | None = None
    if identity.provider == "apple":
        user = (await db.execute(select(User).where(User.apple_sub == identity.subject))).scalar_one_or_none()
    from app.services.auth_service import ensure_account_allowed, is_admin_email

    if identity.email and await is_admin_email(db, identity.email):
        raise ApiError("This email belongs to a BukkaPay admin account and can't be used here.", status_code=403)
    if user is None and identity.email:
        user = (await db.execute(select(User).where(User.email == identity.email))).scalar_one_or_none()
        if user is not None and identity.provider == "apple":
            if user.apple_sub and user.apple_sub != identity.subject:
                raise ApiError("This email is linked to a different Apple ID", status_code=409)
            user.apple_sub = identity.subject

    if user is None:
        if not identity.email:
            # Apple sends the email only on the very first authorization; a
            # missing one here means the customer must sign in another way once.
            raise ApiError("Apple didn't share an email. Sign up with email first, then link Apple.",
                           status_code=400)
        username = (username or "").strip().lstrip("@")
        phone = normalize_phone(phone)
        if not residence_country or not accept_terms or not username or not phone:
            raise ApiError("New accounts must choose a username, phone number and country, and accept the terms",
                           status_code=NEEDS_PROFILE_STATUS)
        user = await _create(db, identity, name=name, residence_country=residence_country,
                             username=username, phone=phone, app=app)
    else:
        await ensure_account_allowed(db, user, app=app)

    if user.deleted_at is not None:
        raise ApiError("This account has been closed", status_code=403)
    if user.frozen:
        raise ApiError("Your account has been suspended. Please contact support.", status_code=403)
    if not user.verified:
        # The provider proved the email belongs to this person.
        user.verified = True
        user.kyc_level = max(user.kyc_level or 0, 1)
    await db.flush()
    return user


USERNAME_RE = re.compile(r"^[A-Za-z0-9._]{3,30}$")


def normalize_phone(phone: str | None) -> str | None:
    """Digits only (a leading + is dropped); None when blank or implausible."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits if 6 <= len(digits) <= 15 else None


async def _create(db: AsyncSession, identity: VerifiedIdentity, *, name: str | None,
                  residence_country: str, username: str, phone: str, app: str | None = None) -> User:
    from app.governance.account_types import account_type_for_app
    from app.network import countries as country_service
    from app.services.auth_service import _issue_default_card

    country = await country_service.require_operating(db, residence_country, what="BukkaPay")
    if not USERNAME_RE.match(username):
        raise ApiError("Usernames are 3-30 letters, numbers, dots or underscores")
    if (await db.execute(select(User.id).where(User.username == username))).first() is not None:
        raise ApiError("Username already taken")
    user = User(
        name=((name or identity.name or "").strip() or username)[:120],
        email=identity.email,
        username=username,
        # No usable password: social accounts sign in through the provider
        # (or set a password later through "forgot password").
        password=hash_secret(secrets.token_urlsafe(32)),
        phone=phone,
        country_code=country.dial_code,
        residence_country=country.code,
        terms_accepted_at=datetime.now(UTC),
        kyc_level=1,
        wallet_id=generate_wallet_id(),
        verified=True,
        apple_sub=identity.subject if identity.provider == "apple" else None,
        account_type=account_type_for_app(app),
    )
    db.add(user)
    await db.flush()
    await _issue_default_card(db, user, currency=country.default_currency)
    return user
