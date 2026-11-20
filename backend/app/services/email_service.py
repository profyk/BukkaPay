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
    from app.integrations import email_brand as eb

    content = (
        eb.heading("Reset your password")
        + eb.paragraph(f"Hello {eb.esc(name or 'there')},")
        + eb.paragraph("We received a request to reset your BukkaPay password. Choose a new one here:")
        + eb.button("Reset my password", reset_link)
        + eb.note("This link expires in 1 hour. If you didn't ask for it, ignore this email &mdash; "
                  "your password won't change.")
    )
    await send_resend_email(
        to=email,
        subject="Reset your BukkaPay password",
        html=eb.layout(content, preheader="Reset your BukkaPay password"),
        text=(
            f"Hello {name or 'there'}!\n\n"
            "We received a request to reset your BukkaPay password.\n\n"
            f"{reset_link}"
        ),
    )
    return True
