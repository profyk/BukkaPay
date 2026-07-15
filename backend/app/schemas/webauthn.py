from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime
from app.schemas.user import UserAuthPayload


class AuthenticationOptionsRequest(CamelModel):
    email: str


class AuthenticationVerifyResponse(CamelModel):
    success: bool
    token: str
    user: UserAuthPayload


class WebauthnCredentialResponse(CamelModel):
    id: UUID
    device_type: str | None
    created_at: JsDateTime


class SuccessResponse(CamelModel):
    success: bool
    message: str | None = None
