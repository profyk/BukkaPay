from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime


class NotificationResponse(CamelModel):
    id: UUID
    user_id: UUID
    type: str
    title: str
    message: str
    read: bool
    related_id: str | None
    related_type: str | None
    created_at: JsDateTime


class UploadRequest(CamelModel):
    base64: str
    mime_type: str
    filename: str | None = None


class UploadResponse(CamelModel):
    url: str
    filename: str
    mime_type: str
