"""swapCurrency: move money between a customer's own wallets (ZAR ⇄ BWP ⇄
USD) at the published rate plus a configurable spread.

Rates and spreads come from `currency_corridors` (admin-managed): rate =
`exchange_rate` (1 unit of from_currency in to_currency), spread =
`fee_percentage`. The spread is taken in the currency received and booked to
SYS_REVENUE_FX_<to>. Each currency balances on its own through the FX pools:

    from-currency:  Dr wallet(from)        amount     Cr SYS_FX_POOL_<from>  amount
    to-currency:    Dr SYS_FX_POOL_<to>    gross      Cr wallet(to)          net
                                                       Cr SYS_REVENUE_FX_<to> spread

SYS_FX_POOL_<CCY> balance = currency the pool still owes out (positive = short,
needs funding by treasury rebalancing; negative = surplus).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, ROUND_HALF_UP, ROUND_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.wallet import CurrencyCorridor, WalletCard

CENT = Decimal("0.01")


@dataclass
class SwapQuote:
    from_currency: str
    to_currency: str
    amount: Decimal          # debited, in from_currency
    rate: Decimal            # mid rate, 1 from = rate to
    spread_pct: Decimal      # e.g. 1.00 = 1%
    gross: Decimal           # amount * rate, in to_currency
    spread: Decimal          # in to_currency
    receive: Decimal         # credited, in to_currency


async def _pair(db: AsyncSession, src: str, dst: str) -> CurrencyCorridor:
    if src == dst:
        raise ApiError("Choose two different currencies")
    pair = (await db.execute(select(CurrencyCorridor).where(
        CurrencyCorridor.from_currency == src, CurrencyCorridor.to_currency == dst,
        CurrencyCorridor.is_active.is_(True)))).scalars().first()
    if pair is None or not pair.exchange_rate or pair.exchange_rate <= 0:
        raise ApiError(f"Swapping {src} to {dst} isn't available yet", status_code=409)
    return pair


async def quote(db: AsyncSession, src: str, dst: str, amount: Decimal) -> SwapQuote:
    pair = await _pair(db, src, dst)
    if amount < pair.min_amount or amount > pair.max_amount:
        raise ApiError(f"Swap between {src} {pair.min_amount} and {src} {pair.max_amount}")
    rate = Decimal(pair.exchange_rate)
    pct = Decimal(pair.fee_percentage or 0)
    gross = (amount * rate).quantize(CENT, rounding=ROUND_DOWN)
    spread = (gross * pct / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    receive = gross - spread
    if receive <= 0:
        raise ApiError("Amount is too small to swap")
    return SwapQuote(src, dst, amount, rate, pct, gross, spread, receive)


async def quote_for_target(db: AsyncSession, src: str, dst: str, target: Decimal) -> SwapQuote:
    """How much `src` is needed to deliver exactly `target` of `dst` after the
    spread (used to pay an invoice from a wallet in another currency). Amounts
    round up, so the target is always fully covered."""
    pair = await _pair(db, src, dst)
    rate = Decimal(pair.exchange_rate)
    pct = Decimal(pair.fee_percentage or 0)
    gross = (target / (1 - pct / 100)).quantize(CENT, rounding=ROUND_UP)
    spread = gross - target
    amount = (gross / rate).quantize(CENT, rounding=ROUND_UP)
    return SwapQuote(src, dst, amount, rate, pct, gross, spread, target)


async def fx_legs(db: AsyncSession, q: SwapQuote, *, source: WalletCard) -> list[posting.Leg]:
    """Legs that take `q.amount` from `source` and leave `q.receive` of the
    target currency to be credited by the caller (wallet, escrow or merchant)."""
    return [
        posting.debit(await ledger_accounts.wallet_account(db, source), q.amount),
        posting.credit(await chart.sys_account(db, "SYS_FX_POOL", q.from_currency), q.amount),
        posting.debit(await chart.sys_account(db, "SYS_FX_POOL", q.to_currency), q.gross),
        posting.credit(await chart.sys_account(db, "SYS_REVENUE_FX", q.to_currency), q.spread),
    ]


async def swap(db: AsyncSession, user_id: uuid.UUID, *, from_card_id: str, to_currency: str, amount: Decimal,
               expected_receive: Decimal | None) -> tuple[SwapQuote, object, WalletCard]:
    from app.services.wallet_service import get_or_create_currency_card

    try:
        cid = uuid.UUID(from_card_id)
    except ValueError as e:
        raise ApiError("Wallet not found", status_code=404) from e
    source = (await db.execute(select(WalletCard).where(WalletCard.id == cid, WalletCard.user_id == user_id)
                               .with_for_update())).scalar_one_or_none()
    if source is None:
        raise ApiError("Wallet not found", status_code=404)
    if source.frozen or source.blocked or source.flagged:
        raise ApiError("This wallet is restricted", status_code=403)
    q = await quote(db, source.currency, to_currency.upper(), amount)
    # Price protection: the customer confirms the amount they saw.
    if expected_receive is not None and q.receive != expected_receive:
        raise ApiError(f"The rate changed — you'd now receive {q.to_currency} {q.receive}. Please confirm again.",
                       status_code=409)
    target = await get_or_create_currency_card(db, user_id, q.to_currency)
    legs = await fx_legs(db, q, source=source)
    legs.append(posting.credit(await ledger_accounts.wallet_account(db, target), q.receive))
    entry = await posting.post(
        db, kind="currency_swap", description=f"Swap {q.from_currency} {q.amount} → {q.to_currency} {q.receive}",
        legs=legs, details={"user_id": str(user_id), "rate": str(q.rate), "spread_pct": str(q.spread_pct),
                            "spread": str(q.spread), "from_card_id": str(source.id), "to_card_id": str(target.id)},
    )
    return q, entry, target
