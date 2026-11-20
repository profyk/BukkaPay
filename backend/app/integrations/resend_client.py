from __future__ import annotations

import httpx

from app.core.config import get_settings


async def send_resend_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str,
    from_name: str = "BukkaPay",
) -> dict:
    settings = get_settings()
    if not settings.resend_api_key or not settings.resend_from_email:
        return {"status": "skipped"}

    # Every BukkaPay email is branded: anything not already in the layout is
    # wrapped in it here, so no sender can skip it.
    from app.integrations.email_brand import is_branded, layout

    if not is_branded(html):
        html = layout(html, preheader=subject)

    payload = {
        "from": f"{from_name} <{settings.resend_from_email}>",
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.is_error:
        raise RuntimeError(f"Resend email failed: {response.text}")

    return response.json()
