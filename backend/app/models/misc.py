from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import PaymentRequestStatus, PurchaseCategory, PurchaseStatus
from app.models.mixins import (
    CreatedOnlyMixin,
    CurrencyCode,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class Contact(Base, CreatedOnlyMixin):
    __tablename__ = "contacts"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    username: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(Text)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)


class PaymentRequest(Base, TimestampMixin):
    __tablename__ = "payment_requests"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_payment_requests_amount_positive"),)

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="USD")
    recipient_name: Mapped[str | None] = mapped_column(Text)
    recipient_phone: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PaymentRequestStatus] = mapped_column(
        Enum(PaymentRequestStatus, name="payment_request_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PaymentRequestStatus.PENDING,
    )
    expires_at: Mapped[OptionalTimestamp]


class PurchaseTransaction(Base, TimestampMixin):
    __tablename__ = "purchase_transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_purchase_transactions_amount_positive"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[PurchaseCategory] = mapped_column(
        Enum(PurchaseCategory, name="purchase_category", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    merchant_name: Mapped[str] = mapped_column(Text)
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    status: Mapped[PurchaseStatus] = mapped_column(
        Enum(PurchaseStatus, name="purchase_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PurchaseStatus.SUCCESS,
    )
    reference: Mapped[str] = mapped_column(Text, unique=True, index=True)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB)
