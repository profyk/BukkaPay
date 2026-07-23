from uuid import UUID

from app.schemas.admin import Pagination, TransactionUserSummary
from app.schemas.base import CamelModel, JsDateTime


class ChatMessageResponse(CamelModel):
    id: UUID
    message: str
    is_user_message: bool
    read: bool
    created_at: JsDateTime


class SendChatMessageRequest(CamelModel):
    message: str


class ConversationSummary(CamelModel):
    user: TransactionUserSummary
    last_message: str
    last_message_at: JsDateTime
    unread_count: int


class ConversationsListResponse(CamelModel):
    conversations: list[ConversationSummary]
    pagination: Pagination
