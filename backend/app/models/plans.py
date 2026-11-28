"""Merchant plans: the catalogue BukkaPay's admins draft, price and publish,
and each business's subscription to one of them.

A plan's prices are per currency and per billing cycle
(`{"ZAR": {"monthly": "199.00", "yearly": "1990.00"}}`). A cycle with no
price can't be chosen in that currency, so drafting a plan before its prices
are decided is safe. Limits only apply once a plan is published.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
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
from app.models.mixins import CreatedAt, UpdatedAt, UUIDPk

PLAN_STATUSES = ("draft", "published", "retired")
SUBSCRIPTION_STATUSES = ("active", "past_due", "ended")
BILLING_CYCLES = ("monthly", "yearly")


class MerchantPlan(Base):
    __tablename__ = "merchant_plans"
    __table_args__ = (
        CheckConstraint("status IN ('draft','published','retired')", name="ck_merchant_plans_status"),
        CheckConstraint("trial_days >= 0 AND trial_days <= 365", name="ck_merchant_plans_trial_days"),
    )

    id: Mapped[UUIDPk]
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    tagline: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="draft", server_default="draft")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    highlighted: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    # The plan new businesses start on (exactly one should be marked).
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    trial_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    prices: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    features: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    limits: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    updated_by: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[CreatedAt]
    updated_at: Mapped[UpdatedAt]


class MerchantPlanSubscription(Base):
    """One row per period a business is on a plan. The live row is the one
    with status active/past_due; changes end it and start a new one."""

    __tablename__ = "merchant_plan_subscriptions"
    __table_args__ = (
        CheckConstraint("status IN ('active','past_due','ended')", name="ck_mps_status"),
        CheckConstraint("billing_cycle IN ('monthly','yearly')", name="ck_mps_cycle"),
        # At most one live period per business.
        Index("uq_mps_one_live_per_merchant", "merchant_id", unique=True,
              postgresql_where=text("status IN ('active','past_due')")),
    )

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True)
    plan_code: Mapped[str] = mapped_column(String(40), index=True)
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")
    currency: Mapped[str] = mapped_column(String(3))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(10), default="active", index=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # A downgrade or cancellation waits for the end of the paid period.
    next_plan_code: Mapped[str | None] = mapped_column(String(40))
    next_billing_cycle: Mapped[str | None] = mapped_column(String(10))
    renewal_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_reason: Mapped[str | None] = mapped_column(String(40))
    chosen_by: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[CreatedAt]
    updated_at: Mapped[UpdatedAt]


class MerchantPlanCharge(Base):
    """Every plan charge or credit, with the journal entry that moved the money."""

    __tablename__ = "merchant_plan_charges"
    __table_args__ = (
        CheckConstraint("status IN ('charged','failed','credited')", name="ck_mpc_status"),
    )

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True)
    subscription_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("merchant_plan_subscriptions.id", ondelete="SET NULL"))
    plan_code: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(20))  # start | upgrade | renewal
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"), server_default="0")
    status: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str | None] = mapped_column(Text)
    journal_entry_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[CreatedAt]
