import hashlib
from decimal import Decimal

SUPPORTED_CURRENCIES = ("USD", "ZAR", "BWP")


def is_supported_currency(code: str | None) -> bool:
    return bool(code and code.upper() in SUPPORTED_CURRENCIES)


def normalize_currency(code: str | None) -> str | None:
    if not code:
        return None
    normalized = code.strip().upper()
    if normalized in SUPPORTED_CURRENCIES:
        return normalized
    return None


def validate_ledger_entry(*, amount: Decimal | str | float, currency: str | None, balance_before: Decimal | str | float, balance_after: Decimal | str | float) -> bool:
    normalized_currency = normalize_currency(currency)
    if not normalized_currency:
        return False
    try:
        amount_value = Decimal(str(amount))
        before_value = Decimal(str(balance_before))
        after_value = Decimal(str(balance_after))
    except Exception:
        return False

    if amount_value <= 0:
        return False
    if before_value < 0 or after_value < 0:
        return False
    return before_value + amount_value == after_value or before_value - amount_value == after_value


def compute_ledger_hash(transaction_id: str, amount: Decimal | str, currency: str, balance_before: Decimal | str, balance_after: Decimal | str) -> str:
    h = hashlib.sha256()
    h.update(str(transaction_id).encode("utf-8"))
    h.update(str(amount).encode("utf-8"))
    h.update(str(currency).encode("utf-8"))
    h.update(str(balance_before).encode("utf-8"))
    h.update(str(balance_after).encode("utf-8"))
    return h.hexdigest()
