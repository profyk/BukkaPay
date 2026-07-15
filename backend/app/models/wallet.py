from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TransactionType
from app.models.mixins import CurrencyCode, Money, TimestampMixin, UUIDFk, UUIDPk


class WalletCard(Base, TimestampMixin):
    __tablename__ = "wallet_cards"
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_wallet_cards_balance_nonneg"),)

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    balance: Mapped[Money] = mapped_column(default=0)
    currency: Mapped[CurrencyCode] = mapped_column(default="USD")
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
