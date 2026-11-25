"""Book-transfer pools: what each country's pool has fronted and what to
send it.

A book transfer (rail "book") pays the recipient from the money BukkaPay
already holds in the destination currency, and keeps the sender's money in
the source currency. `clearing:book:<CCY>` tracks this per currency:

* positive → that pool has paid out more than it took in: top it up
* negative → that pool took in more than it paid out: it has spare cash

Instead of paying a rail fee per transfer, treasury squares the pools up in
bulk (SADC-RTGS between the custodian banks for ZAR/BWP, or the treasury
partner for other currencies) and books the move with `record_rebalance`.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.ledger import LedgerAccount

PREFIX = "clearing:book:"
# Two pools are squared up the same way:
#   book  clearing:book:<CCY>  cross-border book transfers (paid out from the destination pool)
#   fx    fx:position:<CCY>    currency swaps (customers bought this currency from us / sold us that one)
POOL_PREFIX = {"book": PREFIX, "fx": "fx:position:"}


async def pool_account(db: AsyncSession, pool: str, currency: str):
    if pool == "fx":
        return await chart.sys_account(db, "SYS_FX_POOL", currency)
    if pool == "book":
        return await ledger_accounts.provider_clearing(db, "book", currency)
    raise ApiError(f"Unknown pool {pool}")


async def positions(db: AsyncSession, pool: str = "book") -> list[dict]:
    rows = (
        await db.execute(select(LedgerAccount).where(LedgerAccount.code.like(POOL_PREFIX[pool] + "%"))
                         .order_by(LedgerAccount.code))
    ).scalars().all()
    out = []
    for acct in rows:
        bal = Decimal(acct.balance or 0)
        out.append({
            "currency": acct.currency,
            "position": f"{bal:.2f}",
            "action": "top_up" if bal > 0 else ("surplus" if bal < 0 else "balanced"),
            "amount": f"{abs(bal):.2f}",
            "pool": pool,
        })
    return out


async def record_rebalance(db: AsyncSession, *, from_currency: str, from_amount: Decimal, to_currency: str,
                           to_amount: Decimal, reference: str, actor: str, pool: str = "book") -> dict:
    """Book a bulk move treasury has actually made between two country pools
    (e.g. ZAR from the SA custodian bought BWP into the BW custodian). Each
    currency's safeguarded cash and book position move together; the bank
    statement reconciliation then confirms the custodian side."""
    from_currency, to_currency = from_currency.upper(), to_currency.upper()
    if from_amount <= 0 or to_amount <= 0:
        raise ApiError("Amounts must be positive")
    if from_currency == to_currency:
        raise ApiError("Choose two different currencies")
    legs = [
        # Money left the source pool: its surplus is used up.
        posting.debit(await pool_account(db, pool, from_currency), from_amount),
        posting.credit(await chart.sys_account(db, "SYS_SAFEGUARD", from_currency), from_amount),
        # Money arrived in the destination pool: its top-up need shrinks.
        posting.debit(await chart.sys_account(db, "SYS_SAFEGUARD", to_currency), to_amount),
        posting.credit(await pool_account(db, pool, to_currency), to_amount),
    ]
    label = "Book pool rebalance" if pool == "book" else "FX hedge"
    entry = await posting.post(
        db, kind="treasury_rebalance" if pool == "book" else "fx_hedge",
        description=f"{label} {reference}"[:500], legs=legs,
        details={"pool": pool, "reference": reference, "from": f"{from_currency} {from_amount}", "to": f"{to_currency} {to_amount}",
                 "by": actor},
    )
    return {"journal_reference": entry.reference, "from": f"{from_currency} {from_amount:.2f}",
            "to": f"{to_currency} {to_amount:.2f}"}
