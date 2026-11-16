from datetime import datetime
from uuid import UUID

from app.schemas.base import (
    CamelModel,
    JsDateTime,
    MoneyStr,
    OptionalMoneyStr,
    OptionalRateStr,
    RateStr,
)


def _mask_card_number(v: str | None) -> str:
    digits = "".join(c for c in (v or "") if c.isdigit())
    last4 = digits[-4:] if len(digits) >= 4 else "••••"
    return f"•••• •••• •••• {last4}"


class IssuedCardSummary(CamelModel):
    id: UUID
    network: str
    status: str
    last4: str | None
    exp_month: int | None
    exp_year: int | None


class WalletCardResponse(CamelModel):
    """A wallet. Its Visa card (if issued) is `issuedCard`; `cardNumber` is
    the masked card number kept for older app versions. Full card details
    only ever come from the issuer via POST /api/issued-cards/{id}/reveal."""

    id: UUID
    user_id: UUID
    title: str
    balance: MoneyStr
    currency: str
    icon: str
    color: str
    card_number: str = "•••• •••• •••• ••••"
    expiry_date: str | None = None
    is_default: bool
    frozen: bool
    flagged: bool
    blocked: bool
    spending_limit: OptionalMoneyStr
    created_at: JsDateTime
    issued_card: IssuedCardSummary | None = None

    @classmethod
    def from_wallet(cls, wallet, issued=None) -> "WalletCardResponse":
        # Built field by field: the wallet's deprecated card_number/cvv
        # columns must never be read into a response.
        return cls(
            id=wallet.id, user_id=wallet.user_id, title=wallet.title, balance=wallet.balance,
            currency=wallet.currency, icon=wallet.icon, color=wallet.color, is_default=wallet.is_default,
            frozen=wallet.frozen, flagged=wallet.flagged, blocked=wallet.blocked,
            spending_limit=wallet.spending_limit, created_at=wallet.created_at,
            card_number=_mask_card_number(issued.last4 if issued is not None else None),
            expiry_date=(f"{issued.exp_month:02d}/{str(issued.exp_year)[-2:]}"
                         if issued is not None and issued.exp_month else None),
            issued_card=IssuedCardSummary.model_validate(issued) if issued is not None else None,
        )



class CreateCardRequest(CamelModel):
    title: str
    currency: str = "ZAR"


class CardPricingResponse(CamelModel):
    issuance_fee: MoneyStr
    monthly_fee: MoneyStr
    currency: str = "ZAR"


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


class TransferRequest(CamelModel):
    """Domestic (same-currency) send. Cross-border uses CrossBorderTransferRequest."""

    from_card_id: str
    to_user_id: str
    amount: str
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
    # Ledger journal reference — quote it in receipts and support cases.
    reference: str | None = None
    status: str = "completed"


class TransferQuoteRequest(CamelModel):
    from_card_id: str
    amount: str
    # Omit (or give your own country) for a domestic send.
    destination_country_code: str | None = None


class TransferQuoteResponse(CamelModel):
    kind: str  # domestic / cross_border
    quote_id: str | None = None
    expires_at: datetime | None = None
    rate_timestamp: datetime | None = None
    source_amount: MoneyStr
    source_currency: str
    exchange_rate: OptionalRateStr
    fee: MoneyStr
    total_debit: MoneyStr
    destination_amount: MoneyStr
    destination_currency: str
    destination_country: str | None = None
    fee_breakdown: dict = {}


class CrossBorderTransferRequest(CamelModel):
    quote_id: str
    from_card_id: str
    to_user_id: str
    purpose_category: str | None = None
    purpose_subcategory: str | None = None
    pin: str | None = None


class TransferStatusResponse(CamelModel):
    reference: str
    status: str
    from_currency: str
    to_currency: str
    source_amount: MoneyStr
    fee: MoneyStr
    rate: RateStr
    destination_amount: MoneyStr
    corridor: str
    rail: str
    failure_reason: str | None = None
    created_at: datetime
    settled_at: datetime | None = None
    credited_at: datetime | None = None


class RecipientLookupResponse(CamelModel):
    id: UUID
    name: str
    username: str
    wallet_id: str
    avatar: str | None
    verified: bool
