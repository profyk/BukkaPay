"""Revenue and the cash agent network.

* PricingSetting      admin-editable pricing policy (account fee waivers, agent commissions…).
                      Prices themselves are fee rules (FeeSchedule), versioned.
* AccountFeeCharge    one row per customer per month for the monthly account fee:
                      charged, due (retrying), or waived (with the reason). Never debt.
* Agent               a verified merchant who exchanges cash for e-money (cash-in)
                      and e-money for cash (cash-out). Its e-money float is its
                      merchant balance.
* AgentTransaction    one cash-in or cash-out at an agent.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, OptionalTimestamp, TimestampMixin, UpdatedAt, UUIDPk

Amount = Numeric(20, 2)


class PricingSetting(Base):
    __tablename__ = "pricing_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    updated_by: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[UpdatedAt]


class AccountFeeCharge(Base, TimestampMixin):
    __tablename__ = "account_fee_charges"
    __table_args__ = (
        CheckConstraint("status IN ('charged','due','waived')", name="ck_account_fee_charges_status"),
        UniqueConstraint("user_id", "period", name="uq_account_fee_charges_user_period"),
        Index("ix_account_fee_charges_period_status", "period", "status"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    wallet_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id"))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Amount)
    status: Mapped[str] = mapped_column(String(8))
    reason: Mapped[str | None] = mapped_column(String(40))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_attempt_at: Mapped[OptionalTimestamp]
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    charged_at: Mapped[OptionalTimestamp]


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"
    __table_args__ = (
        CheckConstraint("status IN ('pending','active','suspended')", name="ck_agents_status"),
        UniqueConstraint("merchant_id", name="uq_agents_merchant"),
    )

    id: Mapped[UUIDPk]
    merchant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(10), default="pending", server_default="pending")
    display_name: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(60))
    country: Mapped[str] = mapped_column(String(2))
    currency: Mapped[str] = mapped_column(String(3))
    phone: Mapped[str | None] = mapped_column(String(20))
    opening_hours: Mapped[str | None] = mapped_column(String(80))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    daily_limit: Mapped[Decimal] = mapped_column(Amount, default=Decimal("20000.00"), server_default="20000.00")
    approved_at: Mapped[OptionalTimestamp]
    approved_by: Mapped[str | None] = mapped_column(Text)


class AgentTransaction(Base):
    __tablename__ = "agent_transactions"
    __table_args__ = (
        CheckConstraint("kind IN ('cash_in','cash_out')", name="ck_agent_tx_kind"),
        CheckConstraint("status IN ('pending','completed','expired','cancelled')", name="ck_agent_tx_status"),
        UniqueConstraint("code_hash", name="uq_agent_tx_code"),
        Index("ix_agent_tx_agent", "agent_id", "created_at"),
        Index("ix_agent_tx_user", "user_id", "created_at"),
        Index("ix_agent_tx_pending", "status", "expires_at"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    kind: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(10))
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agents.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    wallet_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id"))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Amount)
    fee: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"), server_default="0.00")
    commission: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"), server_default="0.00")
    code_hash: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hold_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    served_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    details: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[CreatedAt]
    completed_at: Mapped[OptionalTimestamp]
