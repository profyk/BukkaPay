import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.chat import ChatMessage
from app.models.enums import NotificationType
from app.models.user import User
from app.services import notification_service

MAX_MESSAGES_PAGE_SIZE = 200


async def get_messages(db: AsyncSession, user_id: uuid.UUID) -> list[ChatMessage]:
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(MAX_MESSAGES_PAGE_SIZE)
    )
    return list(result.scalars().all())


async def send_user_message(db: AsyncSession, user_id: uuid.UUID, message: str) -> ChatMessage:
    text = message.strip()
    if not text:
        raise ApiError("Message is required")

    chat_message = ChatMessage(user_id=user_id, message=text, is_user_message=True, read=False)
    db.add(chat_message)
    await db.flush()
    # Every chat message belongs to a help-desk ticket (app.support.service).
    from app.support import service as support

    user = await db.get(User, user_id)
    if user is not None:
        await support.chat_message(db, user, text)
    return chat_message


async def send_admin_reply(db: AsyncSession, user_id: uuid.UUID, message: str) -> ChatMessage:
    text = message.strip()
    if not text:
        raise ApiError("Message is required")

    chat_message = ChatMessage(user_id=user_id, message=text, is_user_message=False, read=False)
    db.add(chat_message)
    from app.support import service as support

    await support.record_legacy_agent_chat(db, user_id, text)
    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "New message from Support",
        text if len(text) <= 120 else f"{text[:117]}...",
        related_id=str(user_id), related_type="support_chat",
    )
    await db.flush()
    return chat_message


async def mark_read_by_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """The user opened the chat — mark support's messages as seen."""
    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.is_user_message.is_(False))
        .values(read=True)
    )
    await db.flush()


async def mark_read_by_admin(db: AsyncSession, user_id: uuid.UUID) -> None:
    """An admin opened this conversation — mark the user's messages as seen."""
    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.is_user_message.is_(True))
        .values(read=True)
    )
    await db.flush()


async def list_conversations(db: AsyncSession, *, page: int, limit: int) -> tuple[list[dict], int]:
    """One row per user who has ever messaged support, most recently active
    first, with the last message preview and how many of the user's
    messages are still unread by an admin."""
    last_message_sub = (
        select(
            ChatMessage.user_id,
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .group_by(ChatMessage.user_id)
        .subquery()
    )
    total = (await db.execute(select(func.count()).select_from(last_message_sub))).scalar_one()

    stmt = (
        select(last_message_sub.c.user_id, last_message_sub.c.last_at)
        .order_by(last_message_sub.c.last_at.desc())
        .limit(limit).offset((page - 1) * limit)
    )
    rows = (await db.execute(stmt)).all()

    conversations = []
    for user_id, last_at in rows:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user is None:
            continue
        last_msg = (
            await db.execute(
                select(ChatMessage).where(ChatMessage.user_id == user_id)
                .order_by(ChatMessage.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()
        unread_count = (
            await db.execute(
                select(func.count()).select_from(ChatMessage).where(
                    ChatMessage.user_id == user_id, ChatMessage.is_user_message.is_(True),
                    ChatMessage.read.is_(False),
                )
            )
        ).scalar_one()
        conversations.append({
            "user": user, "last_message": last_msg.message if last_msg else "",
            "last_message_at": last_at, "unread_count": unread_count,
        })

    return conversations, total
