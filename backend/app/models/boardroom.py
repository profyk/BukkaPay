"""BukkaPay Boardroom: governance, investor records, reporting and oversight.

Extends the board portal (app.models.board). Everything here is company-level
or board-level data. None of these tables holds a customer's personal or
financial record, and none is reachable through the operational admin API
except the owner's board management screens.

Integrity rules enforced in the database (migration 0045, app.board.ddl):
  * boardroom_audit_logs, board_resolution_votes: append-only.
  * board_report_publications: a published report's content can't change;
    corrections are a new version that supersedes it.
  * board_resolutions: a concluded resolution can't change.
  * board_minutes: published minutes can't change.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedOnlyMixin, TimestampMixin, UUIDPk

TS = DateTime(timezone=True)
AMOUNT = Numeric(20, 2)
RATE = Numeric(24, 10)


def _member(ondelete: str = "SET NULL"):
    return ForeignKey("board_members.id", ondelete=ondelete)


def _doc():
    return ForeignKey("board_documents.id", ondelete="SET NULL")


# ─── audit ──────────────────────────────────────────────────────────────────

class BoardroomAuditLog(Base, CreatedOnlyMixin):
    """Every sensitive Boardroom action. Append-only (DB trigger)."""
    __tablename__ = "boardroom_audit_logs"
    __table_args__ = (Index("ix_boardroom_audit_created", "created_at"),)

    id: Mapped[UUIDPk]
    actor_member_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _member())
    actor_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                          ondelete="SET NULL"))
    actor_label: Mapped[str | None] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(60))
    target_id: Mapped[str | None] = mapped_column(String(64))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))


# ─── exchange rates for reporting ───────────────────────────────────────────

class BoardFxRate(Base, CreatedOnlyMixin):
    """Daily mid-market snapshot used to convert historical periods. A month
    is converted at the last snapshot on or before its last day, never at
    today's rate. `mid` = units of `currency` per 1 `base`."""
    __tablename__ = "board_fx_rates"
    __table_args__ = (UniqueConstraint("rate_date", "currency", name="uq_board_fx_rates_day_ccy"),)

    id: Mapped[UUIDPk]
    rate_date: Mapped[date] = mapped_column(Date, index=True)
    base: Mapped[str] = mapped_column(String(3))
    currency: Mapped[str] = mapped_column(String(3))
    mid: Mapped[Decimal] = mapped_column(RATE)
    source: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(TS)


# ─── reporting periods, publications, budgets, targets ──────────────────────

class BoardReportingPeriod(Base, TimestampMixin):
    """A closed or locked period's management accounts can't be edited."""
    __tablename__ = "board_reporting_periods"
    __table_args__ = (
        UniqueConstraint("kind", "start_date", name="uq_board_periods_kind_start"),
        CheckConstraint("kind IN ('month','quarter','year')", name="ck_board_periods_kind"),
        CheckConstraint("status IN ('open','closed','locked')", name="ck_board_periods_status"),
        CheckConstraint("end_date >= start_date", name="ck_board_periods_range"),
    )

    id: Mapped[UUIDPk]
    kind: Mapped[str] = mapped_column(String(10))
    label: Mapped[str] = mapped_column(String(60))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="open")
    closed_by: Mapped[str | None] = mapped_column(String(200))
    closed_at: Mapped[datetime | None] = mapped_column(TS)


class BoardReportPublication(Base, CreatedOnlyMixin):
    """A frozen report: the data, the methodology and who approved it.
    Published versions are immutable; a correction is a new version."""
    __tablename__ = "board_report_publications"
    __table_args__ = (
        UniqueConstraint("series_key", "version", name="uq_board_reports_series_version"),
        CheckConstraint("status IN ('draft','approved','published','superseded','withdrawn')",
                        name="ck_board_reports_status"),
        CheckConstraint("kind IN ('monthly','quarterly','annual','custom','board_pack')", name="ck_board_reports_kind"),
    )

    id: Mapped[UUIDPk]
    series_key: Mapped[str] = mapped_column(String(80), index=True)  # e.g. "monthly:2026-10"
    version: Mapped[int] = mapped_column(Integer, default=1)
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                            ForeignKey("board_report_publications.id",
                                                                       ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(200))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    reporting_currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(12), default="draft")
    audience: Mapped[list] = mapped_column(JSONB, default=list)  # roles; empty = every Boardroom member
    summary: Mapped[str | None] = mapped_column(Text)
    snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    methodology: Mapped[dict] = mapped_column(JSONB, default=dict)
    reconciliation_status: Mapped[str] = mapped_column(String(20), default="not_reconciled")
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    created_by: Mapped[str | None] = mapped_column(String(200))
    approved_by: Mapped[str | None] = mapped_column(String(200))
    approved_at: Mapped[datetime | None] = mapped_column(TS)
    published_by: Mapped[str | None] = mapped_column(String(200))
    published_at: Mapped[datetime | None] = mapped_column(TS)
    correction_note: Mapped[str | None] = mapped_column(Text)


