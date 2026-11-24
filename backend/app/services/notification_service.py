import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType
from app.models.notification import Notification


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type_: NotificationType,
    title: str,
    message: str,
    related_id: str | None = None,
    related_type: str | None = None,
    *,
    push: bool = True,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        message=message,
        related_id=related_id,
        related_type=related_type,
    )
    db.add(notification)
    await db.flush()
    if push:
        # Same transaction: if the business change commits, the push is sent.
        from app.push import service as push_service

        await push_service.queue(db, notification.id)
    else:
        from datetime import UTC, datetime

        notification.pushed_at = datetime.now(UTC)
    return notification
