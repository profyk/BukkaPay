"""FX protections: currency swaps always earn BukkaPay a margin and can't be
used to farm money from rate moves.

1. Spread floor: every swap pays at least `min_spread_bps`, even if a pair
   was configured at 0%.
2. Fresh rates only: a pair whose rate is older than `max_rate_age_hours`
   is paused until treasury updates it (markets move; stale rates leak).
3. No profitable round trip: if A→B then B→A at today's rates and spreads
   would give back more than went in, the swap is refused (and the FX desk
   refuses to save such rates).
4. Reverse-swap cap: converting money back within `reverse_window_hours` of
   the opposite swap is capped at the rate the customer originally paid —
   they can undo a swap, but never profit from a market move against us.
5. Daily limit: at most `max_swaps_per_day` swaps per customer per 24h.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.logging import log
from app.models.ledger import JournalEntry
from app.models.wallet import CurrencyCorridor


async def policy(db: AsyncSession) -> dict:
    from app.pricing.service import get_setting

    return await get_setting(db, "fx")


def effective_pct(pair_pct, pol: dict) -> Decimal:
    return max(Decimal(pair_pct or 0), Decimal(pol["min_spread_bps"]) / 100)


def check_fresh(pair: CurrencyCorridor, pol: dict, *, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    stamp = pair.updated_at or pair.created_at
    if stamp and now - stamp > timedelta(hours=pol["max_rate_age_hours"]):
        raise ApiError(f"{pair.from_currency} → {pair.to_currency} rates are being updated. Please try again shortly.",
                       status_code=409)


async def round_trip_factor(db: AsyncSession, src: str, dst: str, rate: Decimal, pct: Decimal, pol: dict) -> Decimal | None:
    """What 1 unit of `src` becomes after src→dst→src at current prices
    (None if there's no reverse pair). Must stay below 1."""
    back = (await db.execute(select(CurrencyCorridor).where(
        CurrencyCorridor.from_currency == dst, CurrencyCorridor.to_currency == src,
        CurrencyCorridor.is_active.is_(True)))).scalars().first()
    if back is None or not back.exchange_rate:
        return None
    return (Decimal(rate) * (1 - Decimal(pct) / 100)
            * Decimal(back.exchange_rate) * (1 - effective_pct(back.fee_percentage, pol) / 100))


async def check_round_trip(db: AsyncSession, src: str, dst: str, rate: Decimal, pct: Decimal, pol: dict) -> None:
    f = await round_trip_factor(db, src, dst, rate, pct, pol)
    if f is not None and f >= 1:
        log.error("fx_round_trip_profitable", pair=f"{src}{dst}", factor=str(f))
        raise ApiError(f"{src} → {dst} is paused while rates are corrected.", status_code=409)


async def _recent_swaps(db: AsyncSession, user_id, since: datetime):
    return (await db.execute(select(JournalEntry.details).where(
        JournalEntry.kind == "currency_swap", JournalEntry.posted_at >= since,
        JournalEntry.details["user_id"].astext == str(user_id)))).scalars().all()


async def user_limits(db: AsyncSession, user_id, src: str, dst: str, pol: dict) -> tuple[Decimal | None, str | None]:
    """Daily cap, and the reverse-swap rate cap (dst per src) if any."""
    now = datetime.now(UTC)
    day = await _recent_swaps(db, user_id, now - timedelta(hours=24))
    if len(day) >= pol["max_swaps_per_day"]:
        raise ApiError(f"You've reached today's limit of {pol['max_swaps_per_day']} currency swaps. Try again tomorrow.",
                       status_code=429)
    window = await _recent_swaps(db, user_id, now - timedelta(hours=pol["reverse_window_hours"]))
    paid_dst = got_src = Decimal(0)
    for d in window:
        if d.get("from_currency") == dst and d.get("to_currency") == src and d.get("amount") and d.get("receive"):
            paid_dst += Decimal(d["amount"])
            got_src += Decimal(d["receive"])
    if got_src > 0:
        return paid_dst / got_src, (f"You converted {dst} to {src} in the last {pol['reverse_window_hours']} hours, "
                                    "so converting back is capped at the rate you paid.")
    return None, None


async def validate_pair_prices(db: AsyncSession, pair: CurrencyCorridor) -> None:
    """FX desk: refuse rates/spreads that would make a round trip pay out."""
    pol = await policy(db)
    f = await round_trip_factor(db, pair.from_currency, pair.to_currency, Decimal(pair.exchange_rate),
                                effective_pct(pair.fee_percentage, pol), pol)
    if f is not None and f >= 1:
        raise ApiError(f"With these prices, {pair.from_currency} → {pair.to_currency} → {pair.from_currency} would give "
                       f"customers {((f - 1) * 100):.3f}% more than they started with. Lower the rate or raise a spread.",
                       status_code=409)


async def swap_count_today(db: AsyncSession, user_id) -> int:
    return (await db.execute(select(func.count()).select_from(JournalEntry).where(
        JournalEntry.kind == "currency_swap", JournalEntry.posted_at >= datetime.now(UTC) - timedelta(hours=24),
        JournalEntry.details["user_id"].astext == str(user_id)))).scalar_one()
