"""Check a wallet can pay *before* anything is attempted.

Every payment calls `require()` first. It locks the wallet's ledger
account for the rest of the transaction (the same lock the posting takes,
in the same order, so it can't deadlock with it), so no other payment can
spend the money between this check and the debit. An empty or short wallet
is refused here with a clear "top up" error, before any fee is worked out
and before any bank, airline, card issuer or other partner is called, so a
payment that can't succeed never costs anyone a failed charge.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.models.ledger import LedgerAccount


class NoFunds(ApiError):
    def __init__(self, message: str, *, code: str, balance: Decimal, needed: Decimal, currency: str):
        super().__init__(message, status_code=402)
        self.code = code
        self.extra = {"balance": f"{balance:.2f}", "needed": f"{needed:.2f}", "currency": currency}


async def available(db: AsyncSession, card) -> Decimal:
    """The wallet's balance, locked until the transaction ends."""
    acct = await ledger_accounts.wallet_account(db, card)
    locked = (await db.execute(select(LedgerAccount).where(LedgerAccount.id == acct.id).with_for_update())).scalar_one()
    return Decimal(locked.balance or 0)


async def require(db: AsyncSession, card, amount: Decimal, *, what: str = "pay") -> Decimal:
    balance = await available(db, card)
    amount = Decimal(amount)
    if balance <= 0:
        raise NoFunds(f"Your {card.currency} wallet is empty. Top up to {what}.", code="no_funds",
                      balance=balance, needed=amount, currency=card.currency)
    if balance < amount:
        raise NoFunds(f"Not enough money: you have {card.currency} {balance:.2f} and need {card.currency} {amount:.2f}. "
                      f"Top up to {what}.", code="insufficient_funds", balance=balance, needed=amount,
                      currency=card.currency)
    return balance
