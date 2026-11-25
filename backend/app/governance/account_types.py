"""Personal vs Business accounts, and which app each may use.

- Personal accounts use the BukkaPay app (app.bukkapay.com and mobile).
- Business accounts use the merchant dashboard (merchant.bukkapay.com).
- Admin accounts are separate people entirely (admin_users): an admin's
  email can never be a Personal or Business account, and vice versa.

Every signed-in request is checked against the route it calls
(`required_account_type`), so a token from one kind of account is useless on
the other kind's routes even if someone copies it between apps.
"""

import re

PERSONAL = "personal"
BUSINESS = "business"
ACCOUNT_TYPES = (PERSONAL, BUSINESS)

# The app a sign-in comes from decides the account type it may sign in to.
APP_ACCOUNT_TYPE = {"customer": PERSONAL, "merchant": BUSINESS}

APP_HOME = {PERSONAL: "app.bukkapay.com", BUSINESS: "merchant.bukkapay.com"}

# Routes that only Business accounts may call.
_BUSINESS_ROUTES = [re.compile(p) for p in (
    r"^/api/merchants(/|$)",
    r"^/api/merchant-memberships(/|$)",
    r"^/api/billing-links(/|$)",
)]

# Routes both kinds of account use (signing in, profile, uploads).
_SHARED_ROUTES = [re.compile(p) for p in (
    r"^/api/auth(/|$)",
    r"^/api/upload(/|$)",
    r"^/api/public(/|$)",
    r"^/api/account(/|$)",  # account deletion: personal and business accounts alike
    r"^/api/support(/|$)",  # help desk tickets
    r"^/api/support-chat(/|$)",
)]


def _normalize(path: str) -> str:
    return re.sub(r"^/api/v1(/|$)", r"/api\1", path)


def required_account_type(path: str) -> str | None:
    """The account type a signed-in route needs; None if either may use it."""
    p = _normalize(path)
    if any(r.match(p) for r in _SHARED_ROUTES):
        return None
    if any(r.match(p) for r in _BUSINESS_ROUTES):
        return BUSINESS
    return PERSONAL


def wrong_app_message(account_type: str) -> str:
    if account_type == BUSINESS:
        return f"This is a BukkaPay Business account. Sign in at {APP_HOME[BUSINESS]}."
    return f"This is a personal BukkaPay account. Sign in in the BukkaPay app ({APP_HOME[PERSONAL]})."


def account_type_for_app(app: str | None) -> str:
    return APP_ACCOUNT_TYPE.get((app or "customer").strip().lower(), PERSONAL)
