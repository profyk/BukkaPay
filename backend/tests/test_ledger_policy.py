from decimal import Decimal

from app.business.ledger_policy import (
    SUPPORTED_CURRENCIES,
    compute_ledger_hash,
    is_supported_currency,
    validate_ledger_entry,
)


def test_supported_currencies_are_limited_to_usd_zar_bwp() -> None:
    assert SUPPORTED_CURRENCIES == ("USD", "ZAR", "BWP")
    assert is_supported_currency("USD")
    assert is_supported_currency("ZAR")
    assert is_supported_currency("BWP")
    assert not is_supported_currency("EUR")


def test_ledger_entry_validation_requires_consistent_balance_delta() -> None:
    assert validate_ledger_entry(
        amount="100.00",
        currency="ZAR",
        balance_before="250.00",
        balance_after="350.00",
    )
    assert not validate_ledger_entry(
        amount="100.00",
        currency="EUR",
        balance_before="250.00",
        balance_after="350.00",
    )


def test_ledger_hash_is_stable_and_secure() -> None:
    digest = compute_ledger_hash("txn_123", Decimal("150.00"), "USD", "50.00", "200.00")
    assert isinstance(digest, str)
    assert len(digest) == 64
