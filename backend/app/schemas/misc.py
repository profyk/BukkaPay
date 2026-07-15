from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime


class ContactResponse(CamelModel):
    id: UUID
    user_id: UUID
    name: str
    username: str
    color: str
    is_favorite: bool


class CreateContactRequest(CamelModel):
    name: str
    username: str
    color: str
    is_favorite: bool | None = None


class PublicUser(CamelModel):
    """Public-safe user projection — used to embed the requester on payment
    requests. The Node version spread the *entire* user row (including the
    password hash) into this response; that's a pre-existing leak, not a
    contract we should preserve, so this omits password/security fields.
    """

    id: UUID
    wallet_id: str
    name: str
    email: str
    username: str
    phone: str | None
    country_code: str | None
    avatar: str | None
    loyalty_points: int
    biometric_enabled: bool
    verified: bool


class PaymentRequestResponse(CamelModel):
    id: UUID
    user_id: UUID
    amount: MoneyStr
    currency: str
    recipient_name: str | None
    recipient_phone: str | None
    status: str
    expires_at: OptionalJsDateTime
    created_at: JsDateTime
    requester: PublicUser | None = None


class CreatePaymentRequestRequest(CamelModel):
    amount: str
    currency: str | None = None
    recipient_name: str | None = None
    recipient_phone: str | None = None
    status: str | None = None
    expires_at: str | None = None


class UpdatePaymentRequestStatusRequest(CamelModel):
    status: str
