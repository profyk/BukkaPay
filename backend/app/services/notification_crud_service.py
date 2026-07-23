"""Router-facing notification CRUD (list/mark-read/delete). The internal
`create_notification()` helper used by other domains lives in
notification_service.py — this is a separate module to avoid collision.
"""

import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


MAX_NOTIFICATIONS_PAGE_SIZE = 100


async def get_notifications(db: AsyncSession, user_id: uuid.UUID) -> list[Notification]:
    result = await db.execute(
        select(Notification).where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(MAX_NOTIFICATIONS_PAGE_SIZE)
    )
    return list(result.scalars().all())


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
    )
    return result.scalar_one()


async def mark_read(db: AsyncSession, notification_id: str, user_id: uuid.UUID) -> None:
    try:
        notification_uuid = uuid.UUID(notification_id)
    except ValueError:
        return
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_uuid, Notification.user_id == user_id)
        .values(read=True)
    )
    await db.flush()


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(update(Notification).where(Notification.user_id == user_id).values(read=True))
    await db.flush()


async def delete_notification(db: AsyncSession, notification_id: str, user_id: uuid.UUID) -> None:
    try:
        notification_uuid = uuid.UUID(notification_id)
    except ValueError:
        return
    await db.execute(
        delete(Notification).where(Notification.id == notification_uuid, Notification.user_id == user_id)
    )
    await db.flush()


async def clear_all(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(Notification).where(Notification.user_id == user_id))
    await db.flush()
