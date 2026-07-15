from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime, OptionalMoneyStr


class InvoiceItem(CamelModel):
    name: str
    quantity: int
    unit_price: float
    total: float


class InvoiceResponse(CamelModel):
    id: UUID
    payment_link_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    items: list[dict]
    total_amount: MoneyStr
    type: str
    due_date: OptionalJsDateTime
    notes: str | None
    attachment: dict | None = None
    created_at: JsDateTime


class CreateInvoiceRequest(CamelModel):
    customer_name: str
    customer_email: str | None = None
    customer_phone: str | None = None
    items: list[dict] | None = None
    type: str | None = None
    due_date: str | None = None
    notes: str | None = None
    attachment: dict | None = None


class InvoicePaymentResponse(CamelModel):
    id: UUID
    payment_link_id: UUID
    amount: MoneyStr
    currency: str
    method: str
    payer_name: str | None
    payer_email: str | None
    payer_user_id: UUID | None
    reference: str
    status: str
    gateway: str | None
    gateway_ref: str | None
    created_at: JsDateTime


class PaymentLinkResponse(CamelModel):
    id: UUID
    sender_id: UUID
    amount: MoneyStr
    currency: str
    description: str | None
    amount_paid: MoneyStr
    remaining_balance: OptionalMoneyStr
    allow_partial_payment: bool
    minimum_payment: OptionalMoneyStr
    type: str
    region: str
    sub_region: str | None
    destination: str
    bank_details: dict | None
    business_name: str | None
    business_logo: str | None
    attachments: list | None
    link_type: str
    status: str
    created_at: JsDateTime
    invoice: InvoiceResponse | None = None
    payments: list[InvoicePaymentResponse] | None = None
    sender_name: str | None = None
    payment_url: str = ""
    direction: str | None = None


class CreatePaymentLinkRequest(CamelModel):
    amount: str
    currency: str | None = None
    description: str | None = None
    allow_partial_payment: bool | None = None
    minimum_payment: str | None = None
    type: str | None = None
    region: str | None = None
    sub_region: str | None = None
    destination: str | None = None
    bank_details: dict | None = None
    invoice: CreateInvoiceRequest | None = None
    business_name: str | None = None
    business_logo: str | None = None


class PayWalletRequest(CamelModel):
    amount: str | None = None


class PayWalletResponse(CamelModel):
    success: bool
    amount_paid: str
    remaining: str
    status: str


class PayCardInitializeRequest(CamelModel):
    email: str
    amount: str | None = None
    payer_name: str | None = None


class PayCardInitializeResponse(CamelModel):
    authorization_url: str
    reference: str
