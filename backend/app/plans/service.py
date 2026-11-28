"""Merchant plans: catalogue, choosing a plan, renewals and limits.

Money rules
* A plan is paid from the business's own BukkaPay balance (its sales), in its
  settlement currency, through the ledger: debit the merchant payable, credit
  plan revenue. Nothing is ever overdrawn: without enough balance the change
  is refused (or, for a renewal, retried daily for a week and then the
  business moves to the free default plan). No card or cash is involved.
* Upgrading takes effect at once: the unused part of the current paid period
  is credited against the new price, so nobody pays twice for the same days.
* Downgrading or cancelling waits until the end of the paid period.
* A plan's first trial (trial_days) is free; the first charge is at its end.
* A cycle with no price in the business's currency can't be chosen: drafting
  plans before deciding prices is safe.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.enums import NotificationType
from app.models.merchant import Merchant
from app.models.plans import (
    BILLING_CYCLES,
    MerchantPlan,
    MerchantPlanCharge,
    MerchantPlanSubscription,
)
from app.plans.catalogue import LIMIT_KEYS
from app.services import notification_service

CYCLE_DAYS = {"monthly": 30, "yearly": 365}
RENEWAL_ATTEMPTS = 7          # daily retries before moving to the free default plan
RETRY_EVERY = timedelta(hours=20)
CENT = Decimal("0.01")
LIVE = ("active", "past_due")


def _money(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def price_for(plan: MerchantPlan, currency: str, cycle: str) -> Decimal | None:
    """The plan's price for a currency and cycle, or None when not priced."""
    raw = ((plan.prices or {}).get(currency) or {}).get(cycle)
    if raw is None or raw == "":
        return None
    try:
        value = _money(raw)
    except (InvalidOperation, ValueError):
        return None
    return value if value >= 0 else None


def monthly_equivalent(price: Decimal, cycle: str) -> Decimal:
    return price if cycle == "monthly" else (price / 12)


def plan_out(plan: MerchantPlan, currency: str | None = None) -> dict:
    out = {
        "code": plan.code, "name": plan.name, "tagline": plan.tagline, "description": plan.description,
        "status": plan.status, "sortOrder": plan.sort_order, "highlighted": plan.highlighted,
        "isDefault": plan.is_default, "trialDays": plan.trial_days, "features": plan.features or [],
        "limits": plan.limits or {}, "prices": plan.prices or {},
        "updatedBy": plan.updated_by, "updatedAt": plan.updated_at.isoformat() if plan.updated_at else None,
    }
    if currency:
        out["currency"] = currency
        out["monthly"] = _str(price_for(plan, currency, "monthly"))
        out["yearly"] = _str(price_for(plan, currency, "yearly"))
    return out


def _str(v: Decimal | None) -> str | None:
    return None if v is None else f"{v:.2f}"


def sub_out(sub: MerchantPlanSubscription | None) -> dict | None:
    if sub is None:
        return None
    return {
        "id": str(sub.id), "planCode": sub.plan_code, "billingCycle": sub.billing_cycle, "currency": sub.currency,
        "price": f"{sub.price:.2f}", "status": sub.status, "periodStart": sub.period_start.isoformat(),
        "periodEnd": sub.period_end.isoformat() if sub.period_end else None,
        "trialEndsAt": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "nextPlanCode": sub.next_plan_code, "nextBillingCycle": sub.next_billing_cycle,
    }


# ─── Catalogue ──────────────────────────────────────────────────────────────

async def list_plans(db: AsyncSession, *, published_only: bool = False) -> list[MerchantPlan]:
    stmt = select(MerchantPlan).order_by(MerchantPlan.sort_order, MerchantPlan.name)
    if published_only:
        stmt = stmt.where(MerchantPlan.status == "published")
    return list((await db.execute(stmt)).scalars())


async def get_plan(db: AsyncSession, code: str) -> MerchantPlan | None:
    return (await db.execute(select(MerchantPlan).where(MerchantPlan.code == code))).scalar_one_or_none()


async def default_plan(db: AsyncSession) -> MerchantPlan | None:
    """The published plan every business is on unless it chose another."""
    return (await db.execute(
        select(MerchantPlan).where(MerchantPlan.is_default.is_(True), MerchantPlan.status == "published")
        .order_by(MerchantPlan.sort_order).limit(1)
    )).scalar_one_or_none()


async def live_subscription(db: AsyncSession, merchant_id, *, lock: bool = False) -> MerchantPlanSubscription | None:
    stmt = (select(MerchantPlanSubscription)
            .where(MerchantPlanSubscription.merchant_id == merchant_id, MerchantPlanSubscription.status.in_(LIVE))
            .order_by(MerchantPlanSubscription.created_at.desc()).limit(1))
    if lock:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalar_one_or_none()


