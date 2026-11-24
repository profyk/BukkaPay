"""Payment routing: find the approved corridor for a cross-border payment and
check every condition that must hold before money moves. Fails closed."""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.platform import PaymentCorridor, PaymentProvider, Transfer
from app.models.reference import Currency
from app.network import countries

USABLE_CORRIDOR_STATUSES = ("pilot", "active")


async def find_corridor(
    db: AsyncSession, *, from_country: str, to_country: str, from_currency: str, to_currency: str,
) -> PaymentCorridor:
    corridor = (
        await db.execute(
            select(PaymentCorridor).where(
                PaymentCorridor.from_country == from_country,
                PaymentCorridor.to_country == to_country,
                PaymentCorridor.from_currency == from_currency,
                PaymentCorridor.to_currency == to_currency,
            )
        )
    ).scalar_one_or_none()
    if corridor is None or corridor.status not in USABLE_CORRIDOR_STATUSES:
        raise ApiError(
            f"Transfers from {from_country} ({from_currency}) to {to_country} ({to_currency}) "
            "are not available yet",
            status_code=403,
        )
    return corridor


def rate_is_fresh(corridor: PaymentCorridor, now: datetime | None = None) -> bool:
    if corridor.rate is None or corridor.rate_updated_at is None:
        return False
    now = now or datetime.now(UTC)
    return (now - corridor.rate_updated_at).total_seconds() <= corridor.max_rate_age_seconds


async def check_route(db: AsyncSession, corridor: PaymentCorridor, amount: Decimal) -> PaymentProvider:
    """Every gate a corridor must pass to carry `amount` right now."""
    await countries.require_operating(db, corridor.from_country, what="Sending money")
    await countries.require_operating(db, corridor.to_country, what="Receiving money")
    dest_currency = await db.get(Currency, corridor.to_currency)
    if dest_currency is None or not dest_currency.wallet_enabled or dest_currency.status != "active":
        raise ApiError(f"{corridor.to_currency} wallets are not available yet", status_code=403)
    rail = (await rail_candidates(db, corridor) or [None])[0]
    if rail is None:
        raise ApiError("The settlement rail for this corridor is unavailable", status_code=503)
    if amount < corridor.min_amount:
        raise ApiError(f"Minimum transfer is {corridor.from_currency} {corridor.min_amount}")
    if amount > corridor.max_amount:
        raise ApiError(f"Maximum transfer is {corridor.from_currency} {corridor.max_amount}")
    if not rate_is_fresh(corridor):
        raise ApiError("Exchange rates for this corridor are temporarily unavailable", status_code=503)
    return rail


async def rail_candidates(db: AsyncSession, corridor: PaymentCorridor) -> list[PaymentProvider]:
    """Rails to try, best first: the main rail, then the backups, healthy
    ones before degraded ones. Suspended or inactive rails are never used."""
    import uuid

    ids = [corridor.rail_provider_id] if corridor.rail_provider_id else []
    for raw in corridor.fallback_provider_ids or []:
        try:
            pid = uuid.UUID(str(raw))
        except ValueError:
            continue
        if pid not in ids:
            ids.append(pid)
    providers = [p for p in [await db.get(PaymentProvider, i) for i in ids] if p is not None]
    usable = [p for p in providers if p.status in ("active", "degraded")]
    return sorted(usable, key=lambda p: (p.status != "active", usable.index(p)))


async def check_liquidity(db: AsyncSession, corridor: PaymentCorridor, destination_amount: Decimal) -> None:
    """Prefunded corridors can only pay out what the receiving side holds."""
    if corridor.liquidity_limit is None:
        return
    if corridor.settlement_model == "internal_book":
        # How much the destination pool has already fronted (see app.network.treasury).
        from app.ledger import accounts as ledger_accounts

        pool = await ledger_accounts.provider_clearing(db, "book", corridor.to_currency)
        if max(Decimal(pool.balance or 0), Decimal(0)) + destination_amount > corridor.liquidity_limit:
            raise ApiError("This corridor is at capacity right now. Please try again later.", status_code=503)
        return
    outstanding = (
        await db.execute(
            select(func.coalesce(func.sum(Transfer.destination_amount), 0)).where(
                Transfer.corridor_id == corridor.id,
                Transfer.status.in_(("sender_debited", "instructed", "settled")),
            )
        )
    ).scalar_one()
    if Decimal(outstanding) + destination_amount > corridor.liquidity_limit:
        raise ApiError("This corridor is at capacity right now. Please try again later.", status_code=503)
