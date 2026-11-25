"""Weekly cross-border bulk settlement of the book-transfer pools.

A batch is a plan: which pool with spare cash should fund which pool that
has fronted payouts, netted into as few bank transfers as possible. Nothing
moves on the ledger until treasury has made a transfer at the bank and a
second admin approves booking it (treasury.rebalance, maker-checker).
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OptionalTimestamp, TimestampMixin, UUIDPk

Amount = Numeric(20, 2)


class SettlementBatch(Base, TimestampMixin):
    __tablename__ = "settlement_batches"
    __table_args__ = (
        CheckConstraint("status IN ('proposed','in_progress','settled','cancelled')", name="ck_settlement_batches_status"),
        Index("ix_settlement_batches_status", "status", "created_at"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="proposed", server_default="proposed")
    positions: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    unfunded: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    created_by: Mapped[str] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    settled_at: Mapped[OptionalTimestamp]


class SettlementLine(Base, TimestampMixin):
    __tablename__ = "settlement_lines"
    __table_args__ = (
        CheckConstraint("status IN ('pending','requested','settled','cancelled')", name="ck_settlement_lines_status"),
        CheckConstraint("from_amount > 0", name="ck_settlement_lines_amount"),
    )

    id: Mapped[UUIDPk]
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("settlement_batches.id", ondelete="CASCADE"),
                                                index=True)
    from_currency: Mapped[str] = mapped_column(String(3))
    to_currency: Mapped[str] = mapped_column(String(3))
    from_amount: Mapped[Decimal] = mapped_column(Amount)
    expected_to_amount: Mapped[Decimal | None] = mapped_column(Amount)
    rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    status: Mapped[str] = mapped_column(String(10), default="pending", server_default="pending")
    bank_reference: Mapped[str | None] = mapped_column(String(80))
    actual_from_amount: Mapped[Decimal | None] = mapped_column(Amount)
    actual_to_amount: Mapped[Decimal | None] = mapped_column(Amount)
    approval_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("approval_requests.id"))
    journal_reference: Mapped[str | None] = mapped_column(String(40))
    settled_at: Mapped[OptionalTimestamp]
