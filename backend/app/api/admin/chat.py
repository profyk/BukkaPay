import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.admin import Pagination
from app.schemas.chat import (
    ChatMessageResponse,
    ConversationsListResponse,
    ConversationSummary,
    SendChatMessageRequest,
)
from app.services import chat_service

router = APIRouter(tags=["admin-support-chat"])


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as e:
        raise ApiError("User not found", status_code=404) from e


@router.get("/support-chats")
async def list_conversations(
    page: int = Query(default=1, ge=1), limit: int = Query(default=30, ge=1, le=100),
    _ctx=Depends(require("support.view")), db: AsyncSession = Depends(get_db),
) -> ConversationsListResponse:
    conversations, total = await chat_service.list_conversations(db, page=page, limit=limit)
    return ConversationsListResponse.model_validate({
        "conversations": [ConversationSummary.model_validate(c) for c in conversations],
        "pagination": Pagination.model_validate({
            "page": page, "limit": limit, "total": total,
            "pages": max(1, (total + limit - 1) // limit),
        }),
    })


@router.get("/support-chats/{user_id}")
async def get_conversation(
    user_id: str, _ctx=Depends(require("support.view")), db: AsyncSession = Depends(get_db)
) -> list[ChatMessageResponse]:
    parsed_id = _parse_user_id(user_id)
    messages = await chat_service.get_messages(db, parsed_id)
    await chat_service.mark_read_by_admin(db, parsed_id)
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.post("/support-chats/{user_id}", status_code=201)
async def reply_to_conversation(
    user_id: str, body: SendChatMessageRequest, _ctx=Depends(require("support.manage")), db: AsyncSession = Depends(get_db)
) -> ChatMessageResponse:
    message = await chat_service.send_admin_reply(db, _parse_user_id(user_id), body.message)
    return ChatMessageResponse.model_validate(message)
