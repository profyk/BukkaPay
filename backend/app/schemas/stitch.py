from app.schemas.base import CamelModel


class Bank(CamelModel):
    id: str
    name: str


class BanksResponse(CamelModel):
    banks: list[Bank]


class StitchStatusResponse(CamelModel):
    configured: bool


class TopupInitiateRequest(CamelModel):
    wallet_card_id: str
    amount: str
    currency: str | None = None


class TopupInitiateResponse(CamelModel):
    payment_url: str
    payment_request_id: str
    reference: str


class TopupVerifyRequest(CamelModel):
    payment_request_id: str
    wallet_card_id: str
    amount: str
    currency: str | None = None


class TopupVerifyResponse(CamelModel):
    status: str
    new_balance: str | None = None
    amount: str | None = None
    error: str | None = None


class WithdrawRequest(CamelModel):
    wallet_card_id: str
    amount: str
    currency: str | None = None
    bank_id: str
    account_number: str
    account_type: str | None = None
    account_name: str


class WithdrawResponse(CamelModel):
    success: bool
    disbursement_id: str
    status: str
    new_balance: str
    reference: str
    message: str


class PayStitchRequest(CamelModel):
    payer_name: str
    payer_email: str | None = None
    amount: str | None = None


class PayStitchResponse(CamelModel):
    payment_url: str
    payment_request_id: str
    reference: str


class PayStitchVerifyRequest(CamelModel):
    payment_request_id: str


class PayStitchVerifyResponse(CamelModel):
    status: str
