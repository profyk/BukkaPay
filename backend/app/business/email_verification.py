from urllib.parse import quote

from app.core.config import get_settings


def build_email_confirmation_link(token: str, path: str = "/verify-email") -> str:
    settings = get_settings()
    base_url = settings.app_url.rstrip("/")
    return f"{base_url}{path}?token={quote(token, safe='')}"


def build_password_reset_link(token: str, path: str = "/reset-password") -> str:
    settings = get_settings()
    base_url = settings.app_url.rstrip("/")
    return f"{base_url}{path}?token={quote(token, safe='')}"
