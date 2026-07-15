from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime
from app.schemas.user import UserAuthPayload


class RegistrationVerifyRequest(CamelModel):
    """The raw RegistrationResponseJSON from @simplewebauthn/browser — passed
    straight through to the webauthn library's verify function, so this
    accepts arbitrary extra fields rather than modeling every nested shape."""

    model_config = {"extra": "allow"}


class AuthenticationOptionsRequest(CamelModel):
    email: str


class AuthenticationVerifyRequest(CamelModel):
    response: dict
    user_id: str


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
