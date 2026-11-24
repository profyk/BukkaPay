"""Transaction monitoring and sanctions/PEP screening.

Monitoring rules raise risk events; high-severity events open a case for a
human reviewer (and never auto-close). The same rule fires at most once per
person per day, so one burst doesn't bury reviewers in duplicates.

Screening goes through app.network.screening (OpenSanctions / self-hosted
yente). A confident sanctions hit freezes the account at once and opens a
case; possible hits and PEPs open a case for review / enhanced due
diligence. With no provider connected, results are recorded as
`not_screened`, never as a pass.

Thresholds follow South African FIC practice (cash threshold R49,999.99)
and are deliberately conservative for a young programme.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.ledger import JournalEntry
from app.models.platform import ComplianceCase, RiskEvent, ScreeningResult
from app.network import screening

LARGE_TRANSACTION = Decimal("20000")
VELOCITY_WINDOW = timedelta(hours=1)
VELOCITY_COUNT = 10
NEW_ACCOUNT_AGE = timedelta(days=7)
NEW_ACCOUNT_LARGE = Decimal("5000")
DAY = timedelta(hours=24)
# Splitting payments to stay just under the large-transaction line.
STRUCTURING_BAND = Decimal("0.80")
STRUCTURING_COUNT = 3
# Money that arrives and leaves almost at once (mule / layering pattern).
PASS_THROUGH_MIN = Decimal("5000")
PASS_THROUGH_SHARE = Decimal("0.90")
# Many incoming payments in a day (collection-account / mule pattern).
FAN_IN_COUNT = 15
RESCREEN_AFTER = timedelta(days=30)

OUTGOING_KINDS = ("p2p_transfer", "cross_border_debit", "withdrawal", "merchant_payment")


async def _recent(db, user_id, rule) -> bool:
    return (
        await db.execute(
            select(func.count()).select_from(RiskEvent)
            .where(RiskEvent.user_id == user_id, RiskEvent.rule == rule, RiskEvent.created_at >= datetime.now(UTC) - DAY)
        )
    ).scalar_one() > 0


async def _raise(db, user_id, rule, severity, score, reference, details, *, merchant_id=None) -> RiskEvent | None:
    if user_id is not None and await _recent(db, user_id, rule):
        return None
    event = RiskEvent(user_id=user_id, rule=rule, severity=severity, score=score, reference=reference,
                      details=details)
    db.add(event)
    await db.flush()
    if severity == "high":
        case = ComplianceCase(user_id=user_id, merchant_id=merchant_id, title=f"Auto-flag: {rule}", status="open",
                              priority="high", notes=[], evidence=[{"risk_event_id": str(event.id)}])
        db.add(case)
        await db.flush()
        event.case_id = case.id
        await db.flush()
    return event


def _high_risk_countries() -> set[str]:
    return {c.strip().upper() for c in (get_settings().high_risk_countries or "").split(",") if c.strip()}


async def _outgoing_since(db, user_id, since):
    return (
        await db.execute(
            select(JournalEntry).where(
                JournalEntry.posted_at >= since, JournalEntry.kind.in_(OUTGOING_KINDS),
                or_(JournalEntry.details["sender_id"].astext == str(user_id),
                    JournalEntry.details["payer_id"].astext == str(user_id)),
            )
        )
    ).scalars().all()


async def _flow_24h(db, user_id) -> tuple[Decimal, Decimal, int]:
    """(money in, money out, number of incoming payments) over the last day,
    from the person's own transaction history."""
    from app.models.wallet import Transaction

    since = datetime.now(UTC) - DAY
    rows = (
        await db.execute(
            select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0), func.count())
            .where(Transaction.user_id == user_id, Transaction.created_at >= since,
                   Transaction.category.notin_(("adjustment", "fee", "refund")))
            .group_by(Transaction.type)
        )
    ).all()
    money_in = money_out = Decimal(0)
    count_in = 0
    for type_, total, count in rows:
        if str(getattr(type_, "value", type_)) == "credit":
            money_in, count_in = Decimal(total), count
        else:
            money_out = Decimal(total)
    return money_in, money_out, count_in


