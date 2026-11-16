"""Executable FX quotes. A quote fixes the rate, fee and exact amounts for
a short time; the customer confirms the quote, never a raw amount, so what
they saw is exactly what executes. Stale rates are refused."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.platform import FxQuote, PaymentCorridor
from app.network import fees, routing

CENT = Decimal("0.01")


def effective_rate(corridor: PaymentCorridor) -> Decimal:
    rate = Decimal(corridor.rate)
    if corridor.fx_markup_bps:
        rate = rate * (Decimal(1) - Decimal(corridor.fx_markup_bps) / Decimal(10000))
    return rate.quantize(Decimal("0.00000001"))


async def create_quote(
    db: AsyncSession, *, user_id: uuid.UUID, corridor: PaymentCorridor, source_amount: Decimal,
) -> FxQuote:
    await routing.check_route(db, corridor, source_amount)
    fee = await fees.compute(
        db, "cross_border", source_amount, currency=corridor.from_currency,
        country=corridor.from_country, corridor_id=corridor.id,
    )
    if fee.fee >= source_amount:
        raise ApiError("Amount is too small to cover the transfer fee")
    rate = effective_rate(corridor)
    destination = ((source_amount - fee.fee) * rate).quantize(CENT, rounding=ROUND_DOWN)
    if destination <= 0:
        raise ApiError("Amount is too small for this corridor")
    await routing.check_liquidity(db, corridor, destination)
    now = datetime.now(UTC)
    quote = FxQuote(
        user_id=user_id, corridor_id=corridor.id, product="cross_border",
        from_currency=corridor.from_currency, to_currency=corridor.to_currency,
        source_amount=source_amount, fee=fee.fee, rate=rate, destination_amount=destination,
        fee_breakdown={**fee.breakdown, "markup_bps": corridor.fx_markup_bps, "provider_rate": str(corridor.rate)},
        rate_timestamp=corridor.rate_updated_at, expires_at=now + timedelta(seconds=corridor.quote_ttl_seconds),
        status="open",
    )
    db.add(quote)
    await db.flush()
    return quote


async def consume_quote(db: AsyncSession, quote_id: str, user_id: uuid.UUID) -> FxQuote:
    try:
        qid = uuid.UUID(str(quote_id))
    except ValueError as e:
        raise ApiError("Quote not found", status_code=404) from e
    quote = (
        await db.execute(
            select(FxQuote).where(FxQuote.id == qid).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if quote is None or quote.user_id != user_id:
        raise ApiError("Quote not found", status_code=404)
    if quote.status == "used":
        raise ApiError("This quote has already been used", status_code=409)
    if quote.status == "expired" or quote.expires_at <= datetime.now(UTC):
        quote.status = "expired"
        await db.flush()
        raise ApiError("This quote has expired. Please get a new quote.", status_code=410)
    quote.status = "used"
    await db.flush()
    return quote
