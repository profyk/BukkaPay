from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime


class GiftCardResponse(CamelModel):
    id: UUID
    sender_id: UUID
    recipient_email: str | None
    recipient_phone: str | None
    recipient_name: str
    amount: MoneyStr
    currency: str
    message: str | None
    code: str
    status: str
    design: str
    redeemed_by: UUID | None
    redeemed_at: OptionalJsDateTime
    expires_at: OptionalJsDateTime
    created_at: JsDateTime


class GiftCardListResponse(CamelModel):
    sent: list[GiftCardResponse]
    received: list[GiftCardResponse]


class CreateGiftCardRequest(CamelModel):
    recipient_email: str | None = None
    recipient_phone: str | None = None
    recipient_name: str
    amount: str
    currency: str | None = None
    message: str | None = None
    design: str | None = None
