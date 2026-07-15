from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr


class CreateClaimPaymentRequest(CamelModel):
    recipient_name: str
    recipient_contact: str
    amount: str
    currency: str | None = None
    note: str | None = None
    pin: str


class CreateClaimPaymentResponse(CamelModel):
    id: UUID
    claim_url: str
    expires_at: JsDateTime
    recipient_name: str
    amount: MoneyStr
    currency: str


class ClaimPaymentMineResponse(CamelModel):
    id: UUID
    recipient_name: str
    recipient_contact: str
    amount: MoneyStr
    currency: str
    note: str | None
    status: str
    claimed: bool
    claim_method: str | None
    pickup_status: str
    expires_at: JsDateTime
    created_at: JsDateTime


class ClaimPaymentPublicResponse(CamelModel):
    id: UUID
    recipient_name: str
    amount: MoneyStr
    currency: str
    note: str | None
    status: str
    claimed: bool
    claim_method: str | None
    pickup_code: str | None
    pickup_status: str
    expires_at: JsDateTime
    created_at: JsDateTime


class VerifyPinRequest(CamelModel):
    pin: str


class ClaimBankRequest(CamelModel):
    account_name: str
    bank_name: str
    account_number: str
    branch_code: str | None = None


class ClaimWalletRequest(CamelModel):
    email: str


class ClaimCashResponse(CamelModel):
    success: bool
    pickup_code: str
    amount: MoneyStr
    currency: str


class PickupClaimRequest(CamelModel):
    pickup_code: str


class PickupClaimResponse(CamelModel):
    success: bool
    amount: MoneyStr
    currency: str
    recipient_name: str
    message: str
