"""Signup/login/logout/password-reset — direct port of auth.ts + the
auth-related handlers in routes.ts. Login lockout (10 failed attempts -> 30
minute lock) and password-reset tokens were in-memory Maps in Node; both
move to Redis here so they survive restarts and work across multiple API
worker processes.
"""

import secrets
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.logging import log
from app.core.redis import get_redis
from app.core.security import generate_wallet_id, hash_secret, verify_secret
from app.models.user import User
from app.models.wallet import WalletCard
from app.services import email_service, session_service

LOGIN_FAIL_TTL_SECONDS = 60 * 60  # 1 hour, matches the old hourly Map purge
LOGIN_LOCK_THRESHOLD = 10
LOGIN_LOCK_SECONDS = 30 * 60
RESET_TOKEN_TTL_SECONDS = 60 * 60


async def signup(db: AsyncSession, *, name: str, email: str, username: str, password: str,
                  phone: str | None, country_code: str | None, residence_country: str,
                  accept_terms: bool, preferred_language: str = "en", app: str | None = None) -> User:
    from datetime import UTC, datetime

    from app.network import countries as country_service

    if not accept_terms:
        raise ApiError("You must accept the Terms of Service and Privacy Policy")
    country = await country_service.require_operating(db, residence_country, what="BukkaPay")
    email = email.strip().lower()
    if await is_admin_email(db, email):
        raise ApiError("This email belongs to a BukkaPay admin account and can't be used here.", status_code=403)
    existing_email = await db.execute(select(User).where(User.email == email))
    if existing_email.scalar_one_or_none() is not None:
        raise ApiError("Email already registered")

    existing_username = await db.execute(select(User).where(User.username == username))
    if existing_username.scalar_one_or_none() is not None:
        raise ApiError("Username already taken")

    if len(password) < 8:
        raise ApiError("Password must be at least 8 characters")

    user = User(
        name=name,
        email=email,
        username=username,
        password=hash_secret(password),
        phone=phone,
        country_code=country_code or country.dial_code,
        residence_country=country.code,
        preferred_language=preferred_language,
        account_type=_account_type(app),
        terms_accepted_at=datetime.now(UTC),
        kyc_level=0,
        wallet_id=generate_wallet_id(),
    )
    db.add(user)
    await db.flush()

    await _issue_default_card(db, user, currency=country.default_currency)
    try:
        await send_email_code(user.email)
    except Exception:
        # Email delivery must not block onboarding; the app offers "resend code".
        log.warning("signup_email_code_failed", user_id=str(user.id))
    return user


async def _issue_default_card(db: AsyncSession, user: User, *, currency: str) -> WalletCard:
    from app.reference import currencies

    await currencies.require_wallet_currency(db, currency)
    card = WalletCard(
        user_id=user.id,
        title="\U0001f4b3 BukkaPay",
        balance=Decimal("0.00"),
        currency=currency,
        icon="credit-card",
        color="blue",
        is_default=True,
    )
    db.add(card)
    await db.flush()
    from app.cards import service as card_service

    await card_service.request_card(db, card)
    return card


