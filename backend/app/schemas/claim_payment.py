from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr


class CreateClaimPaymentRequest(CamelModel):
    recipient_name: str
    recipient_contact: str
    amount: str
    currency: str | None = None
    note: str | None = None
    pin: str  # the PIN the recipient will use to claim
    transaction_pin: str | None = None  # the sender's own transaction PIN


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
    # No pickup_code here: the cash code is the bearer secret and is only
    # returned by claim-cash after the PIN is checked.
    pickup_status: str
    expires_at: JsDateTime
    created_at: JsDateTime


class VerifyPinRequest(CamelModel):
    pin: str


class ClaimBankRequest(CamelModel):
    pin: str
    account_name: str
    bank_name: str
    account_number: str
    branch_code: str | None = None


class ClaimWalletRequest(CamelModel):
    pin: str
    email: str


class ClaimCashRequest(CamelModel):
    pin: str


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