class BoardBudget(Base, TimestampMixin):
    """Approved budget per month and expense category (budget vs actual)."""
    __tablename__ = "board_budgets"
    __table_args__ = (UniqueConstraint("month", "category", name="uq_board_budgets_month_category"),)

    id: Mapped[UUIDPk]
    month: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(40))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    amount: Mapped[Decimal] = mapped_column(AMOUNT)
    updated_by: Mapped[str | None] = mapped_column(String(200))


class BoardKpiTarget(Base, TimestampMixin):
    __tablename__ = "board_kpi_targets"
    __table_args__ = (UniqueConstraint("metric", "period_start", name="uq_board_kpi_targets"),)

    id: Mapped[UUIDPk]
    metric: Mapped[str] = mapped_column(String(60))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    target: Mapped[Decimal] = mapped_column(AMOUNT)
    currency: Mapped[str | None] = mapped_column(String(3))
    notes: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[str | None] = mapped_column(String(200))


class BoardRevenueStream(Base, TimestampMixin):
    """Implementation status of each revenue stream, set by the owner.
    Actual revenue always comes from the ledger; a planned stream never
    shows an amount."""
    __tablename__ = "board_revenue_streams"
    __table_args__ = (
        CheckConstraint("status IN ('operational','in_development','planned','disabled')",
                        name="ck_board_revenue_streams_status"),
    )

    code: Mapped[str] = mapped_column(String(40), primary_key=True)  # ledger revenue code segment
    label: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), default="in_development")
    notes: Mapped[str | None] = mapped_column(Text)


# ─── investors, rounds, investments, shareholdings ──────────────────────────

class InvestorProfile(Base, TimestampMixin):
    __tablename__ = "investor_profiles"
    __table_args__ = (
        CheckConstraint("entity_type IN ('individual','company','fund','trust','other')",
                        name="ck_investor_profiles_entity"),
    )

    id: Mapped[UUIDPk]
    member_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _member(), unique=True)
    legal_name: Mapped[str] = mapped_column(String(200))
    entity_type: Mapped[str] = mapped_column(String(12), default="individual")
    country: Mapped[str | None] = mapped_column(String(2))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)


class FundingRound(Base, TimestampMixin):
    __tablename__ = "funding_rounds"
    __table_args__ = (
        CheckConstraint("status IN ('planned','open','closed','cancelled')", name="ck_funding_rounds_status"),
        CheckConstraint("target_amount >= 0", name="ck_funding_rounds_target"),
    )

    id: Mapped[UUIDPk]
    name: Mapped[str] = mapped_column(String(120))
    instrument: Mapped[str] = mapped_column(String(30))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    target_amount: Mapped[Decimal] = mapped_column(AMOUNT)
    # A valuation is shown only with its approval reference (board/shareholder resolution).
    valuation_pre_money: Mapped[Decimal | None] = mapped_column(AMOUNT)
    valuation_reference: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="planned")
    opened_on: Mapped[date | None] = mapped_column(Date)
    closed_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class InvestorInvestment(Base, TimestampMixin):
    __tablename__ = "investor_investments"
    __table_args__ = (
        CheckConstraint("committed_amount >= 0 AND received_amount >= 0", name="ck_investor_investments_amounts"),
        CheckConstraint("status IN ('committed','partially_received','received','cancelled')",
                        name="ck_investor_investments_status"),
    )

    id: Mapped[UUIDPk]
    investor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("investor_profiles.id",
                                                                               ondelete="RESTRICT"), index=True)
    round_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("funding_rounds.id",
                                                                                     ondelete="RESTRICT"), index=True)
    instrument: Mapped[str] = mapped_column(String(30))
    currency: Mapped[str] = mapped_column(String(3))
    committed_amount: Mapped[Decimal] = mapped_column(AMOUNT)
    received_amount: Mapped[Decimal] = mapped_column(AMOUNT, default=Decimal("0"))
    commitment_date: Mapped[date | None] = mapped_column(Date)
    received_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="committed")
    legal_reference: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class ShareholderRecord(Base, TimestampMixin):
    """A line of the share register, copied from the approved legal records.
    The Boardroom never issues shares or changes legal ownership."""
    __tablename__ = "shareholder_records"
    __table_args__ = (CheckConstraint("shares > 0", name="ck_shareholder_records_shares"),)

    id: Mapped[UUIDPk]
    investor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("investor_profiles.id",
                                                                               ondelete="RESTRICT"), index=True)
    share_class: Mapped[str] = mapped_column(String(40), default="Ordinary")
    shares: Mapped[Decimal] = mapped_column(Numeric(24, 0))
    effective_date: Mapped[date] = mapped_column(Date)
    legal_reference: Mapped[str] = mapped_column(Text)  # register entry / resolution / certificate number
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _doc())
    voting: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)