async def login(db: AsyncSession, *, email: str, password: str) -> tuple[User, bool]:
    email_key = email.lower()
    redis = get_redis()

    lock_ttl = await redis.ttl(f"login_lock:{email_key}")
    if lock_ttl and lock_ttl > 0:
        minutes_left = -(-lock_ttl // 60)  # ceil
        raise ApiError(
            f"Account locked due to too many failed attempts. Try again in {minutes_left} minute(s).",
            status_code=429,
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    valid, needs_rehash = (False, False)
    if user is not None and user.password:
        valid, needs_rehash = verify_secret(password, user.password)

    if not valid:
        fail_count = await redis.incr(f"login_fail:{email_key}")
        if fail_count == 1:
            await redis.expire(f"login_fail:{email_key}", LOGIN_FAIL_TTL_SECONDS)
        if fail_count >= LOGIN_LOCK_THRESHOLD:
            await redis.set(f"login_lock:{email_key}", "1", ex=LOGIN_LOCK_SECONDS)
        raise ApiError("Invalid email or password", status_code=401)

    await redis.delete(f"login_fail:{email_key}", f"login_lock:{email_key}")

    if user.frozen:
        raise ApiError("Your account has been suspended. Please contact support.", status_code=403)

    if needs_rehash:
        user.password = hash_secret(password)
        await db.flush()

    return user, needs_rehash


async def create_session_for_user(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, datetime]:
    return await session_service.issue_session(db, user_id)


async def logout(db: AsyncSession, token: str) -> None:
    await session_service.revoke_session(db, token)


async def request_password_reset(db: AsyncSession, email: str) -> None:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return  # never reveal whether the email exists

    reset_token = secrets.token_hex(32)
    redis = get_redis()
    await redis.set(f"pwreset:{reset_token}", str(user.id), ex=RESET_TOKEN_TTL_SECONDS)
    try:
        await email_service.send_password_reset_email(user.email, token=reset_token, name=user.name)
    except Exception:
        # reset emails are operationally optional; the long-lived token still exists for API-based retries
        pass


async def send_email_code(email: str) -> None:
    """One-time email code via Supabase Auth (SMTP = Resend)."""
    from app.integrations import supabase_auth

    if not supabase_auth.is_configured():
        return
    try:
        await supabase_auth.send_email_otp(email.strip().lower())
    except RuntimeError as e:
        if str(e) == "rate_limited":
            raise ApiError("Please wait a minute before requesting another code", status_code=429) from e
        raise


async def verify_email(db: AsyncSession, *, email: str, token: str) -> User:
    from app.integrations import supabase_auth

    email = email.strip().lower()
    if not supabase_auth.is_configured():
        raise ApiError("Email codes are not configured on this environment", status_code=503)
    code = token.strip()
    if not (code.isdigit() and 6 <= len(code) <= 10) or not await supabase_auth.verify_email_otp(email, code):
        raise ApiError("Invalid or expired code", status_code=401)

    result = await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    user.verified = True
    user.kyc_level = max(user.kyc_level or 0, 1)
    await db.flush()
    return user


async def reset_password(db: AsyncSession, *, token: str, password: str) -> None:
    if len(password) < 8:
        raise ApiError("Password must be at least 8 characters")

    redis = get_redis()
    user_id_raw = await redis.get(f"pwreset:{token}")
    if not user_id_raw:
        raise ApiError("Invalid or expired reset token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id_raw)))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    user.password = hash_secret(password)
    await db.flush()

    await redis.delete(f"pwreset:{token}")
    await session_service.revoke_all_sessions_for_user(db, user.id)


async def update_profile(
    db: AsyncSession, user_id: uuid.UUID, *, name: str | None, phone: str | None, avatar: str | None
) -> User:
    if not name and not phone and not avatar:
        raise ApiError("At least one field (name, phone, or avatar) is required")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    if name:
        user.name = name
    if phone:
        user.phone = phone
    if avatar:
        user.avatar = avatar
    await db.flush()
    return user



async def is_admin_email(db: AsyncSession, email: str) -> bool:
    from app.models.admin import AdminUser

    email = (email or "").strip().lower()
    return (await db.execute(select(AdminUser.id).where(AdminUser.email == email))).first() is not None


async def ensure_account_allowed(db: AsyncSession, user: User, *, app: str | None) -> None:
    """Refuse sign-in from the wrong app, and for admin emails."""
    from app.governance.account_types import account_type_for_app, wrong_app_message

    if await is_admin_email(db, user.email):
        raise ApiError("This email belongs to a BukkaPay admin account and can't be used here.", status_code=403)
    if user.account_type != account_type_for_app(app):
        raise ApiError(wrong_app_message(user.account_type), status_code=403)
    # The customer's country must be open (or suspended: they can still reach their money).
    from app.network import countries as country_service

    await country_service.require_sign_in_allowed(db, user.residence_country)


def _account_type(app: str | None) -> str:
    from app.governance.account_types import account_type_for_app

    return account_type_for_app(app)
