from __future__ import annotations

import secrets

from app.business.email_verification import build_email_confirmation_link, build_password_reset_link
from app.core.config import get_settings
from app.core.redis import get_redis
from app.integrations.resend_client import send_resend_email

EMAIL_CONFIRMATION_TTL_SECONDS = 86400
PASSWORD_RESET_TTL_SECONDS = 3600


async def send_account_confirmation_email(email: str, *, name: str | None = None) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        return False

    token = secrets.token_urlsafe(32)
    redis = get_redis()
    await redis.set(f"email-confirm:{email.lower().strip()}", token, ex=EMAIL_CONFIRMATION_TTL_SECONDS)

    confirmation_link = build_email_confirmation_link(token)
    await send_resend_email(
        to=email,
        subject="Confirm your BukkaPay email",
        html=(
            f"<h1>Hello {name or 'there'}!</h1>"
            "<p>Thanks for joining BukkaPay. Please confirm your email to activate your account.</p>"
            f"<p><a href='{confirmation_link}'>Confirm my email</a></p>"
        ),
        text=(
            f"Hello {name or 'there'}!\n\n"
            "Thanks for joining BukkaPay. Please confirm your email to activate your account.\n\n"
            f"{confirmation_link}"
        ),
    )
    return True


async def verify_account_email(email: str, token: str) -> bool:
    redis = get_redis()
    expected_token = await redis.get(f"email-confirm:{email.lower().strip()}")
    if not expected_token:
        return False

    valid = secrets.compare_digest(expected_token, token)
    if valid:
        await redis.delete(f"email-confirm:{email.lower().strip()}")
    return valid


async def send_password_reset_email(email: str, *, token: str | None = None, name: str | None = None) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        return False

    reset_token = token or secrets.token_urlsafe(32)
    reset_link = build_password_reset_link(reset_token)
    await send_resend_email(
        to=email,
        subject="Reset your BukkaPay password",
        html=(
            f"<h1>Hello {name or 'there'}!</h1>"
            "<p>We received a request to reset your BukkaPay password.</p>"
            f"<p><a href='{reset_link}'>Reset my password</a></p>"
        ),
        text=(
            f"Hello {name or 'there'}!\n\n"
            "We received a request to reset your BukkaPay password.\n\n"
            f"{reset_link}"
        ),
    )
    return True
