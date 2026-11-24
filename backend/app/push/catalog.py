"""What each notification is about: its push category (which preference
switch governs it), where tapping it should open the app, and how urgent it
is. Pure functions, shared by the inbox API and the push sender."""

from urllib.parse import quote

# Categories a user can switch off. "account" (security, verification,
# suspension) has no switch: those alerts are always pushed.
SWITCHABLE = ("money", "cards", "trade", "support", "updates")
CATEGORIES = (*SWITCHABLE, "account")

_BY_RELATED_TYPE = {
    "transfer": "money",
    "refund": "money",
    "payment_request": "money",
    "payment_link": "money",
    "purchase_transaction": "money",
    "card": "cards",
    "issued_card": "cards",
    "escrow": "trade",
    "trade": "trade",
    "support_chat": "support",
    "merchant": "account",
    "kyc": "account",
}

# Android notification channels the app creates (see apps/customer/lib/push.ts).
CHANNEL = {"money": "money", "cards": "money", "account": "security", "trade": "general",
           "support": "general", "updates": "general"}


def category_for(related_type: str | None, type_: str | None = None) -> str:
    if related_type in _BY_RELATED_TYPE:
        return _BY_RELATED_TYPE[related_type]
    # Messages without a subject come from the platform itself (verification,
    # suspension, a note from the team): treat as account notices.
    return "account"


def link_for(related_type: str | None, related_id: str | None, *, wallet_card_id: str | None = None) -> str:
    """App path to open when the notification is tapped. Group-less expo-router
    paths, so the same string works in the native app and on the web."""
    rid = quote(related_id or "", safe="")
    if related_type == "issued_card" and wallet_card_id:
        return f"/card?walletId={quote(wallet_card_id, safe='')}"
    if related_type in ("issued_card", "card"):
        return "/wallet"
    if related_type == "payment_link" and rid:
        return f"/payment-link-detail?id={rid}"
    if related_type == "payment_request":
        return "/request"
    if related_type == "purchase_transaction" and rid:
        return f"/purchase-detail?id={rid}"
    if related_type == "escrow" and rid:
        return f"/escrow-detail?ref={rid}"
    if related_type == "support_chat":
        return "/support-chat"
    if related_type in ("transfer", "refund"):
        return "/transfer"
    return "/notifications"


def is_urgent(category: str) -> bool:
    return category in ("money", "cards", "account")
