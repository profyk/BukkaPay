"""The board / investor portal (board.bukkapay.com).

Board members are NOT admins: separate table, separate sign-in (password +
an emailed code every time), separate sessions, and an API that only ever
returns company-level aggregates — never a customer, merchant or staff
record. Only the owner (super admin) invites them and enters the monthly
management accounts (costs, cash, funding) that the ledger can't know."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedText
from app.db.base import Base
from app.models.mixins import CreatedOnlyMixin, TimestampMixin, UUIDPk

TS = DateTime(timezone=True)
AMOUNT = Numeric(16, 2)


class BoardMember(Base, CreatedOnlyMixin):
    __tablename__ = "board_members"

    id: Mapped[UUIDPk]
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    organisation: Mapped[str | None] = mapped_column(String(160))
    title: Mapped[str | None] = mapped_column(String(120))  # e.g. "Board member", "Investor, Seed"
    password_hash: Mapped[str | None] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                      ondelete="SET NULL"))
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(TS)
    accepted_at: Mapped[datetime | None] = mapped_column(TS)
    login_code_hash: Mapped[str | None] = mapped_column(String(64))
    login_code_expires_at: Mapped[datetime | None] = mapped_column(TS)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(TS)
    last_login_at: Mapped[datetime | None] = mapped_column(TS)
    # Boardroom (migration 0045)
    role: Mapped[str] = mapped_column(String(30), default="investor")
    permission_grants: Mapped[list] = mapped_column(JSONB, default=list)  # extra permissions for this person
    permission_denies: Mapped[list] = mapped_column(JSONB, default=list)  # removed from their role's set
    mfa_secret: Mapped[str | None] = mapped_column(EncryptedText)  # authenticator app (TOTP), encrypted
    mfa_pending_secret: Mapped[str | None] = mapped_column(EncryptedText)
    mfa_enabled_at: Mapped[datetime | None] = mapped_column(TS)
    reset_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    reset_expires_at: Mapped[datetime | None] = mapped_column(TS)
    suspended_at: Mapped[datetime | None] = mapped_column(TS)
    suspended_reason: Mapped[str | None] = mapped_column(Text)
    appointed_on: Mapped[date | None] = mapped_column(Date)
    phone: Mapped[str | None] = mapped_column(String(40))


class BoardSession(Base, CreatedOnlyMixin):
    __tablename__ = "board_sessions"

    id: Mapped[UUIDPk]
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_members.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(TS)
    revoked_at: Mapped[datetime | None] = mapped_column(TS)
    ip: Mapped[str | None] = mapped_column(String(64))
    last_seen_at: Mapped[datetime | None] = mapped_column(TS)
    user_agent: Mapped[str | None] = mapped_column(String(300))


class BoardAccessLog(Base, CreatedOnlyMixin):
    """What each board member opened and when (shown to the owner)."""
    __tablename__ = "board_access_log"

    id: Mapped[UUIDPk]
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_members.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(60))
    ip: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict | None] = mapped_column(JSONB)


class BoardFinancial(Base, TimestampMixin):
    """Monthly management accounts entered by the owner. Platform revenue and
    direct costs come from the ledger; these are the costs and balances the
    ledger doesn't hold."""
    __tablename__ = "board_financials"
    __table_args__ = (UniqueConstraint("month", name="uq_board_financials_month"),)

    id: Mapped[UUIDPk]
    month: Mapped[date] = mapped_column(Date)  # first day of the month
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    staff_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    technology_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    marketing_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    compliance_legal_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    office_admin_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    other_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    other_income: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    cash_balance: Mapped[Decimal | None] = mapped_column(AMOUNT)
    funding_raised: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    headcount: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    # Boardroom (migration 0045): fuller expense lines, P&L below EBITDA,
    # balance sheet and cash flow, and how far the figures can be relied on.
    cloud_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    banking_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    psp_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    cybersecurity_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    country_ops_costs: Mapped[Decimal] = mapped_column(AMOUNT, default=0)
    depreciation: Mapped[Decimal | None] = mapped_column(AMOUNT)
    amortisation: Mapped[Decimal | None] = mapped_column(AMOUNT)
    finance_costs: Mapped[Decimal | None] = mapped_column(AMOUNT)
    tax: Mapped[Decimal | None] = mapped_column(AMOUNT)
    receivables: Mapped[Decimal | None] = mapped_column(AMOUNT)
    other_assets: Mapped[Decimal | None] = mapped_column(AMOUNT)
    other_liabilities: Mapped[Decimal | None] = mapped_column(AMOUNT)
    equity: Mapped[Decimal | None] = mapped_column(AMOUNT)
    operating_cash_flow: Mapped[Decimal | None] = mapped_column(AMOUNT)
    investing_cash_flow: Mapped[Decimal | None] = mapped_column(AMOUNT)
    financing_cash_flow: Mapped[Decimal | None] = mapped_column(AMOUNT)
    accounts_status: Mapped[str] = mapped_column(String(16), default="management")  # draft/management/reviewed/audited
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                      ondelete="SET NULL"))


class BoardUpdate(Base, CreatedOnlyMixin):
    """Investor updates / letters from the owner."""
    __tablename__ = "board_updates"

    id: Mapped[UUIDPk]
    title: Mapped[str] = mapped_column(String(200))
    period: Mapped[str | None] = mapped_column(String(60))  # e.g. "November 2026"
    body: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(TS)
    # Boardroom (migration 0045): announcements with categories and audiences.
    category: Mapped[str] = mapped_column(String(30), default="business_update")
    audience: Mapped[list] = mapped_column(JSONB, default=list)  # roles; empty = everyone
    document_ids: Mapped[list] = mapped_column(JSONB, default=list)
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                     ondelete="SET NULL"))