async def evaluate(
    db: AsyncSession, *, user, amount: Decimal, currency: str, kind: str, reference: str | None,
    recipient=None, country: str | None = None,
) -> list[RiskEvent]:
    """Called after a money movement is booked (same transaction)."""
    events: list[RiskEvent | None] = []
    details = {"amount": str(amount), "currency": currency, "kind": kind}
    if amount >= LARGE_TRANSACTION:
        events.append(await _raise(db, user.id, "large_transaction", "medium", 40, reference, details))
    created = user.created_at
    if created is not None and datetime.now(UTC) - created < NEW_ACCOUNT_AGE and amount >= NEW_ACCOUNT_LARGE:
        events.append(await _raise(db, user.id, "new_account_large_value", "high", 70, reference, details))

    last_hour = await _outgoing_since(db, user.id, datetime.now(UTC) - VELOCITY_WINDOW)
    if len(last_hour) > VELOCITY_COUNT:
        events.append(await _raise(db, user.id, "velocity", "high", 80, reference, {"count_last_hour": len(last_hour)}))

    # Structuring: several payments each just under the large-transaction line.
    floor = LARGE_TRANSACTION * STRUCTURING_BAND
    if floor <= amount < LARGE_TRANSACTION:
        from app.models.enums import TransactionType
        from app.models.wallet import Transaction

        near_line = (
            await db.execute(
                select(func.count()).select_from(Transaction).where(
                    Transaction.user_id == user.id, Transaction.type == TransactionType.DEBIT,
                    Transaction.created_at >= datetime.now(UTC) - DAY,
                    Transaction.amount >= floor, Transaction.amount < LARGE_TRANSACTION,
                )
            )
        ).scalar_one()
        if near_line >= STRUCTURING_COUNT:
            events.append(await _raise(db, user.id, "structuring", "high", 85, reference,
                                       {**details, "near_threshold_payments_24h": near_line}))

    # Pass-through: most of what came in today is already going out again.
    money_in, money_out, _ = await _flow_24h(db, user.id)
    if money_in >= PASS_THROUGH_MIN and money_out >= money_in * PASS_THROUGH_SHARE:
        events.append(await _raise(db, user.id, "rapid_pass_through", "high", 75, reference,
                                   {"in_24h": str(money_in), "out_24h": str(money_out), "currency": currency}))

    if country and country.upper() in _high_risk_countries():
        events.append(await _raise(db, user.id, "high_risk_jurisdiction", "high", 90, reference,
                                   {**details, "country": country.upper()}))

    if recipient is not None:
        r_in, _, r_count = await _flow_24h(db, recipient.id)
        if r_count >= FAN_IN_COUNT:
            events.append(await _raise(db, recipient.id, "many_incoming_payments", "medium", 50, reference,
                                       {"incoming_24h": r_count, "total_24h": str(r_in), "currency": currency}))
    return [e for e in events if e is not None]


# ─── Screening ──────────────────────────────────────────────────────────────


async def record_screening(db: AsyncSession, *, user_id=None, merchant_id=None) -> dict:
    """Screen a customer or a business (and its directors). Returns
    {"sanctions": ..., "pep": ..., "blocked": bool}. A confident sanctions
    hit freezes the account (customer) / suspends the business."""
    from app.models.merchant import Merchant
    from app.models.user import User

    parties: list[tuple[str, str, str | None]] = []  # (name, kind, country)
    user = merchant = None
    if user_id is not None:
        user = await db.get(User, user_id)
        if user is not None:
            parties.append((user.kyc_full_name or user.name, "person", user.residence_country))
    if merchant_id is not None:
        merchant = await db.get(Merchant, merchant_id)
        if merchant is not None:
            parties.append((merchant.business_name, "company", merchant.country_code))
            for d in ((merchant.kyb_details or {}).get("directors") or [])[:10]:
                name = (d or {}).get("fullName") or (d or {}).get("full_name") or (d or {}).get("name")
                if name:
                    parties.append((str(name), "person", merchant.country_code))

    worst = {"sanctions": "clear", "pep": "clear"}
    order = ["clear", "not_screened", "error", "potential_match", "match"]
    for name, kind, country in parties or [("", "person", None)]:
        outcome = await screening.screen(name=name, kind=kind, country=country) if name else \
            screening.Outcome(provider="none", sanctions="not_screened", pep="not_screened")
        for screening_type, status in (("sanctions", outcome.sanctions), ("pep", outcome.pep)):
            db.add(ScreeningResult(
                user_id=user_id, merchant_id=merchant_id, screening_type=screening_type, provider=outcome.provider,
                status=status,
                details={"name": name, "kind": kind, "country": country, "error": outcome.error,
                         "hits": [h.__dict__ for h in outcome.hits]} if outcome.provider != "none"
                else {"note": "No screening provider connected"},
            ))
            if order.index(status) > order.index(worst[screening_type]):
                worst[screening_type] = status
    await db.flush()

    blocked = worst["sanctions"] == "match"
    if blocked:
        if user is not None:
            user.frozen = True
        if merchant is not None:
            merchant.is_active = False
    reasons = []
    if worst["sanctions"] in ("match", "potential_match"):
        reasons.append(("sanctions_" + worst["sanctions"], "high", 95 if blocked else 70))
    if worst["pep"] in ("match", "potential_match"):
        reasons.append(("pep_" + worst["pep"], "high", 60))  # enhanced due diligence
    for rule, severity, score in reasons:
        await _raise(db, user_id, rule, severity, score, None, {"screening": worst, "merchant_id": str(merchant_id)
                                                                if merchant_id else None}, merchant_id=merchant_id)
    await db.flush()
    return {**worst, "blocked": blocked}


async def rescreen_due(db: AsyncSession, *, limit: int = 200) -> int:
    """Daily: rescreen verified customers whose last screening is older than
    30 days, missing, or failed — sanctions lists change every day."""
    from app.models.user import User

    if not screening.configured():
        return 0
    latest = (
        select(ScreeningResult.user_id, func.max(ScreeningResult.created_at).label("at"))
        .where(ScreeningResult.user_id.is_not(None), ScreeningResult.status.notin_(("not_screened", "error")))
        .group_by(ScreeningResult.user_id).subquery()
    )
    due = (
        await db.execute(
            select(User.id).outerjoin(latest, latest.c.user_id == User.id)
            .where(User.kyc_level >= 1, User.deleted_at.is_(None),
                   or_(latest.c.at.is_(None), latest.c.at < datetime.now(UTC) - RESCREEN_AFTER))
            .limit(limit)
        )
    ).scalars().all()
    for uid in due:
        await record_screening(db, user_id=uid)
    return len(due)
