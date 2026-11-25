"""Money at the provider boundary: integer minor units + ISO 4217 code.

The ledger stores exact decimals (NUMERIC(14,2)); providers, webhooks,
quotes and the new provider tables use integer minor units. Conversion is
exact both ways and refuses anything that would round. No floats, ever.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

# ISO 4217 exponents for the currencies we hold, plus common payout
# currencies. Unknown codes are refused rather than guessed.
EXPONENT: dict[str, int] = {
    "USD": 2, "ZAR": 2, "BWP": 2, "ZWG": 2, "ZMW": 2, "NAD": 2, "MZN": 2, "KES": 2, "NGN": 2, "GHS": 2,
    "UGX": 0, "RWF": 0, "XOF": 0, "XAF": 0, "TZS": 2, "MWK": 2, "LSL": 2, "SZL": 2, "EUR": 2, "GBP": 2,
}


class MoneyError(ValueError):
    pass


def exponent(currency: str) -> int:
    try:
        return EXPONENT[currency.upper()]
    except KeyError as e:
        raise MoneyError(f"Unsupported currency {currency!r}") from e


@dataclass(frozen=True, slots=True)
class Minor:
    """An amount in minor units (cents, thebe…) of `currency`."""

    amount: int
    currency: str

    def __post_init__(self) -> None:
        if not isinstance(self.amount, int) or isinstance(self.amount, bool):
            raise MoneyError("Minor amounts must be integers")
        if len(self.currency) != 3 or not self.currency.isupper():
            raise MoneyError(f"Invalid currency code {self.currency!r}")
        exponent(self.currency)

    @classmethod
    def from_decimal(cls, value: Decimal | str | int, currency: str) -> Minor:
        if isinstance(value, float):
            raise MoneyError("Floats are not allowed for money")
        d = Decimal(str(value))
        scaled = d.scaleb(exponent(currency))
        if scaled != scaled.to_integral_value():
            raise MoneyError(f"{d} {currency} has more precision than the currency allows")
        return cls(int(scaled), currency.upper())

    def to_decimal(self) -> Decimal:
        return Decimal(self.amount).scaleb(-exponent(self.currency)).quantize(Decimal(1).scaleb(-exponent(self.currency)))

    def __add__(self, other: Minor) -> Minor:
        self._same(other)
        return Minor(self.amount + other.amount, self.currency)

    def __sub__(self, other: Minor) -> Minor:
        self._same(other)
        return Minor(self.amount - other.amount, self.currency)

    def _same(self, other: Minor) -> None:
        if other.currency != self.currency:
            raise MoneyError(f"Currency mismatch {self.currency} vs {other.currency}")

    def __str__(self) -> str:
        return f"{self.to_decimal()} {self.currency}"


def apply_bps(amount: int, bps: int) -> int:
    """`amount × bps / 10 000`, rounded half-up to a whole minor unit."""
    q, r = divmod(amount * bps, 10_000)
    return q + (1 if r * 2 >= 10_000 else 0)


def convert(amount: Minor, rate: Decimal, to_currency: str) -> Minor:
    """Convert at `rate` (units of `to_currency` per 1 unit of `amount`),
    rounding down to a whole minor unit so we never pay out more than quoted."""
    from decimal import ROUND_DOWN

    target = (amount.to_decimal() * Decimal(rate)).quantize(Decimal(1).scaleb(-exponent(to_currency)), rounding=ROUND_DOWN)
    return Minor.from_decimal(target, to_currency)
