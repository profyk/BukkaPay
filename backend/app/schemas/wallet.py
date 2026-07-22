from uuid import UUID

from pydantic import field_validator

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalMoneyStr, OptionalRateStr


def _mask_card_number(v: str) -> str:
    digits = "".join(c for c in v if c.isdigit())
    last4 = digits[-4:] if len(digits) >= 4 else digits
    return f"•••• •••• •••• {last4}"


class WalletCardResponse(CamelModel):
    """The card number here is always masked to the last 4 digits, and the
    CVV is never included — this is what every card list/browsing view uses.
    The real, unmasked PAN/expiry/CVV are only ever returned by the separate
    PIN-gated POST /api/cards/{id}/reveal endpoint, for the one legitimate
    reason a user needs them: entering the card into an external checkout."""

    id: UUID
    user_id: UUID
    title: str
    balance: MoneyStr
    currency: str
    icon: str
    color: str
    card_number: str
    expiry_date: str | None
    stitch_card_id: str | None
    is_default: bool
    frozen: bool
    flagged: bool
    blocked: bool
    spending_limit: OptionalMoneyStr
    created_at: JsDateTime

    @field_validator("card_number", mode="before")
    @classmethod
    def _mask(cls, v: str) -> str:
        return _mask_card_number(v)


class RevealCardDetailsRequest(CamelModel):
    pin: str


class CardFullDetailsResponse(CamelModel):
    card_number: str
    expiry_date: str | None
    cvv: str | None


class CreateCardRequest(CamelModel):
    title: str
    currency: str = "ZAR"


class CardPricingResponse(CamelModel):
    issuance_fee: MoneyStr
    monthly_fee: MoneyStr
    currency: str = "ZAR"


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
    exchange_rate: OptionalRateStr = None
    fee_amount: OptionalMoneyStr = None
    purpose_category: str | None = None
    purpose_subcategory: str | None = None
    destination_country_code: str | None = None
    destination_zone: str | None = None
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
    destination_country_code: str | None = None
    purpose_category: str | None = None
    purpose_subcategory: str | None = None
    pin: str | None = None


class TransferRecipient(CamelModel):
    name: str
    wallet_id: str


class TransferResponse(CamelModel):
    success: bool
    source_amount: str
    source_currency: str
    fee: str
    exchange_rate: str
    destination_amount: str
    destination_currency: str
    recipient: TransferRecipient
    new_balance: str
    destination_zone: str


class TransferQuoteRequest(CamelModel):
    from_currency: str
    to_currency: str
    amount: str


class TransferQuoteResponse(CamelModel):
    source_amount: MoneyStr
    source_currency: str
    exchange_rate: OptionalRateStr
    fee: MoneyStr
    destination_amount: MoneyStr
    destination_currency: str


class RecipientLookupResponse(CamelModel):
    id: UUID
    name: str
    username: str
    wallet_id: str
    avatar: str | None
    verified: bool
