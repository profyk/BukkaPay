"""Pricing policy, the monthly account fee, and revenue reporting.

Prices are fee rules (FeeSchedule, versioned: a change retires the old rule
and adds a new one, so every past charge keeps the rule it used). This module
adds the policy around them and the monthly account fee:

* One fee per customer per calendar month, taken from their main wallet
  (country default: ZA→ZAR, BW→BWP, ZW→USD; else the default wallet).
  The amount is the `account_monthly` fee rule for that currency/country/
  account type (personal or business).
* Never creates debt: if the wallet can't cover it, it's retried daily and
  waived at the end of the month. Waived too: new customers' free months,
  months with no activity (dormant accounts), unverified accounts and
  frozen accounts. Each decision is one row in account_fee_charges.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.enums import NotificationType, TransactionType
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.revenue import AccountFeeCharge, PricingSetting
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees
from app.services import notification_service

DEFAULTS: dict[str, dict] = {
    "account_fee": {
        "enabled": True,
        "free_months": 1,             # new customers pay nothing for their first N months
        "waive_inactive": True,       # no fee for a month with no transactions (dormant accounts)
        "min_kyc_level": 1,           # unverified accounts are never charged
        "last_retry_day": 25,         # after this day of the month, an unpaid fee is waived
        "charge_day": 1,              # first day of the month it's attempted
    },
    "agents": {
        "cash_in_commission_bps": 50,   # BukkaPay pays the agent 0.5% of cash-in (customer pays nothing)
        "cash_out_agent_share_pct": 60,  # the agent keeps 60% of the customer's cash-out fee
        "code_ttl_minutes": 30,
        "max_code_attempts": 5,
    },
}


async def get_setting(db: AsyncSession, key: str) -> dict:
    row = await db.get(PricingSetting, key)
    return {**DEFAULTS.get(key, {}), **(row.value if row else {})}


async def set_setting(db: AsyncSession, key: str, changes: dict, *, actor: str) -> dict:
    if key not in DEFAULTS:
        raise ApiError(f"Unknown pricing setting {key}", status_code=404)
    allowed = DEFAULTS[key]
    clean = {}
    for k, v in changes.items():
        if k not in allowed:
            raise ApiError(f"Unknown field {k}")
        default = allowed[k]
        if isinstance(default, bool):
            clean[k] = bool(v)
        elif isinstance(default, int):
            try:
                clean[k] = int(v)
            except (TypeError, ValueError) as e:
                raise ApiError(f"{k} must be a whole number") from e
            if clean[k] < 0:
                raise ApiError(f"{k} can't be negative")
    if "cash_out_agent_share_pct" in clean and clean["cash_out_agent_share_pct"] > 100:
        raise ApiError("The agent share can't be more than 100%")
    if "last_retry_day" in clean and not 1 <= clean["last_retry_day"] <= 28:
        raise ApiError("last_retry_day must be between 1 and 28")
    row = await db.get(PricingSetting, key, with_for_update=True)
    if row is None:
        row = PricingSetting(key=key, value={})
        db.add(row)
    row.value = {**(row.value or {}), **clean}
    row.updated_by = actor
    await db.flush()
    return {**allowed, **row.value}


# ─── monthly account fee ────────────────────────────────────────────────────

DEFAULT_CURRENCY = {"ZA": "ZAR", "BW": "BWP", "ZW": "USD"}


def period_of(now: datetime) -> str:
    return now.strftime("%Y-%m")


async def main_wallet(db: AsyncSession, user: User) -> WalletCard | None:
    wallets = list((await db.execute(select(WalletCard).where(WalletCard.user_id == user.id)
                                     .order_by(WalletCard.created_at))).scalars())
    want = DEFAULT_CURRENCY.get((user.residence_country or "").upper())
    return (next((w for w in wallets if want and w.currency == want), None)
            or next((w for w in wallets if w.is_default), None) or (wallets[0] if wallets else None))


async def account_fee_for(db: AsyncSession, user: User, wallet: WalletCard) -> Decimal:
    customer_type = str(getattr(user.account_type, "value", user.account_type) or "personal")
    return (await fees.compute(db, "account_monthly", Decimal(0), currency=wallet.currency,
                               country=user.residence_country, customer_type=customer_type)).fee


RETRY_EVERY = timedelta(hours=20)  # `due` fees are retried about once a day


async def charge_account_fees(db: AsyncSession, *, now: datetime | None = None, limit: int = 500) -> dict:
    """Run often (hourly) in bounded batches. Every customer gets exactly one
    row per month (charged, due or waived), so a batch never re-reads
    customers already decided; `due` rows come back once a day until the
    last retry day."""
    now = now or datetime.now(UTC)
    policy = await get_setting(db, "account_fee")
    counts = {"charged": 0, "due": 0, "waived": 0}
    if not policy["enabled"] or now.day < policy["charge_day"]:
        return counts
    period = period_of(now)
    already = exists().where(AccountFeeCharge.user_id == User.id, AccountFeeCharge.period == period,
                             (AccountFeeCharge.status != "due")
                             | (AccountFeeCharge.last_attempt_at > now - RETRY_EVERY))
    users = (await db.execute(
        select(User).where(User.deleted_at.is_(None), ~already).order_by(User.created_at).limit(limit)
    )).scalars().all()
    for user in users:
        async with db.begin_nested():
            outcome = await _decide(db, user, period, policy, now)
        counts[outcome] += 1
    await db.flush()
    return counts


async def _decide(db: AsyncSession, user: User, period: str, policy: dict, now: datetime) -> str:
    row = (await db.execute(select(AccountFeeCharge).where(AccountFeeCharge.user_id == user.id,
                                                           AccountFeeCharge.period == period).with_for_update())
           ).scalar_one_or_none()
    wallet = await main_wallet(db, user)
    amount = await account_fee_for(db, user, wallet) if wallet else Decimal("0.00")

    def record(status: str, reason: str | None = None) -> AccountFeeCharge:
        nonlocal row
        if row is None:
            currency = wallet.currency if wallet else DEFAULT_CURRENCY.get((user.residence_country or "").upper(), "USD")
            row = AccountFeeCharge(user_id=user.id, period=period, wallet_card_id=wallet.id if wallet else None,
                                   currency=currency, amount=amount, status=status, reason=reason, attempts=0)
            db.add(row)
        row.status, row.reason = status, reason
        return row

    # Recorded (not skipped) so the customer isn't re-read every hour all month.
    if wallet is None:
        record("waived", "no_wallet")
        return "waived"
    if amount <= 0:
        record("waived", "no_price")  # no fee rule for this currency/country/account type
        return "waived"

    created = user.created_at or now
    months_old = (now.year - created.year) * 12 + (now.month - created.month)
    if months_old < policy["free_months"]:
        record("waived", "free_months")
        return "waived"
    if (user.kyc_level or 0) < policy["min_kyc_level"]:
        record("waived", "unverified")
        return "waived"
    if user.frozen:
        record("waived", "account_restricted")
        return "waived"
    if policy["waive_inactive"]:
        active = (await db.execute(select(func.count()).select_from(Transaction).where(
            Transaction.user_id == user.id, Transaction.created_at >= now - timedelta(days=30),
            Transaction.category.notin_(("fee", "account_fee"))))).scalar_one()
        if active == 0:
            record("waived", "inactive")
            return "waived"

    charge = record("due", "insufficient_balance")
    charge.attempts += 1
    charge.last_attempt_at = now
    try:
        async with db.begin_nested():
            entry = await posting.post(
                db, kind="account_fee", description=f"Monthly account fee {period}",
                legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), amount),
                      posting.credit(await chart.sys_account(db, "SYS_REVENUE_ACCOUNT_FEES", wallet.currency), amount)],
                details={"user_id": str(user.id), "period": period},
            )
    except posting.InsufficientFunds:
        if now.day > policy["last_retry_day"]:
            record("waived", "insufficient_balance")
            return "waived"
        return "due"  # retried on the next run; never overdraws
    charge.status, charge.reason, charge.journal_entry_id, charge.charged_at = "charged", None, entry.id, now
    db.add(Transaction(user_id=user.id, card_id=wallet.id, title=f"BukkaPay monthly fee ({period})",
                       category="account_fee", amount=amount, type=TransactionType.DEBIT, icon="receipt"))
    await notification_service.create_notification(
        db, user.id, NotificationType.INFO, "Monthly account fee",
        f"{wallet.currency} {amount:.2f} for {period}. It covers your wallets, Visa card and free transfers to BukkaPay users.",
        related_type="account_fee", push=False,
    )
    return "charged"


async def my_plan(db: AsyncSession, user: User, *, now: datetime | None = None) -> dict:
    """What a customer sees in the app: the fee, and whether this month is waived."""
    now = now or datetime.now(UTC)
    policy = await get_setting(db, "account_fee")
    wallet = await main_wallet(db, user)
    amount = await account_fee_for(db, user, wallet) if wallet else Decimal(0)
    created = user.created_at or now
    free_until = None
    if policy["free_months"]:  # same rule as _decide: whole calendar months from the sign-up month
        m = created.month - 1 + policy["free_months"]
        free_until = created.replace(year=created.year + m // 12, month=m % 12 + 1, day=1,
                                     hour=0, minute=0, second=0, microsecond=0)
    this_month = (await db.execute(select(AccountFeeCharge).where(AccountFeeCharge.user_id == user.id,
                                                                  AccountFeeCharge.period == period_of(now)))
                  ).scalar_one_or_none()
    nxt = (now.replace(day=1) + timedelta(days=32)).replace(day=policy["charge_day"])
    return {
        "enabled": bool(policy["enabled"]) and amount > 0,
        "monthlyFee": f"{amount:.2f}", "currency": wallet.currency if wallet else None,
        "freeUntil": free_until.isoformat() if free_until and free_until > now else None,
        "thisMonth": {"status": this_month.status, "reason": this_month.reason} if this_month else None,
        "nextChargeDate": nxt.date().isoformat(),
        "waivedWhen": [w for w, on in (("inactive_month", policy["waive_inactive"]),) if on],
    }


# ─── reporting & tools ──────────────────────────────────────────────────────

STREAMS = {
    "account_fee": "Monthly account fees", "card_capture": "Card fees", "card_maintenance_fee": "Card fees",
    "merchant_payment": "Merchant fees", "qr_payment": "Merchant fees", "payment_link_payment": "Payment link fees",
    "payout_settlement": "Payout fees & FX", "cross_border_debit": "Cross-border fees", "swap": "FX margin",
    "withdrawal": "Withdrawal fees", "agent_cash_out": "Cash-out fees", "trade_payment": "Trade escrow fees",
    "agent_cash_in": "Agent commissions (cost)",
}


async def revenue_report(db: AsyncSession, *, since: datetime) -> list[dict]:
    """Net revenue booked since `since`, by stream and currency (from the ledger).
    Costs booked to expense accounts (agent commissions) show as negative lines."""
    rows = (await db.execute(
        select(JournalEntry.kind, LedgerAccount.currency,
               func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .where(LedgerAccount.type.in_(("revenue", "expense")), JournalEntry.posted_at >= since)
        .group_by(JournalEntry.kind, LedgerAccount.currency)
    )).all()
    out: dict[tuple[str, str], Decimal] = {}
    for kind, ccy, amount in rows:
        key = (STREAMS.get(kind, kind.replace("_", " ").capitalize()), ccy)
        out[key] = out.get(key, Decimal(0)) + Decimal(amount or 0)
    return [{"stream": s, "currency": c, "amount": f"{a:.2f}"} for (s, c), a in sorted(out.items()) if a != 0]


async def simulate(db: AsyncSession, *, product: str, amount: Decimal, currency: str, country: str | None,
                   method: str | None = None, customer_type: str | None = None) -> dict:
    r = await fees.compute(db, product, amount, currency=currency, country=country, method=method,
                           customer_type=customer_type)
    return {"product": product, "amount": f"{amount:.2f}", "currency": currency, "fee": f"{r.fee:.2f}",
            "ruleId": str(r.rule_id) if r.rule_id else None, "breakdown": r.breakdown}
