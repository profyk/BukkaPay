from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalMoneyStr


class WalletCardResponse(CamelModel):
    id: UUID
    user_id: UUID
    title: str
    balance: MoneyStr
    currency: str
    icon: str
    color: str
    card_number: str
    expiry_date: str | None
    cvv: str | None
    stitch_card_id: str | None
    is_default: bool
    frozen: bool
    flagged: bool
    blocked: bool
    spending_limit: OptionalMoneyStr
    created_at: JsDateTime


class CreateCardRequest(CamelModel):
    title: str


class UpdateCardBalanceRequest(CamelModel):
    balance: str


class TransactionResponse(CamelModel):
    id: UUID
    user_id: UUID
    card_id: UUID | None
    title: str
    category: str
    amount: MoneyStr
    type: str
    icon: str
    created_at: JsDateTime


class CreateTransactionRequest(CamelModel):
    card_id: str | None = None
    title: str
    category: str
    amount: str
    type: str
    icon: str


class TransferRequest(CamelModel):
    from_card_id: str
    to_user_id: str
    amount: str


class TransferRecipient(CamelModel):
    name: str
    wallet_id: str


class TransferResponse(CamelModel):
    success: bool
    amount: str
    recipient: TransferRecipient
    new_balance: str
