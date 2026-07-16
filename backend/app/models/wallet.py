from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TransactionType, WalletCurrency
from app.models.mixins import CreatedOnlyMixin, ExchangeRate, Money, TimestampMixin, UUIDFk, UUIDPk

_wallet_currency_enum = Enum(
    WalletCurrency, name="wallet_currency", native_enum=True, values_callable=lambda x: [e.value for e in x]
)


class WalletCard(Base, TimestampMixin):
    __tablename__ = "wallet_cards"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_wallet_cards_balance_nonneg"),)

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    balance: Mapped[Money] = mapped_column(default=0)
    currency: Mapped[WalletCurrency] = mapped_column(_wallet_currency_enum, default=WalletCurrency.ZAR)
    icon: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(Text)
    card_number: Mapped[str] = mapped_column(Text)
    expiry_date: Mapped[str | None] = mapped_column(Text)
    cvv: Mapped[str | None] = mapped_column(Text)
    stitch_card_id: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    spending_limit: Mapped[Money | None]


class Transaction(Base, TimestampMixin):
    __tablename__ = "transactions"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),)

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    amount: Mapped[Money]
    type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType, name="transaction_type", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    icon: Mapped[str] = mapped_column(Text)
    # Set only for cross-currency (international) transfers — the rate/fee
    # actually applied, locked in at send time. Null for every other
    # transaction (domestic transfers, purchases, top-ups, etc.).
    exchange_rate: Mapped[ExchangeRate | None]
    fee_amount: Mapped[Money | None]


class CurrencyCorridor(Base, TimestampMixin):
    __tablename__ = "currency_corridors"
    __table_args__ = (
        CheckConstraint("from_currency <> to_currency", name="ck_currency_corridors_different_currencies"),
    )

    id: Mapped[UUIDPk]
    from_currency: Mapped[WalletCurrency] = mapped_column(_wallet_currency_enum)
    to_currency: Mapped[WalletCurrency] = mapped_column(_wallet_currency_enum)
    exchange_rate: Mapped[ExchangeRate]
    fee_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    fee_fixed: Mapped[Money] = mapped_column(default=0)
    min_amount: Mapped[Money] = mapped_column(default=10)
    max_amount: Mapped[Money] = mapped_column(default=50000)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class InternationalTransfer(Base, CreatedOnlyMixin):
    __tablename__ = "international_transfers"
    __table_args__ = (
        CheckConstraint("source_amount > 0", name="ck_international_transfers_amount_positive"),
    )

    id: Mapped[UUIDPk]
    sender_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipient_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    from_currency: Mapped[WalletCurrency] = mapped_column(_wallet_currency_enum)
    to_currency: Mapped[WalletCurrency] = mapped_column(_wallet_currency_enum)
    source_amount: Mapped[Money]
    exchange_rate_applied: Mapped[ExchangeRate]
    fee_amount: Mapped[Money]
    destination_amount: Mapped[Money]
    sender_transaction_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL")
    )
    recipient_transaction_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL")
    )