# ─── use of funds ───────────────────────────────────────────────────────────

FUND_CATEGORIES = ("software_development", "wallet_infrastructure", "pos_interoperability", "banking_partnerships",
                   "psp_integrations", "cybersecurity", "regulatory_compliance", "marketing", "customer_acquisition",
                   "merchant_acquisition", "country_expansion", "operations", "working_capital")


class CapitalAllocation(Base, TimestampMixin):
    __tablename__ = "capital_allocations"
    __table_args__ = (
        UniqueConstraint("round_id", "category", name="uq_capital_allocations_round_category"),
        CheckConstraint("approved_budget >= 0 AND allocated >= 0", name="ck_capital_allocations_amounts"),
    )

    id: Mapped[UUIDPk]
    round_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("funding_rounds.id",
                                                                                     ondelete="RESTRICT"))
    category: Mapped[str] = mapped_column(String(40))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    approved_budget: Mapped[Decimal] = mapped_column(AMOUNT, default=Decimal("0"))
    allocated: Mapped[Decimal] = mapped_column(AMOUNT, default=Decimal("0"))
    responsible: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)


class CapitalAllocationChange(Base, CreatedOnlyMixin):
    """Budget changes need a second person: proposed, then approved by the
    owner (or rejected). History is kept forever."""
    __tablename__ = "capital_allocation_changes"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected')", name="ck_capital_changes_status"),
    )

    id: Mapped[UUIDPk]
    allocation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("capital_allocations.id",
                                                                                          ondelete="RESTRICT"))
    round_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("funding_rounds.id",
                                                                                     ondelete="RESTRICT"))
    category: Mapped[str] = mapped_column(String(40))
    currency: Mapped[str] = mapped_column(String(3))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    proposed_by: Mapped[str] = mapped_column(String(200))
    decided_by: Mapped[str | None] = mapped_column(String(200))
    decided_at: Mapped[datetime | None] = mapped_column(TS)


class CapitalExpenditure(Base, CreatedOnlyMixin):
    __tablename__ = "capital_expenditures"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_capital_expenditures_amount"),)

    id: Mapped[UUIDPk]
    allocation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("capital_allocations.id",
                                                                                   ondelete="RESTRICT"), index=True)
    spent_on: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(AMOUNT)
    currency: Mapped[str] = mapped_column(String(3))
    description: Mapped[str] = mapped_column(Text)
    supplier: Mapped[str | None] = mapped_column(String(200))
    invoice_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _doc())
    recorded_by: Mapped[str | None] = mapped_column(String(200))


# ─── milestones, risks ──────────────────────────────────────────────────────

class BusinessMilestone(Base, TimestampMixin):
    __tablename__ = "business_milestones"
    __table_args__ = (
        CheckConstraint("status IN ('planned','in_progress','completed','delayed','cancelled')",
                        name="ck_business_milestones_status"),
        CheckConstraint("progress BETWEEN 0 AND 100", name="ck_business_milestones_progress"),
        CheckConstraint("partnership_stage IN ('not_applicable','proposed','in_discussion','signed','live')",
                        name="ck_business_milestones_stage"),
    )

    id: Mapped[UUIDPk]
    category: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    responsible: Mapped[str | None] = mapped_column(String(160))
    country_code: Mapped[str | None] = mapped_column(String(2))
    target_date: Mapped[date | None] = mapped_column(Date)
    completed_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="planned")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    partnership_stage: Mapped[str] = mapped_column(String(16), default="not_applicable")
    document_ids: Mapped[list] = mapped_column(JSONB, default=list)
    comments: Mapped[str | None] = mapped_column(Text)


