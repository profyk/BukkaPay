"""Transaction limits by product, country/currency and KYC level.

Usage is measured from the ledger itself (journal lines on the user's
wallet accounts), so limits can't be dodged by any path that moves money.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.platform import TransactionLimit
from app.models.user import User
from app.models.wallet import WalletCard

# Which journal kinds count towards each product, and on which side of the
# user's wallet account (debit = money out, credit = money in).
PRODUCT_USAGE = {
    "p2p": (("p2p_transfer",), "debit"),
    "cross_border": (("cross_border_debit",), "debit"),
    "withdrawal": (("withdrawal",), "debit"),
    "funding": (("wallet_topup",), "credit"),
    "card_spend": (("card_authorization",), "debit"),
}


async def _rule(db: AsyncSession, product: str, user: User, currency: str, country: str | None):
    stmt = (
        select(TransactionLimit)
        .where(
            TransactionLimit.product == product,
            TransactionLimit.active.is_(True),
            TransactionLimit.kyc_level <= (user.kyc_level or 0),
            or_(TransactionLimit.currency.is_(None), TransactionLimit.currency == currency),
            or_(TransactionLimit.country_code.is_(None), TransactionLimit.country_code == country),
        )
        .order_by(TransactionLimit.kyc_level.desc())
    )
    return (await db.execute(stmt)).scalars().first()


async def _usage(db: AsyncSession, user_id, product: str, currency: str, since: datetime) -> Decimal:
    kinds, side = PRODUCT_USAGE.get(product, ((), "debit"))
    if not kinds:
        return Decimal(0)
    column = JournalLine.debit if side == "debit" else JournalLine.credit
    stmt = (
        select(func.coalesce(func.sum(column), 0))
        .select_from(JournalLine)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id)
        .where(
            WalletCard.user_id == user_id,
            JournalLine.currency == currency,
            JournalEntry.kind.in_(kinds),
            JournalEntry.posted_at >= since,
        )
    )
    return Decimal((await db.execute(stmt)).scalar_one())


async def check(
    db: AsyncSession, user: User, product: str, amount: Decimal, *, currency: str, country: str | None,
) -> None:
    rule = await _rule(db, product, user, currency, country)
    if rule is None:
        return
    if rule.per_transaction_min is not None and amount < rule.per_transaction_min:
        raise ApiError(f"Minimum amount is {currency} {rule.per_transaction_min}")
    if rule.per_transaction_max is not None:
        if rule.per_transaction_max == 0:
            raise ApiError("Verify your identity to use this feature", status_code=403)
        if amount > rule.per_transaction_max:
            raise ApiError(
                f"Maximum per transaction at your verification level is {currency} {rule.per_transaction_max}"
            )
    now = datetime.now(UTC)
    for window, cap, label in ((timedelta(days=1), rule.daily_max, "daily"),
                               (timedelta(days=30), rule.monthly_max, "monthly")):
        if cap is None or cap == 0:
            continue
        used = await _usage(db, user.id, product, currency, now - window)
        if used + amount > cap:
            remaining = max(Decimal(0), cap - used)
            raise ApiError(f"This exceeds your {label} limit. Remaining: {currency} {remaining:.2f}")