async def effective_plan(db: AsyncSession, merchant: Merchant) -> tuple[MerchantPlan | None, MerchantPlanSubscription | None]:
    sub = await live_subscription(db, merchant.id)
    if sub is not None:
        return await get_plan(db, sub.plan_code), sub
    return await default_plan(db), None


async def limits_for(db: AsyncSession, merchant: Merchant) -> dict:
    """Limits that apply now. Empty (nothing enforced) until the business's
    plan is published, so drafting plans never blocks anyone."""
    plan, _ = await effective_plan(db, merchant)
    if plan is None or plan.status != "published":
        return {}
    return plan.limits or {}


async def enforce_limit(db: AsyncSession, merchant: Merchant, key: str, in_use: int) -> None:
    """Refuse creating one more of `key` when the plan's limit is reached."""
    limit = (await limits_for(db, merchant)).get(key)
    if limit is None or isinstance(limit, bool):
        return
    if in_use >= int(limit):
        label = LIMIT_KEYS.get(key, key).lower()
        raise ApiError(f"Your plan includes {limit} {label}. Upgrade your plan in Plan & billing to add more.",
                       status_code=403)


async def enforce_feature(db: AsyncSession, merchant: Merchant, key: str) -> None:
    limits = await limits_for(db, merchant)
    if limits.get(key) is False:
        raise ApiError(f"{LIMIT_KEYS.get(key, key)} aren't included in your plan. Upgrade in Plan & billing.",
                       status_code=403)


# ─── Choosing a plan ───────────────────────────────────────────────────────

def _period_end(start: datetime, cycle: str) -> datetime:
    return start + timedelta(days=CYCLE_DAYS[cycle])


def unused_credit(sub: MerchantPlanSubscription | None, now: datetime) -> Decimal:
    """Value of the paid days left on the current period (none for trials)."""
    if sub is None or sub.status != "active" or not sub.price or sub.trial_ends_at and sub.trial_ends_at > now:
        return Decimal("0.00")
    if sub.period_end is None or sub.period_end <= now:
        return Decimal("0.00")
    total = (sub.period_end - sub.period_start).total_seconds()
    left = (sub.period_end - now).total_seconds()
    return _money(sub.price * Decimal(left / total)) if total > 0 else Decimal("0.00")


async def _charge(db: AsyncSession, merchant: Merchant, *, sub: MerchantPlanSubscription | None, plan_code: str,
                  kind: str, amount: Decimal, credit: Decimal, currency: str) -> MerchantPlanCharge:
    """Take `amount` from the business balance. Raises InsufficientFunds."""
    charge = MerchantPlanCharge(merchant_id=merchant.id, subscription_id=sub.id if sub else None, plan_code=plan_code,
                                kind=kind, currency=currency, amount=amount, credit=credit, status="charged")
    if amount > 0:
        async with db.begin_nested():
            entry = await posting.post(
                db, kind="merchant_plan", description=f"BukkaPay {plan_code} plan ({kind})",
                legs=[posting.debit(await ledger_accounts.merchant_account(db, merchant, currency), amount),
                      posting.credit(await chart.sys_account(db, "SYS_REVENUE_SUBSCRIPTIONS", currency), amount)],
                details={"merchant_id": str(merchant.id), "plan": plan_code, "kind": kind, "credit": f"{credit:.2f}"},
                insufficient_message="Not enough in your business balance",
            )
        charge.journal_entry_id = entry.id
    db.add(charge)
    return charge


async def _switch(db: AsyncSession, merchant: Merchant, current: MerchantPlanSubscription | None, *,
                  end_reason: str, now: datetime, new: MerchantPlanSubscription, kind: str, amount: Decimal,
                  credit: Decimal) -> MerchantPlanSubscription:
    """End the live period and start `new`, charging `amount`, all or nothing:
    without enough balance the savepoint rolls back and InsufficientFunds is
    raised, leaving the current period exactly as it was. (At most one live
    period per business: the old one ends before the new one is inserted.)"""
    async with db.begin_nested():
        if current is not None:
            current.status, current.ended_at, current.end_reason = "ended", now, end_reason
            await db.flush()
        db.add(new)
        await db.flush()
        await _charge(db, merchant, sub=new, plan_code=new.plan_code, kind=kind, amount=amount, credit=credit,
                      currency=new.currency)
        merchant.subscription_expires_at = new.period_end
        await db.flush()
    return new


async def _had_trial(db: AsyncSession, merchant_id) -> bool:
    return (await db.execute(select(MerchantPlanSubscription.id).where(
        MerchantPlanSubscription.merchant_id == merchant_id,
        MerchantPlanSubscription.trial_ends_at.is_not(None)).limit(1))).first() is not None


