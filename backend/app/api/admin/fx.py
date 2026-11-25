"""FX desk: the wallet-to-wallet swap rates and spreads (currency_corridors),
the FX pool positions they move, and FX revenue — per currency, never mixed.

Every change is audited with the before/after values. A rate move of more
than 10% in one step is refused unless explicitly confirmed, to stop a typo
(e.g. 0.7 instead of 7.0) from repricing every swap.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.ledger import LedgerAccount
from app.models.wallet import CurrencyCorridor
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-fx"])

MAX_UNCONFIRMED_MOVE = Decimal("0.10")
MAX_SPREAD_PCT = Decimal("5.00")


def _pair(c: CurrencyCorridor) -> dict:
    return {
        "id": str(c.id), "from": c.from_currency, "to": c.to_currency, "rate": str(c.exchange_rate),
        "spreadPct": str(c.fee_percentage), "minAmount": str(c.min_amount), "maxAmount": str(c.max_amount),
        "active": c.is_active,
    }


async def _balances(db: AsyncSession, prefix: str) -> list[dict]:
    rows = (await db.execute(select(LedgerAccount).where(LedgerAccount.code.like(f"{prefix}%")))).scalars()
    return sorted(({"currency": a.currency, "balance": str(a.balance)} for a in rows), key=lambda r: r["currency"])


@router.get("/fx/desk")
async def desk(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    pairs = (await db.execute(select(CurrencyCorridor).order_by(CurrencyCorridor.from_currency,
                                                                 CurrencyCorridor.to_currency))).scalars()
    return {
        "pairs": [_pair(c) for c in pairs],
        # FX pool: what BukkaPay received (+) or paid out (−) in each currency through swaps
        # and cross-currency payments. A large negative position needs rebalancing at a partner.
        "positions": await _balances(db, "fx:position:"),
        "revenue": await _balances(db, "revenue:fx:"),
    }


class PairIn(CamelModel):
    rate: Decimal | None = None
    spread_pct: Decimal | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    active: bool | None = None
    confirm_large_move: bool = False
    reason: str | None = None


def _check(body: PairIn, current_rate: Decimal | None) -> None:
    if body.rate is not None:
        if body.rate <= 0:
            raise ApiError("The rate must be greater than zero")
        if current_rate and abs(body.rate - current_rate) / current_rate > MAX_UNCONFIRMED_MOVE and not body.confirm_large_move:
            raise ApiError(f"That moves the rate by more than 10% (from {current_rate}). Confirm the large move to save it.")
    if body.spread_pct is not None and not (Decimal("0") <= body.spread_pct <= MAX_SPREAD_PCT):
        raise ApiError("The spread must be between 0% and 5%")
    if body.min_amount is not None and body.min_amount <= 0:
        raise ApiError("The minimum must be greater than zero")
    if body.min_amount is not None and body.max_amount is not None and body.max_amount < body.min_amount:
        raise ApiError("The maximum must be at least the minimum")


@router.patch("/fx/pairs/{pair_id}")
async def update_pair(pair_id: str, body: PairIn, ctx: AdminContext = Depends(require("fx.manage")),
                      db: AsyncSession = Depends(get_db)):
    try:
        c = await db.get(CurrencyCorridor, uuid.UUID(pair_id), with_for_update=True)
    except ValueError:
        c = None
    if c is None:
        raise ApiError("Currency pair not found", status_code=404)
    _check(body, c.exchange_rate)
    before = _pair(c)
    if body.rate is not None:
        c.exchange_rate = body.rate
    if body.spread_pct is not None:
        c.fee_percentage = body.spread_pct
    if body.min_amount is not None:
        c.min_amount = body.min_amount
    if body.max_amount is not None:
        c.max_amount = body.max_amount
    if body.active is not None:
        c.is_active = body.active
    if c.max_amount < c.min_amount:
        raise ApiError("The maximum must be at least the minimum")
    from app.services import fx_guard

    await fx_guard.validate_pair_prices(db, c)
    await db.flush()
    await ctx.audit(db, "fx.pair.update", target_type="currency_corridor", target_id=c.id,
                    details={"before": before, "after": _pair(c), "reason": body.reason})
    return _pair(c)


class NewPairIn(PairIn):
    from_currency: str
    to_currency: str


@router.post("/fx/pairs", status_code=201)
async def create_pair(body: NewPairIn, ctx: AdminContext = Depends(require("fx.manage")),
                      db: AsyncSession = Depends(get_db)):
    src, dst = body.from_currency.upper(), body.to_currency.upper()
    if src == dst:
        raise ApiError("Pick two different currencies")
    if body.rate is None:
        raise ApiError("Enter the rate")
    _check(body, None)
    exists = (await db.execute(select(CurrencyCorridor).where(
        CurrencyCorridor.from_currency == src, CurrencyCorridor.to_currency == dst))).scalar_one_or_none()
    if exists:
        raise ApiError(f"{src} → {dst} already exists; edit it instead", status_code=409)
    c = CurrencyCorridor(from_currency=src, to_currency=dst, exchange_rate=body.rate,
                         fee_percentage=body.spread_pct or Decimal("0"), is_active=body.active if body.active is not None else True)
    if body.min_amount is not None:
        c.min_amount = body.min_amount
    if body.max_amount is not None:
        c.max_amount = body.max_amount
    from app.services import fx_guard

    await fx_guard.validate_pair_prices(db, c)
    db.add(c)
    await db.flush()
    await ctx.audit(db, "fx.pair.create", target_type="currency_corridor", target_id=c.id,
                    details={"after": _pair(c), "reason": body.reason})
    return _pair(c)
