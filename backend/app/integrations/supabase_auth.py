"""Email one-time codes through Supabase Auth.

Supabase generates the code and sends it through the project's SMTP
settings. Configure Resend as that SMTP provider in the Supabase dashboard
(Authentication → Emails → SMTP Settings: smtp.resend.com, port 465, user
"resend", password = a Resend API key, sender on a verified domain), and put
``{{ .Token }}`` in the "Magic Link" email template so the email carries a
6-digit code rather than a link.

The backend talks to Supabase server-side, so the app only ever sees
BukkaPay's own session token, and BukkaPay decides what a verified code
grants.
"""

import httpx

from app.core.config import get_settings


class SupabaseAuthUnavailable(Exception):
    """Supabase URL/key not configured."""


def is_configured() -> bool:
    s = get_settings()
    return bool(s.supabase_url and (s.supabase_anon_key or s.supabase_service_role_key))


def _endpoint(path: str) -> tuple[str, dict]:
    s = get_settings()
    if not is_configured():
        raise SupabaseAuthUnavailable("Supabase Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)")
    key = s.supabase_anon_key or s.supabase_service_role_key
    return f"{s.supabase_url.rstrip('/')}/auth/v1/{path}", {"apikey": key, "Authorization": f"Bearer {key}"}


async def send_email_otp(email: str) -> None:
    """Ask Supabase to email a one-time code. `create_user` lets Supabase keep
    its own auth record for the address; BukkaPay accounts stay in our DB."""
    url, headers = _endpoint("otp")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, headers=headers, json={"email": email, "create_user": True})
    if r.status_code == 429:
        raise RuntimeError("rate_limited")
    r.raise_for_status()


async def verify_email_otp(email: str, code: str) -> bool:
    """True only if Supabase accepts the code for this email."""
    url, headers = _endpoint("verify")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(url, headers=headers, json={"type": "email", "email": email, "token": code})
    if r.status_code >= 500:
        r.raise_for_status()
    if r.status_code != 200:
        return False
    user = (r.json() or {}).get("user") or {}
    return (user.get("email") or "").lower() == email.lower()
