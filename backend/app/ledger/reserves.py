"""Proof of reserve: are customer and merchant balances covered 1:1?

Per currency, BukkaPay owes its customers and merchants everything in their
wallets and merchant accounts, plus money it holds for them in escrow
(card holds, claim links, campaigns, payouts and transfers in flight). The
latest reported custodian/bank balance in that currency must be at least
that much. Currencies are never added together.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import CustodianBalanceSnapshot, LedgerAccount

# Liabilities that are money held for customers/merchants (not BukkaPay's own).
CUSTOMER_FUND_PREFIXES = ("wallet:", "merchant:", "campaign:", "escrow:", "card:holds:", "payouts:pending:",
                          "transit:outbound:")


async def liabilities_by_currency(db: AsyncSession) -> dict[str, Decimal]:
    out: dict[str, Decimal] = {}
    stmt = select(LedgerAccount.currency, func.sum(LedgerAccount.balance)).where(
        LedgerAccount.type == "liability",
    ).group_by(LedgerAccount.currency)
    conds = [LedgerAccount.code.like(f"{p}%") for p in CUSTOMER_FUND_PREFIXES]
    from sqlalchemy import or_

    for ccy, total in (await db.execute(stmt.where(or_(*conds)))).all():
        out[ccy] = Decimal(total or 0)
    return out


async def latest_custodian_balances(db: AsyncSession) -> dict[str, dict]:
    """Sum of each custodian's most recent snapshot, per currency."""
    latest = (
        select(CustodianBalanceSnapshot.custodian_id, CustodianBalanceSnapshot.currency,
               func.max(CustodianBalanceSnapshot.as_of).label("as_of"))
        .group_by(CustodianBalanceSnapshot.custodian_id, CustodianBalanceSnapshot.currency)
        .subquery()
    )
    rows = (await db.execute(
        select(CustodianBalanceSnapshot).join(
            latest,
            (CustodianBalanceSnapshot.custodian_id == latest.c.custodian_id)
            & (CustodianBalanceSnapshot.currency == latest.c.currency)
            & (CustodianBalanceSnapshot.as_of == latest.c.as_of),
        )
    )).scalars()
    out: dict[str, dict] = {}
    for s in rows:
        o = out.setdefault(s.currency, {"balance": Decimal(0), "as_of": s.as_of, "custodians": 0})
        o["balance"] += s.balance
        o["custodians"] += 1
        o["as_of"] = min(o["as_of"], s.as_of)  # the oldest figure in the total
    return out


async def proof_of_reserve(db: AsyncSession) -> list[dict]:
    owed = await liabilities_by_currency(db)
    held = await latest_custodian_balances(db)
    report = []
    for ccy in sorted(set(owed) | set(held)):
        liabilities = owed.get(ccy, Decimal(0))
        h = held.get(ccy)
        reserves = h["balance"] if h else Decimal(0)
        report.append({
            "currency": ccy,
            "liabilities": f"{liabilities:.2f}",
            "reserves": f"{reserves:.2f}",
            "surplus": f"{reserves - liabilities:.2f}",
            "coverage": None if liabilities == 0 else f"{(reserves / liabilities):.4f}",
            "covered": reserves >= liabilities,
            "reservesAsOf": h["as_of"].isoformat() if h else None,
            "custodians": h["custodians"] if h else 0,
        })
    return report
