from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import (
    DocumentType,
    InvoicePaymentMethod,
    InvoicePaymentStatus,
    LinkType,
    PaymentLinkDestination,
    PaymentLinkRegion,
    PaymentLinkStatus,
    PaymentLinkType,
)
from app.models.mixins import (
    CreatedAt,
    CreatedOnlyMixin,
    CurrencyCode,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class PaymentLink(Base, TimestampMixin):
    __tablename__ = "payment_links"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_payment_links_amount_positive"),)

    id: Mapped[UUIDPk]
    sender_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    description: Mapped[str | None] = mapped_column(Text)
    amount_paid: Mapped[Money] = mapped_column(default=0)
    remaining_balance: Mapped[Money | None]
    allow_partial_payment: Mapped[bool] = mapped_column(Boolean, default=False)
    minimum_payment: Mapped[Money | None]
    type: Mapped[PaymentLinkType] = mapped_column(
        Enum(PaymentLinkType, name="payment_link_type", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PaymentLinkType.PERSONAL,
    )
    region: Mapped[PaymentLinkRegion] = mapped_column(
        Enum(PaymentLinkRegion, name="payment_link_region", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PaymentLinkRegion.LOCAL,
    )
    sub_region: Mapped[str | None] = mapped_column(Text)
    destination: Mapped[PaymentLinkDestination] = mapped_column(
        Enum(PaymentLinkDestination, name="payment_link_destination", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PaymentLinkDestination.WALLET,
    )
    bank_details: Mapped[dict | None] = mapped_column(JSONB)
    business_name: Mapped[str | None] = mapped_column(Text)
    business_logo: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list | None] = mapped_column(JSONB)
    link_type: Mapped[LinkType] = mapped_column(
        Enum(LinkType, name="link_type", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=LinkType.PAYMENT
    )
    status: Mapped[PaymentLinkStatus] = mapped_column(
        Enum(PaymentLinkStatus, name="payment_link_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=PaymentLinkStatus.PENDING,
    )


class Invoice(Base, CreatedOnlyMixin):
    __tablename__ = "invoices"
    __table_args__ = (CheckConstraint("total_amount > 0", name="ck_invoices_total_positive"),)

    id: Mapped[UUIDPk]
    payment_link_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="CASCADE"), index=True
    )
    customer_name: Mapped[str] = mapped_column(Text)
    customer_email: Mapped[str | None] = mapped_column(Text)
    customer_phone: Mapped[str | None] = mapped_column(Text)
    items: Mapped[list] = mapped_column(JSONB, default=list)
    total_amount: Mapped[Money]
    type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=DocumentType.INVOICE
    )
    due_date: Mapped[OptionalTimestamp]
    notes: Mapped[str | None] = mapped_column(Text)
    attachment: Mapped[dict | None] = mapped_column(JSONB)


class InvoicePayment(Base, CreatedOnlyMixin):
    __tablename__ = "invoice_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_invoice_payments_amount_positive"),)

    id: Mapped[UUIDPk]
    payment_link_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    method: Mapped[InvoicePaymentMethod] = mapped_column(
        Enum(InvoicePaymentMethod, name="invoice_payment_method", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=InvoicePaymentMethod.CARD,
    )
    payer_name: Mapped[str | None] = mapped_column(Text)
    payer_email: Mapped[str | None] = mapped_column(Text)
    payer_user_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reference: Mapped[str] = mapped_column(Text, unique=True, index=True)
    status: Mapped[InvoicePaymentStatus] = mapped_column(
        Enum(InvoicePaymentStatus, name="invoice_payment_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=InvoicePaymentStatus.PENDING,
    )
    gateway: Mapped[str | None] = mapped_column(Text)
    gateway_ref: Mapped[str | None] = mapped_column(Text)


class SavedPaymentLink(Base):
    __tablename__ = "saved_payment_links"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payment_link_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="CASCADE"), index=True
    )
    saved_at: Mapped[CreatedAt]
