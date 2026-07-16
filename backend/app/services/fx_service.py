"""Currency-corridor lookups and FX quoting for cross-border transfers.

Fee convention matches the existing admin "Platform Pricing" preview
(pricing.tsx's FeePreview: fee is deducted from the amount the sender
types, not added on top) — so `amount` is exactly what leaves the
sender's card, and the recipient receives `(amount - fee) * rate`.
"""

from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.wallet import CurrencyCorridor


async def get_corridor(db: AsyncSession, from_currency: str, to_currency: str) -> CurrencyCorridor:
    result = await db.execute(
        select(CurrencyCorridor).where(
            CurrencyCorridor.from_currency == from_currency,
            CurrencyCorridor.to_currency == to_currency,
        )
    )
    corridor = result.scalar_one_or_none()
    if corridor is None:
        raise ApiError(f"No corridor configured for {from_currency} → {to_currency}", status_code=404)
    if not corridor.is_active:
        raise ApiError(f"Transfers from {from_currency} to {to_currency} are currently unavailable", status_code=403)
    return corridor


async def quote(db: AsyncSession, from_currency: str, to_currency: str, amount: str) -> dict:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid amount")

    corridor = await get_corridor(db, from_currency, to_currency)
    if parsed_amount < corridor.min_amount:
        raise ApiError(f"Minimum transfer is {corridor.min_amount} {from_currency}")
    if parsed_amount > corridor.max_amount:
        raise ApiError(f"Maximum transfer is {corridor.max_amount} {from_currency}")

    fee = (parsed_amount * corridor.fee_percentage / Decimal(100) + corridor.fee_fixed).quantize(Decimal("0.01"))
    if fee >= parsed_amount:
        raise ApiError("Amount is too small to cover the transfer fee")

    net_source = parsed_amount - fee
    destination_amount = (net_source * corridor.exchange_rate).quantize(Decimal("0.01"))

    return {
        "corridor": corridor,
        "source_amount": parsed_amount,
        "exchange_rate": corridor.exchange_rate,
        "fee": fee,
        "destination_amount": destination_amount,
    }
