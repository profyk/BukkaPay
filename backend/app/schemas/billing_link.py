from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime


class BillingLinkResponse(CamelModel):
    id: UUID
    merchant_id: UUID
    payment_link_id: UUID | None
    biller_name: str
    bill_type: str
    description: str | None
    amount: MoneyStr
    currency: str
    account_number: str | None
    billing_period: str | None
    due_date: OptionalJsDateTime
    attachments: list | None
    recipients: list | None
    status: str
    total_collected: MoneyStr
    payment_count: int
    created_at: JsDateTime
    pay_url: str | None = None


class CreateBillingLinkRequest(CamelModel):
    merchant_id: str
    biller_name: str
    bill_type: str | None = None
    description: str | None = None
    amount: str
    currency: str | None = None
    account_number: str | None = None
    billing_period: str | None = None
    due_date: str | None = None
    attachments: list | None = None
    recipients: list | None = None


class UpdateBillingLinkStatusRequest(CamelModel):
    status: str
