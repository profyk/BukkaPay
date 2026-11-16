from __future__ import annotations

import secrets

from app.business.email_verification import build_password_reset_link
from app.core.config import get_settings
from app.integrations.resend_client import send_resend_email

PASSWORD_RESET_TTL_SECONDS = 3600


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
