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


# ─── personal spending limits (set by the customer) ─────────────────────────
#
# users.spending_limits = {"ZAR": {"perPayment": "1000.00", "daily": "5000.00",
#                                  "pending": {"perPayment": ..., "daily": ..., "effectiveAt": iso}}}
# Lowering a limit applies at once; raising one applies after INCREASE_DELAY, so
# someone holding an unlocked phone can't lift the limit and empty the wallet.

INCREASE_DELAY = timedelta(hours=24)
NOT_SPENDING = ("currency_swap", "reversal", "test_funding")  # moving between own wallets isn't spending


def personal_limits(user: User, currency: str, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    cfg = dict(((user.spending_limits or {}).get(currency) or {}))
    pending = cfg.get("pending")
    if pending and datetime.fromisoformat(pending["effectiveAt"]) <= now:
        cfg = {k: v for k, v in pending.items() if k != "effectiveAt"}
    return {"perPayment": cfg.get("perPayment"), "daily": cfg.get("daily"),
            "pending": cfg.get("pending") if cfg.get("pending") else None}


def set_personal_limits(user: User, currency: str, per_payment: Decimal | None, daily: Decimal | None,
                        *, now: datetime | None = None) -> dict:
    """Returns the stored config. Decreases (or removing nothing) apply now; any increase waits."""
    now = now or datetime.now(UTC)
    current = personal_limits(user, currency, now=now)

    def raised(new, old) -> bool:
        if old is None:
            return False  # setting a limit where there was none only restricts
        return new is None or Decimal(str(new)) > Decimal(str(old))

    new = {"perPayment": f"{per_payment:.2f}" if per_payment is not None else None,
           "daily": f"{daily:.2f}" if daily is not None else None}
    all_limits = dict(user.spending_limits or {})
    if raised(new["perPayment"], current["perPayment"]) or raised(new["daily"], current["daily"]):
        # Restricting parts apply now (take the lower of old/new); the rest waits.
        now_cfg = {k: (min(Decimal(str(new[k])), Decimal(str(current[k]))) if new[k] is not None and current[k] is not None
                       else current[k]) for k in ("perPayment", "daily")}
        stored = {k: (f"{v:.2f}" if isinstance(v, Decimal) else v) for k, v in now_cfg.items()}
        stored["pending"] = {**new, "effectiveAt": (now + INCREASE_DELAY).isoformat()}
    else:
        stored = new
    all_limits[currency] = stored
    user.spending_limits = all_limits
    return stored


async def spent_today(db: AsyncSession, user_id, currency: str, *, now: datetime | None = None) -> Decimal:
    now = now or datetime.now(UTC)
    stmt = (
        select(func.coalesce(func.sum(JournalLine.debit), 0))
        .select_from(JournalLine)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id)
        .where(WalletCard.user_id == user_id, JournalLine.currency == currency,
               JournalEntry.kind.notin_(NOT_SPENDING), JournalEntry.posted_at >= now - timedelta(days=1))
    )
    return Decimal((await db.execute(stmt)).scalar_one())


async def check_personal(db: AsyncSession, user: User, amount: Decimal, *, currency: str) -> None:
    lim = personal_limits(user, currency)
    if lim["perPayment"] is not None and amount > Decimal(lim["perPayment"]):
        raise ApiError(f"This is above the per-payment limit you set ({currency} {lim['perPayment']}). "
                       "You can change it in Security settings.", status_code=403)
    if lim["daily"] is not None:
        used = await spent_today(db, user.id, currency)
        if used + amount > Decimal(lim["daily"]):
            left = max(Decimal(0), Decimal(lim["daily"]) - used)
            raise ApiError(f"This would go over the daily limit you set ({currency} {lim['daily']}). "
                           f"You can still spend {currency} {left:.2f} today.", status_code=403)


async def check(
    db: AsyncSession, user: User, product: str, amount: Decimal, *, currency: str, country: str | None,
) -> None:
    if product != "funding":  # the customer's own limits apply to money going out
        await check_personal(db, user, amount, currency=currency)
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