class CompanyRisk(Base, TimestampMixin):
    __tablename__ = "company_risks"
    __table_args__ = (
        CheckConstraint("likelihood BETWEEN 1 AND 5 AND impact BETWEEN 1 AND 5", name="ck_company_risks_scale"),
        CheckConstraint("status IN ('open','mitigating','accepted','closed')", name="ck_company_risks_status"),
    )

    id: Mapped[UUIDPk]
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40))
    likelihood: Mapped[int] = mapped_column(Integer)
    impact: Mapped[int] = mapped_column(Integer)
    owner: Mapped[str | None] = mapped_column(String(160))
    mitigation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="open")
    review_date: Mapped[date | None] = mapped_column(Date)


# ─── custodian reconciliations ──────────────────────────────────────────────

class CustodianReconciliation(Base, CreatedOnlyMixin):
    """A custodian balance recorded against the ledger. `source` says how the
    balance was obtained; nothing is called verified without evidence."""
    __tablename__ = "custodian_reconciliations"
    __table_args__ = (
        CheckConstraint("source IN ('live_integration','manual_statement','management_reported')",
                        name="ck_custodian_recon_source"),
        CheckConstraint("status IN ('reconciled','unreconciled','under_review')", name="ck_custodian_recon_status"),
        Index("ix_custodian_recon_custodian_date", "custodian_id", "statement_date"),
    )

    id: Mapped[UUIDPk]
    custodian_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("custodians.id",
                                                                                ondelete="RESTRICT"))
    country_code: Mapped[str] = mapped_column(String(2))
    currency: Mapped[str] = mapped_column(String(3))
    statement_date: Mapped[date] = mapped_column(Date)
    reported_balance: Mapped[Decimal] = mapped_column(AMOUNT)
    ledger_liability: Mapped[Decimal] = mapped_column(AMOUNT)  # customer + merchant funds at record time
    difference: Mapped[Decimal] = mapped_column(AMOUNT)
    pending_settlements: Mapped[Decimal | None] = mapped_column(AMOUNT)
    source: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(14))
    statement_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _doc())
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str | None] = mapped_column(String(200))


# ─── documents ──────────────────────────────────────────────────────────────

DOC_CATEGORIES = ("investor_presentation", "monthly_report", "quarterly_report", "annual_report",
                  "financial_statement", "board_minutes", "board_resolution", "shareholder_agreement",
                  "company_registration", "compliance_report", "strategic_plan", "partnership", "invoice",
                  "custodian_statement", "meeting_pack", "other")


class BoardDocument(Base, CreatedOnlyMixin):
    """A file in private storage. Downloads are short-lived signed URLs,
    issued only to members whose role is in `audience`."""
    __tablename__ = "board_documents"
    __table_args__ = (
        UniqueConstraint("family_id", "version", name="uq_board_documents_family_version"),
        Index("ix_board_documents_category", "category"),
    )

    id: Mapped[UUIDPk]
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)  # versions share this
    version: Mapped[int] = mapped_column(Integer, default=1)
    category: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    audience: Mapped[list] = mapped_column(JSONB, default=list)  # roles allowed; owner always
    storage_ref: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(200))
    mime_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[str | None] = mapped_column(String(200))
    uploaded_by_member: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), _member())
    meeting_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("board_meetings.id",
                                                                                       ondelete="SET NULL"))
    archived_at: Mapped[datetime | None] = mapped_column(TS)


# ─── meetings, minutes, resolutions ─────────────────────────────────────────

class BoardMeeting(Base, TimestampMixin):
    __tablename__ = "board_meetings"
    __table_args__ = (
        CheckConstraint("status IN ('scheduled','held','cancelled')", name="ck_board_meetings_status"),
        CheckConstraint("kind IN ('board','committee','agm','egm','investor')", name="ck_board_meetings_kind"),
    )

    id: Mapped[UUIDPk]
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(10), default="board")
    scheduled_at: Mapped[datetime] = mapped_column(TS)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    location: Mapped[str | None] = mapped_column(String(200))
    video_link: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(10), default="scheduled")
    created_by: Mapped[str | None] = mapped_column(String(200))


class BoardMeetingAttendee(Base, CreatedOnlyMixin):
    __tablename__ = "board_meeting_attendees"
    __table_args__ = (
        UniqueConstraint("meeting_id", "member_id", name="uq_board_meeting_attendee"),
        CheckConstraint("attendance IN ('invited','present','absent','apologies')", name="ck_board_attendance"),
    )

    id: Mapped[UUIDPk]
    meeting_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_meetings.id",
                                                                              ondelete="CASCADE"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _member("CASCADE"))
    attendance: Mapped[str] = mapped_column(String(10), default="invited")