async def choose(db: AsyncSession, merchant: Merchant, plan_code: str, cycle: str, *, user_id,
                 now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    if cycle not in BILLING_CYCLES:
        raise ApiError("Choose monthly or yearly billing")
    plan = await get_plan(db, plan_code)
    if plan is None or plan.status != "published":
        raise ApiError("That plan isn't available", status_code=404)
    currency = merchant.settlement_currency
    price = price_for(plan, currency, cycle)
    if price is None:
        raise ApiError(f"{plan.name} isn't available with {cycle} billing in {currency} yet.", status_code=409)

    current = await live_subscription(db, merchant.id, lock=True)
    current_plan = await get_plan(db, current.plan_code) if current else await default_plan(db)

    if current and current.plan_code == plan.code and current.billing_cycle == cycle:
        if current.next_plan_code:  # change of mind: keep the plan after all
            current.next_plan_code = current.next_billing_cycle = None
            await db.flush()
            return {"result": "kept", "subscription": sub_out(current)}
        raise ApiError(f"You're already on {plan.name} ({cycle})", status_code=409)

    new_monthly = monthly_equivalent(price, cycle)
    cur_monthly = monthly_equivalent(current.price, current.billing_cycle) if current else Decimal("0")
    on_trial = bool(current and current.trial_ends_at and current.trial_ends_at > now)
    downgrade = current is not None and not on_trial and new_monthly < cur_monthly

    if downgrade:
        current.next_plan_code, current.next_billing_cycle = plan.code, cycle
        await db.flush()
        await _notify(db, merchant, f"Moving to {plan.name}",
                      f"{merchant.business_name} moves to {plan.name} on {current.period_end:%d %b %Y}, "
                      "when the current paid period ends.")
        return {"result": "scheduled", "subscription": sub_out(current)}

    credit = unused_credit(current, now)
    trial = plan.trial_days > 0 and price > 0 and not await _had_trial(db, merchant.id)
    amount = Decimal("0.00") if trial else max(Decimal("0.00"), price - credit)
    sub = MerchantPlanSubscription(
        merchant_id=merchant.id, plan_code=plan.code, billing_cycle=cycle, currency=currency, price=price,
        status="active", period_start=now,
        period_end=now + timedelta(days=plan.trial_days) if trial else _period_end(now, cycle),
        trial_ends_at=now + timedelta(days=plan.trial_days) if trial else None, chosen_by=user_id,
    )
    try:
        await _switch(db, merchant, current, end_reason="changed", now=now, new=sub,
                      kind="trial" if trial else "upgrade" if current else "start", amount=amount, credit=credit)
    except posting.InsufficientFunds as exc:
        await db.refresh(merchant)
        raise ApiError(
            f"{plan.name} costs {currency} {amount:.2f} now"
            + (f" (after {currency} {credit:.2f} credit for your unused days)" if credit else "")
            + f", and your business balance is {currency} {merchant.wallet_balance:.2f}. "
            "Plans are paid from your sales balance: try again once you've received payments.",
            status_code=402,
        ) from exc
    await _notify(db, merchant, f"You're on {plan.name}",
                  f"{plan.name} trial: free for {plan.trial_days} days." if trial else
                  f"{merchant.business_name} is now on {plan.name}. "
                  + (f"Charged {currency} {amount:.2f}." if amount else "No charge."))
    return {"result": "trial" if trial else "changed", "charged": f"{amount:.2f}", "credit": f"{credit:.2f}",
            "subscription": sub_out(sub), "from": current_plan.code if current_plan else None}


async def cancel(db: AsyncSession, merchant: Merchant, *, now: datetime | None = None) -> dict:
    """Back to the free default plan at the end of the paid period."""
    now = now or datetime.now(UTC)
    current = await live_subscription(db, merchant.id, lock=True)
    fallback = await default_plan(db)
    if current is None or (fallback and current.plan_code == fallback.code):
        raise ApiError("You're not on a paid plan", status_code=409)
    current.next_plan_code = fallback.code if fallback else None
    current.next_billing_cycle = "monthly"
    if current.trial_ends_at and current.trial_ends_at > now:  # cancelling a trial ends it now
        current.period_end = now
    await db.flush()
    return {"result": "scheduled", "subscription": sub_out(current)}


# ─── Renewals (worker, hourly) ─────────────────────────────────────────────

async def renew_due(db: AsyncSession, *, now: datetime | None = None, limit: int = 200) -> dict:
    now = now or datetime.now(UTC)
    counts = {"renewed": 0, "switched": 0, "past_due": 0, "downgraded": 0}
    subs = (await db.execute(
        select(MerchantPlanSubscription)
        .where(MerchantPlanSubscription.status.in_(LIVE), MerchantPlanSubscription.period_end <= now)
        .order_by(MerchantPlanSubscription.period_end).limit(limit).with_for_update(skip_locked=True)
    )).scalars().all()
    for sub in subs:
        if sub.status == "past_due" and sub.updated_at and now - sub.updated_at < RETRY_EVERY:
            continue
        merchant = await db.get(Merchant, sub.merchant_id)
        if merchant is None:
            continue
        counts[await _renew_one(db, merchant, sub, now)] += 1
    await db.flush()
    return counts


async def _renew_one(db: AsyncSession, merchant: Merchant, sub: MerchantPlanSubscription, now: datetime) -> str:
    fallback = await default_plan(db)
    code, cycle = sub.next_plan_code or sub.plan_code, sub.next_billing_cycle or sub.billing_cycle
    plan = await get_plan(db, code)
    price = price_for(plan, merchant.settlement_currency, cycle) if plan and plan.status == "published" else None
    if price is None:  # retired or no longer priced: free default plan
        plan, price, cycle = fallback, Decimal("0.00"), "monthly"
    if plan is None:
        sub.status, sub.ended_at, sub.end_reason = "ended", now, "no_plan"
        return "downgraded"

    switched = plan.code != sub.plan_code
    new = MerchantPlanSubscription(merchant_id=merchant.id, plan_code=plan.code, billing_cycle=cycle,
                                   currency=merchant.settlement_currency, price=price, status="active",
                                   period_start=now, period_end=_period_end(now, cycle), chosen_by=sub.chosen_by)
    try:
        await _switch(db, merchant, sub, end_reason="switched" if switched else "renewed", now=now, new=new,
                      kind="renewal", amount=price, credit=Decimal("0.00"))
    except posting.InsufficientFunds:
        await db.refresh(sub)
        sub.renewal_attempts += 1
        sub.status = "past_due"
        sub.updated_at = now
        db.add(MerchantPlanCharge(merchant_id=merchant.id, subscription_id=sub.id, plan_code=plan.code, kind="renewal",
                                  currency=merchant.settlement_currency, amount=price, status="failed",
                                  reason="insufficient_balance"))
        if sub.renewal_attempts >= RENEWAL_ATTEMPTS and fallback and fallback.code != plan.code:
            sub.status, sub.ended_at, sub.end_reason = "ended", now, "unpaid"
            await db.flush()
            db.add(MerchantPlanSubscription(merchant_id=merchant.id, plan_code=fallback.code, billing_cycle="monthly",
                                            currency=merchant.settlement_currency, price=Decimal("0.00"),
                                            status="active", period_start=now, period_end=_period_end(now, "monthly")))
            await _notify(db, merchant, f"Moved to {fallback.name}",
                          f"We couldn't take the {plan.name} fee from {merchant.business_name}'s balance for "
                          f"{RENEWAL_ATTEMPTS} days, so it's now on {fallback.name}. Upgrade again any time.")
            return "downgraded"
        if sub.renewal_attempts == 1:
            await _notify(db, merchant, "Plan renewal due",
                          f"{plan.name} renews at {merchant.settlement_currency} {price:.2f}, but the business balance "
                          "is too low. We'll try again daily for a week.")
        return "past_due"
    return "switched" if switched else "renewed"


async def _notify(db: AsyncSession, merchant: Merchant, title: str, message: str) -> None:
    await notification_service.create_notification(db, merchant.user_id, NotificationType.INFO, title, message,
                                                   related_id=str(merchant.id), related_type="merchant_plan", push=False)


async def usage(db: AsyncSession, merchant: Merchant) -> dict:
    """What the business uses today against each counted limit."""
    from sqlalchemy import func

    from app.models.merchant import MerchantStaff
    from app.models.payment_link import PaymentLink
    from app.models.platform import MerchantQrCode

    async def count(stmt) -> int:
        return int((await db.execute(stmt)).scalar() or 0)

    out = {"staff_seats": await count(select(func.count()).select_from(MerchantStaff)
                                      .where(MerchantStaff.merchant_id == merchant.id))}
    out["checkout_links"] = await count(select(func.count()).select_from(PaymentLink).where(
        PaymentLink.merchant_id == merchant.id, PaymentLink.status.in_(("pending", "partial"))))
    # Printed (static) codes count; one-off dynamic codes for a single sale don't.
    out["qr_codes"] = await count(select(func.count()).select_from(MerchantQrCode).where(
        MerchantQrCode.merchant_id == merchant.id, MerchantQrCode.kind == "static", MerchantQrCode.status == "active"))
    return out
