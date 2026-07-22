"""Transaction PIN — a 4-6 digit code the user sets from their profile and
must re-enter to authorize any payment or transfer, enforced server-side
(not just a client-side prompt a modified client could skip) on every
money-moving endpoint. Hashed with the same bcrypt path as the login
password (app.core.security), with failed-attempt lockout so a stolen
session token alone can't be used to brute-force it.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.models.user import User

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
PIN_PATTERN = re.compile(r"^\d{4,6}$")


def _validate_pin_format(pin: str) -> None:
    if not PIN_PATTERN.match(pin):
        raise ApiError("PIN must be 4 to 6 digits")


async def _get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)
    return user


async def get_status(db: AsyncSession, user_id: uuid.UUID) -> dict:
    user = await _get_user(db, user_id)
    locked = bool(user.pin_locked_until and user.pin_locked_until > datetime.now(UTC))
    return {
        "has_pin": user.transaction_pin is not None,
        "locked": locked,
        "locked_until": user.pin_locked_until if locked else None,
    }


async def set_pin(db: AsyncSession, user_id: uuid.UUID, *, new_pin: str, current_pin: str | None) -> None:
    _validate_pin_format(new_pin)
    user = await _get_user(db, user_id)

    if user.transaction_pin is not None:
        if not current_pin:
            raise ApiError("Current PIN is required to change your PIN")
        valid, _ = verify_secret(current_pin, user.transaction_pin)
        if not valid:
            raise ApiError("Current PIN is incorrect", status_code=401)

    user.transaction_pin = hash_secret(new_pin)
    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    await db.flush()


async def verify_pin(db: AsyncSession, user_id: uuid.UUID, pin: str | None) -> None:
    """Raises ApiError if the PIN is missing, wrong, not set, or the account
    is locked out from too many recent failures. Call this at the top of
    every payment/transfer service function, before any balance changes."""
    user = await _get_user(db, user_id)

    if user.transaction_pin is None:
        raise ApiError("Set a transaction PIN in your profile before making payments", status_code=403)

    now = datetime.now(UTC)
    if user.pin_locked_until and user.pin_locked_until > now:
        minutes_left = max(1, int((user.pin_locked_until - now).total_seconds() // 60) + 1)
        raise ApiError(f"Too many incorrect PIN attempts. Try again in {minutes_left} minute(s).", status_code=423)

    if not pin:
        raise ApiError("Transaction PIN is required", status_code=400)

    valid, _ = verify_secret(pin, user.transaction_pin)
    if not valid:
        user.pin_failed_attempts += 1
        if user.pin_failed_attempts >= MAX_FAILED_ATTEMPTS:
            user.pin_locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            user.pin_failed_attempts = 0
            await db.flush()
            raise ApiError(f"Too many incorrect PIN attempts. Try again in {LOCKOUT_MINUTES} minutes.", status_code=423)
        await db.flush()
        remaining = MAX_FAILED_ATTEMPTS - user.pin_failed_attempts
        raise ApiError(f"Incorrect PIN. {remaining} attempt(s) remaining.", status_code=401)

    user.pin_failed_attempts = 0
    user.pin_locked_until = None
    await db.flush()
