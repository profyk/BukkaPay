"""Cross-border payouts to bank accounts and mobile wallets (Onafriq today;
TCIB and Thunes later behind the same PayoutRail interface).

All amounts are integer MINOR units with an ISO 4217 code. The ledger
postings convert exactly (app.core.money.Minor)."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OptionalTimestamp, TimestampMixin, UUIDPk


class PayoutRecipient(Base, TimestampMixin):
    """A saved beneficiary: a bank account or a mobile wallet in a country."""

    __tablename__ = "payout_recipients"
    __table_args__ = (
        CheckConstraint("method IN ('bank','mobile_wallet')", name="ck_payout_recipients_method"),
        Index("ix_payout_recipients_user", "user_id", "deleted_at"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    nickname: Mapped[str | None] = mapped_column(String(60))
    country: Mapped[str] = mapped_column(String(2))
    currency: Mapped[str] = mapped_column(String(3))
    method: Mapped[str] = mapped_column(String(14))
    first_name: Mapped[str] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80))
    # Bank: bank_code + account_number (+ branch_code where the country uses one).
    bank_code: Mapped[str | None] = mapped_column(String(20))
    bank_name: Mapped[str | None] = mapped_column(String(80))
    branch_code: Mapped[str | None] = mapped_column(String(20))
    account_number: Mapped[str | None] = mapped_column(String(34))
    # Mobile wallet: E.164 number + operator.
    msisdn: Mapped[str | None] = mapped_column(String(16))
    operator: Mapped[str | None] = mapped_column(String(40))
    # Extra corridor fields (e.g. relationship, recipient address, ID number).
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)
    deleted_at: Mapped[OptionalTimestamp]


class Payout(Base, TimestampMixin):
    """quoted → confirmed → submitted → (processing) → paid
                          ↘ failed → reversed       paid → returned → reversed
    quoted → expired | cancelled. See app.payouts.states."""

    __tablename__ = "payouts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('quoted','confirmed','submitted','processing','paid','failed','returned','reversed',"
            "'expired','cancelled')", name="ck_payouts_status"),
        CheckConstraint("send_amount > 0 AND receive_amount > 0 AND fee_amount >= 0 AND fx_spread_amount >= 0",
                        name="ck_payouts_amounts"),
        Index("ix_payouts_user", "user_id", "created_at"),
        Index("ix_payouts_status", "status", "updated_at"),
        Index("uq_payouts_provider_ref", "rail", "provider_reference", unique=True,
              postgresql_where=text("provider_reference IS NOT NULL")),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    # Sent to the rail on every create call, so a retry never pays twice.
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"))
    source_wallet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="RESTRICT"))
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payout_recipients.id", ondelete="RESTRICT"))
    rail: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(12), default="quoted")
    country: Mapped[str] = mapped_column(String(2))
    method: Mapped[str] = mapped_column(String(14))
    # Money, in minor units. The customer pays send_amount + fee_amount (send currency).
    send_currency: Mapped[str] = mapped_column(String(3))
    send_amount: Mapped[int] = mapped_column(BigInteger)
    fee_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    receive_currency: Mapped[str] = mapped_column(String(3))
    receive_amount: Mapped[int] = mapped_column(BigInteger)
    # Our locked FX: mid rate (receive per 1 send) and the spread we keep (receive currency).
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    fx_spread_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    quote_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    provider_reference: Mapped[str | None] = mapped_column(String(120))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    debit_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    settle_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    reverse_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    confirmed_at: Mapped[OptionalTimestamp]
    completed_at: Mapped[OptionalTimestamp]
    purpose: Mapped[str | None] = mapped_column(String(40))