class BoardAgendaItem(Base, CreatedOnlyMixin):
    __tablename__ = "board_agenda_items"

    id: Mapped[UUIDPk]
    meeting_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_meetings.id",
                                                                              ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    presenter: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    document_ids: Mapped[list] = mapped_column(JSONB, default=list)


class BoardMinutes(Base, TimestampMixin):
    __tablename__ = "board_minutes"
    __table_args__ = (CheckConstraint("status IN ('draft','approved','published')", name="ck_board_minutes_status"),)

    id: Mapped[UUIDPk]
    meeting_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_meetings.id",
                                                                              ondelete="RESTRICT"), unique=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="draft")
    approved_by: Mapped[str | None] = mapped_column(String(200))
    published_at: Mapped[datetime | None] = mapped_column(TS)


class BoardResolution(Base, TimestampMixin):
    __tablename__ = "board_resolutions"
    __table_args__ = (
        CheckConstraint("status IN ('draft','open','concluded','cancelled')", name="ck_board_resolutions_status"),
        CheckConstraint("body_type IN ('board','shareholders')", name="ck_board_resolutions_body"),
        CheckConstraint("threshold IN ('simple_majority','two_thirds','three_quarters','unanimous')",
                        name="ck_board_resolutions_threshold"),
        CheckConstraint("outcome IS NULL OR outcome IN ('passed','not_passed','no_quorum')",
                        name="ck_board_resolutions_outcome"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(30), unique=True)
    meeting_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("board_meetings.id",
                                                                                       ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    # Directors and shareholders vote as different bodies; never mixed.
    body_type: Mapped[str] = mapped_column(String(14), default="board")
    threshold: Mapped[str] = mapped_column(String(16), default="simple_majority")
    quorum: Mapped[int] = mapped_column(Integer, default=1)  # minimum number of votes cast (incl. abstain)
    weighted: Mapped[bool] = mapped_column(Boolean, default=False)
    weighting_basis: Mapped[str | None] = mapped_column(Text)  # the legal authority for the weights
    document_ids: Mapped[list] = mapped_column(JSONB, default=list)
    opens_at: Mapped[datetime | None] = mapped_column(TS)
    closes_at: Mapped[datetime | None] = mapped_column(TS)
    status: Mapped[str] = mapped_column(String(10), default="draft")
    outcome: Mapped[str | None] = mapped_column(String(10))
    result: Mapped[dict | None] = mapped_column(JSONB)
    concluded_at: Mapped[datetime | None] = mapped_column(TS)
    created_by: Mapped[str | None] = mapped_column(String(200))


class BoardResolutionEligibility(Base, CreatedOnlyMixin):
    __tablename__ = "board_resolution_eligibility"
    __table_args__ = (
        UniqueConstraint("resolution_id", "member_id", name="uq_board_resolution_eligibility"),
        CheckConstraint("weight > 0", name="ck_board_resolution_eligibility_weight"),
    )

    id: Mapped[UUIDPk]
    resolution_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_resolutions.id",
                                                                                 ondelete="CASCADE"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _member("CASCADE"))
    weight: Mapped[Decimal] = mapped_column(Numeric(24, 4), default=Decimal("1"))


class BoardResolutionVote(Base, CreatedOnlyMixin):
    """One final vote per eligible member. Append-only (DB trigger)."""
    __tablename__ = "board_resolution_votes"
    __table_args__ = (
        UniqueConstraint("resolution_id", "member_id", name="uq_board_resolution_vote"),
        CheckConstraint("choice IN ('for','against','abstain')", name="ck_board_resolution_votes_choice"),
    )

    id: Mapped[UUIDPk]
    resolution_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("board_resolutions.id",
                                                                                 ondelete="RESTRICT"), index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _member("RESTRICT"))
    choice: Mapped[str] = mapped_column(String(8))
    weight: Mapped[Decimal] = mapped_column(Numeric(24, 4))
    ip: Mapped[str | None] = mapped_column(String(64))


# ─── notifications ──────────────────────────────────────────────────────────

class BoardNotification(Base, CreatedOnlyMixin):
    __tablename__ = "board_notifications"
    __table_args__ = (Index("ix_board_notifications_member", "member_id", "created_at"),)

    id: Mapped[UUIDPk]
    member_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), _member("CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(TS)
