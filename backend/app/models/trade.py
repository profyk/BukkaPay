"""AfCFTA cross-border trade: supplier invoices, escrow contracts, and
tamper-evident trade receipts.

Money never lives in these tables: escrow funds sit in SYS_TRADE_ESCROW_<CCY>
on the ledger, and each contract points at the journal entries that funded
and settled it. These rows are the business record and audit trail.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, CurrencyCode, OptionalTimestamp, TimestampMixin, UUIDPk

Amount = Numeric(20, 2)        # ledger-aligned money (2 minor digits for ZAR/USD/BWP)
Precise = Numeric(19, 4)       # wholesale quantities and unit prices

INVOICE_STATUSES = ("draft", "issued", "paid", "in_escrow", "released", "refunded", "cancelled", "expired",
                    "disputed")
ESCROW_STATUSES = ("funded", "released", "refunded", "disputed")
ESCROW_EVENTS = ("funded", "buyer_confirmed", "delivery_verified", "released", "disputed", "resolved_release",
                 "resolved_refund", "refunded", "auto_released")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN (" + ",".join(f"'{v}'" for v in values) + ")"


class TradeInvoice(Base, TimestampMixin):
    """An itemised invoice a merchant/wholesaler sends to a (cross-border) buyer."""

    __tablename__ = "trade_invoices"
    __table_args__ = (
        CheckConstraint(_in("status", INVOICE_STATUSES), name="ck_trade_invoices_status"),
        CheckConstraint("payment_mode IN ('instant','escrow','either')", name="ck_trade_invoices_mode"),
        CheckConstraint("total > 0 AND subtotal >= 0 AND tax_total >= 0", name="ck_trade_invoices_amounts"),
        CheckConstraint("total = subtotal + tax_total", name="ck_trade_invoices_total"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(24), unique=True)  # TINV-XXXXXXXX
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="RESTRICT"), index=True)
    buyer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    buyer_name: Mapped[str] = mapped_column(Text)
    buyer_email: Mapped[str | None] = mapped_column(Text)
    buyer_phone: Mapped[str | None] = mapped_column(Text)
    buyer_country: Mapped[str | None] = mapped_column(String(2))
    seller_country: Mapped[str] = mapped_column(String(2))
    currency: Mapped[CurrencyCode]
    subtotal: Mapped[Decimal] = mapped_column(Amount)
    tax_total: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    total: Mapped[Decimal] = mapped_column(Amount)
    payment_mode: Mapped[str] = mapped_column(String(10), default="either")
    status: Mapped[str] = mapped_column(String(12), default="issued", index=True)
    incoterm: Mapped[str | None] = mapped_column(String(3))  # EXW, FCA, DAP…
    notes: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[OptionalTimestamp]
    expires_at: Mapped[OptionalTimestamp]
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class TradeInvoiceItem(Base):
    __tablename__ = "trade_invoice_items"
    __table_args__ = (
        UniqueConstraint("invoice_id", "line_no", name="uq_trade_invoice_items_line"),
        CheckConstraint("quantity > 0 AND unit_price >= 0 AND line_total >= 0", name="ck_trade_invoice_items_amounts"),
    )

    id: Mapped[UUIDPk]
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trade_invoices.id", ondelete="CASCADE"), index=True)
    line_no: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    hs_code: Mapped[str | None] = mapped_column(String(12))  # customs tariff code
    origin_country: Mapped[str | None] = mapped_column(String(2))
    quantity: Mapped[Decimal] = mapped_column(Precise)
    unit: Mapped[str | None] = mapped_column(String(16))  # kg, carton, each…
    unit_price: Mapped[Decimal] = mapped_column(Precise)
    line_total: Mapped[Decimal] = mapped_column(Amount)


class EscrowContract(Base, TimestampMixin):
    """Buyer money held in SYS_TRADE_ESCROW_<CCY> until release or refund."""

    __tablename__ = "escrow_contracts"
    __table_args__ = (
        CheckConstraint(_in("status", ESCROW_STATUSES), name="ck_escrow_contracts_status"),
        CheckConstraint("release_condition IN ('buyer_confirmation','delivery_verified')",
                        name="ck_escrow_contracts_condition"),
        CheckConstraint("amount > 0 AND fee_amount >= 0 AND fee_amount < amount", name="ck_escrow_contracts_amounts"),
        CheckConstraint("fee_rate >= 0 AND fee_rate <= 0.05", name="ck_escrow_contracts_fee_rate"),
        UniqueConstraint("buyer_user_id", "idempotency_key", name="uq_escrow_contracts_idempotency"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(24), unique=True)  # ESC-XXXXXXXX
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trade_invoices.id", ondelete="RESTRICT"), index=True)
    buyer_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="RESTRICT"), index=True)
    currency: Mapped[CurrencyCode]          # escrow / invoice currency
    amount: Mapped[Decimal] = mapped_column(Amount)
    fee_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4))  # 0.0100–0.0150
    fee_amount: Mapped[Decimal] = mapped_column(Amount)
    # When the buyer paid from another currency's wallet.
    buyer_currency: Mapped[str | None] = mapped_column(String(3))
    buyer_amount: Mapped[Decimal | None] = mapped_column(Amount)
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(20, 10))
    status: Mapped[str] = mapped_column(String(10), default="funded", index=True)
    release_condition: Mapped[str] = mapped_column(String(20), default="buyer_confirmation")
    auto_release_at: Mapped[OptionalTimestamp]
    funded_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"))
    settled_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"))
    dispute_reason: Mapped[str | None] = mapped_column(Text)
    disputed_at: Mapped[OptionalTimestamp]
    resolved_by: Mapped[str | None] = mapped_column(Text)
    resolution_note: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(200))


class EscrowEvent(Base):
    """Append-only history of an escrow contract (who did what, when)."""

    __tablename__ = "escrow_events"
    __table_args__ = (CheckConstraint(_in("event", ESCROW_EVENTS), name="ck_escrow_events_event"),)

    id: Mapped[UUIDPk]
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("escrow_contracts.id", ondelete="RESTRICT"), index=True)
    event: Mapped[str] = mapped_column(String(20))
    actor_type: Mapped[str] = mapped_column(String(10))  # buyer | merchant | admin | system
    actor_id: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[CreatedAt]


class TradeReceipt(Base):
    """Tamper-evident AfCFTA trade & payment receipt. `payload_sha256` hashes
    the canonical JSON payload; `previous_sha256` chains each receipt to the
    one before it, so altering or removing any receipt breaks the chain."""

    __tablename__ = "trade_receipts"
    __table_args__ = (
        CheckConstraint("char_length(payload_sha256) = 64", name="ck_trade_receipts_hash"),
        CheckConstraint("invoice_id IS NOT NULL OR escrow_contract_id IS NOT NULL", name="ck_trade_receipts_subject"),
    )

    id: Mapped[UUIDPk]
    receipt_number: Mapped[str] = mapped_column(String(24), unique=True)  # BKR-YYYY-NNNNNN
    sequence: Mapped[int] = mapped_column(Integer, unique=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trade_invoices.id", ondelete="RESTRICT"), index=True)
    escrow_contract_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("escrow_contracts.id", ondelete="RESTRICT"), index=True)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"))
    payload: Mapped[dict] = mapped_column(JSONB)
    payload_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    previous_sha256: Mapped[str | None] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
