"""Signup/login/logout/password-reset — direct port of auth.ts + the
auth-related handlers in routes.ts. Login lockout (10 failed attempts -> 30
minute lock) and password-reset tokens were in-memory Maps in Node; both
move to Redis here so they survive restarts and work across multiple API
worker processes.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.redis import get_redis
from app.core.security import generate_wallet_id, hash_secret, verify_secret
from app.integrations import stitch
from app.models.user import User
from app.models.wallet import WalletCard
from app.services import email_service, session_service

LOGIN_FAIL_TTL_SECONDS = 60 * 60  # 1 hour, matches the old hourly Map purge
LOGIN_LOCK_THRESHOLD = 10
LOGIN_LOCK_SECONDS = 30 * 60
RESET_TOKEN_TTL_SECONDS = 60 * 60


async def signup(db: AsyncSession, *, name: str, email: str, username: str, password: str,
                  phone: str | None, country_code: str | None) -> User:
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
        country_code=country_code,
        wallet_id=generate_wallet_id(),
    )
    db.add(user)
    await db.flush()

    await _issue_default_card(db, user)
    try:
        await email_service.send_account_confirmation_email(user.email, name=user.name)
    except Exception:
        # email delivery should not block onboarding; the user can retry confirmation later
        pass
    return user


async def _issue_default_card(db: AsyncSession, user: User) -> WalletCard:
    card_ref = f"BUKKAPAY-{str(user.id)[:8].upper()}"
    issued = await stitch.issue_virtual_card(user.name, card_ref)
    card = WalletCard(
        user_id=user.id,
        title="\U0001f4b3 BukkaPay",
        balance=Decimal("0.00"),
        currency="ZAR",
        icon="credit-card",
        color="blue",
        card_number=issued.card_number,
        expiry_date=issued.expiry_date,
        cvv=issued.cvv,
        stitch_card_id=issued.stitch_card_id,
        is_default=True,
    )
    db.add(card)
    await db.flush()
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


async def verify_email(db: AsyncSession, *, email: str, token: str) -> User:
    valid = await email_service.verify_account_email(email, token)
    if not valid:
        raise ApiError("Invalid or expired email verification token", status_code=400)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)

    user.verified = True
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
