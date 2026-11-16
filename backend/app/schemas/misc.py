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
    description: str | None = None
    payer_user_id: UUID | None = None
    paid_at: OptionalJsDateTime = None
    transfer_reference: str | None = None
    requester: PublicUser | None = None


class CreatePaymentRequestRequest(CamelModel):
    amount: str
    currency: str | None = None
    recipient_name: str | None = None
    recipient_phone: str | None = None
    # Wallet ID / username of the BukkaPay user being asked (they get notified).
    payer: str | None = None
    description: str | None = None
    expires_in_hours: int | None = 72


class PayPaymentRequestRequest(CamelModel):
    from_card_id: str
    pin: str | None = None


class UpdatePaymentRequestStatusRequest(CamelModel):
    status: str
