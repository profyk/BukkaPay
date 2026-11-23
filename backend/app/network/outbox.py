"""Transactional outbox. Events are inserted in the same transaction as the
business change and delivered by the worker (`process_outbox`), with
retries and backoff. Handlers must be idempotent."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import OutboxEvent

MAX_ATTEMPTS = 10


async def enqueue(db: AsyncSession, topic: str, payload: dict, *, available_at: datetime | None = None) -> OutboxEvent:
    event = OutboxEvent(topic=topic, payload=payload, status="pending", attempts=0,
                        available_at=available_at or datetime.now(UTC))
    db.add(event)
    await db.flush()
    return event


async def _handle(db: AsyncSession, event: OutboxEvent) -> None:
    if event.topic == "rail.sandbox.settle":
        from app.network import webhooks

        await webhooks.sandbox_settle(db, event.payload["transfer_reference"], event.payload["rail_reference"])
    elif event.topic == "website.revalidate":
        from app.website import service as website_service

        await website_service.revalidate(event.payload)
    elif event.topic == "card.issue":
        from app.cards import service as card_service

        await card_service.issue_for_wallet(db, event.payload["wallet_card_id"])
    elif event.topic == "push.notification":
        from app.push import service as push_service

        await push_service.deliver_notification(db, event.payload["notification_id"], event.payload.get("attempt", 0))
    elif event.topic == "push.receipts":
        from app.push import service as push_service

        await push_service.check_receipts(db, event.payload["tickets"])
    elif event.topic == "push.broadcast":
        from app.push import service as push_service

        await push_service.deliver_broadcast(db, event.payload["title"], event.payload["message"],
                                             after_user_id=event.payload.get("after_user_id"))
    elif event.topic == "merchant.webhook":
        from app.merchants import webhooks_out

        await webhooks_out.deliver(db, event.payload)
    else:
        raise ValueError(f"unknown outbox topic {event.topic}")


async def process_due(
    session_factory, *, limit: int = 100, now: datetime | None = None, time_budget_seconds: float = 8.0,
) -> int:
    """Deliver due events in batches until the backlog is drained or the
    time budget (kept under the 10 s cron interval) runs out, so a burst of
    signups' card requests can't starve settlements behind them. Several
    workers can run this at once: rows are claimed with SKIP LOCKED."""
    import time

    now = now or datetime.now(UTC)
    deadline = time.monotonic() + time_budget_seconds
    done = 0
    while time.monotonic() < deadline:
        handled, fetched = await _process_batch(session_factory, limit=limit, now=now)
        done += handled
        if fetched < limit or handled == 0:
            break
    return done


async def _process_batch(session_factory, *, limit: int, now: datetime) -> tuple[int, int]:
    async with session_factory() as db:
        ids = list(
            (
                await db.execute(
                    select(OutboxEvent.id)
                    .where(OutboxEvent.status == "pending", OutboxEvent.available_at <= now)
                    .order_by(OutboxEvent.available_at)
                    .limit(limit)
                )
            ).scalars()
        )
    done = 0
    for event_id in ids:
        async with session_factory() as db:
            event = (
                await db.execute(
                    select(OutboxEvent).where(OutboxEvent.id == event_id, OutboxEvent.status == "pending")
                    .with_for_update(skip_locked=True)
                )
            ).scalar_one_or_none()
            if event is None:
                continue
            try:
                async with db.begin_nested():
                    await _handle(db, event)
                event.status = "done"
                event.processed_at = datetime.now(UTC)
                done += 1
            except Exception as e:  # noqa: BLE001 — record and retry with backoff
                event.attempts += 1
                event.last_error = f"{type(e).__name__}: {e}"[:1000]
                if event.attempts >= MAX_ATTEMPTS:
                    event.status = "failed"
                else:
                    event.available_at = datetime.now(UTC) + timedelta(seconds=min(3600, 2 ** event.attempts * 5))
                done += 1  # handled (rescheduled), so the next batch moves on
            await db.commit()
    return done, len(ids)
