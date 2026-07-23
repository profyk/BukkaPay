from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.deps import get_db
from app.schemas.chat import ChatMessageResponse, SendChatMessageRequest
from app.services import chat_service

router = APIRouter(prefix="/api/support-chat", tags=["support-chat"])


@router.get("")
async def get_chat(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[ChatMessageResponse]:
    messages = await chat_service.get_messages(db, user_id)
    await chat_service.mark_read_by_user(db, user_id)
    return [ChatMessageResponse.model_validate(m) for m in messages]


@router.post("", status_code=201)
async def send_message(
    body: SendChatMessageRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> ChatMessageResponse:
    message = await chat_service.send_user_message(db, user_id, body.message)
    return ChatMessageResponse.model_validate(message)
