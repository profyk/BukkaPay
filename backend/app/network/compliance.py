"""Transaction monitoring rules and screening integration points.

These rules raise risk events and open cases for human review. They are
operational signals, NOT an AML programme: sanctions/PEP screening must be
done by an approved screening provider (none is connected yet, so screening
results are recorded as `not_screened`, never as a pass).
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger import JournalEntry
from app.models.platform import ComplianceCase, RiskEvent, ScreeningResult

LARGE_TRANSACTION = Decimal("20000")
VELOCITY_WINDOW = timedelta(hours=1)
VELOCITY_COUNT = 10
NEW_ACCOUNT_AGE = timedelta(days=7)
NEW_ACCOUNT_LARGE = Decimal("5000")


async def _raise(db, user_id, rule, severity, score, reference, details) -> RiskEvent:
    event = RiskEvent(user_id=user_id, rule=rule, severity=severity, score=score, reference=reference,
                      details=details)
    db.add(event)
    await db.flush()
    if severity == "high":
        case = ComplianceCase(user_id=user_id, title=f"Auto-flag: {rule}", status="open", priority="high",
                              notes=[], evidence=[{"risk_event_id": str(event.id)}])
        db.add(case)
        await db.flush()
        event.case_id = case.id
        await db.flush()
    return event


async def evaluate(
    db: AsyncSession, *, user, amount: Decimal, currency: str, kind: str, reference: str | None,
) -> list[RiskEvent]:
    """Called after a money movement is booked (same transaction)."""
    events = []
    if amount >= LARGE_TRANSACTION:
        events.append(await _raise(db, user.id, "large_transaction", "medium", 40, reference,
                                   {"amount": str(amount), "currency": currency, "kind": kind}))
    created = user.created_at
    if created is not None and datetime.now(UTC) - created < NEW_ACCOUNT_AGE and amount >= NEW_ACCOUNT_LARGE:
        events.append(await _raise(db, user.id, "new_account_large_value", "high", 70, reference,
                                   {"amount": str(amount), "currency": currency, "kind": kind}))
    since = datetime.now(UTC) - VELOCITY_WINDOW
    count = (
        await db.execute(
            select(func.count()).select_from(JournalEntry).where(
                JournalEntry.posted_at >= since,
                JournalEntry.kind.in_(("p2p_transfer", "cross_border_debit", "withdrawal")),
                JournalEntry.details["sender_id"].astext == str(user.id),
            )
        )
    ).scalar_one()
    if count > VELOCITY_COUNT:
        events.append(await _raise(db, user.id, "velocity", "high", 80, reference,
                                   {"count_last_hour": count}))
    return events


async def record_screening(db: AsyncSession, *, user_id=None, merchant_id=None) -> None:
    """Integration point for sanctions/PEP screening. No provider is wired,
    so this records that the party has NOT been screened."""
    for screening_type in ("sanctions", "pep"):
        db.add(ScreeningResult(user_id=user_id, merchant_id=merchant_id, screening_type=screening_type,
                               provider="none", status="not_screened",
                               details={"note": "No screening provider connected"}))
    await db.flush()
