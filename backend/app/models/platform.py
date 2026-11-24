"""Network configuration and operations: countries, custodians, providers,
corridors, fees, limits, FX quotes, cross-border transfers, webhooks,
outbox, audit, approvals, reconciliation and compliance.

Everything that makes a country or corridor "live" is data here, gated by
readiness flags and approvals — never a code change.
"""

import uuid
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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, OptionalTimestamp, TimestampMixin, UUIDPk

Amount = Numeric(20, 2)
Rate = Numeric(20, 8)


def _ccy() -> ForeignKey:
    return ForeignKey("currencies.code", ondelete="RESTRICT")


def _country() -> ForeignKey:
    return ForeignKey("countries.code", ondelete="RESTRICT")


# ─── Countries ──────────────────────────────────────────────────────────────

COUNTRY_STATUSES = ("planned", "pilot", "live", "suspended")


class Country(Base, TimestampMixin):
    __tablename__ = "countries"
    __table_args__ = (
        CheckConstraint("code ~ '^[A-Z]{2}$'", name="ck_countries_code_iso2"),
        CheckConstraint("status IN ('planned','pilot','live','suspended')", name="ck_countries_status"),
    )

    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    region: Mapped[str] = mapped_column(String(40), default="Africa")
    dial_code: Mapped[str | None] = mapped_column(String(8))
    default_currency: Mapped[str] = mapped_column(String(3), _ccy())
    status: Mapped[str] = mapped_column(String(20), default="planned")
    # Readiness gates: all must be true before status can become pilot/live.
    compliance_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    custodian_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    provider_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    # Minimum KYC level to hold a wallet / transact, per country.
    kyc_requirements: Mapped[dict] = mapped_column(JSONB, default=dict)
    regulatory_notes: Mapped[str | None] = mapped_column(Text)
    launched_at: Mapped[OptionalTimestamp]


class CountryCurrency(Base):
    __tablename__ = "country_currencies"

    country_code: Mapped[str] = mapped_column(String(2), _country(), primary_key=True)
    currency_code: Mapped[str] = mapped_column(String(3), _ccy(), primary_key=True)
    wallet_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


# ─── Custodians & providers ────────────────────────────────────────────────


class Custodian(Base, TimestampMixin):
    """A regulated institution that safeguards / holds customer funds in a
    country. BukkaPay never holds funds without one."""

    __tablename__ = "custodians"
    __table_args__ = (
        CheckConstraint(
            "institution_type IN ('bank','emi','trust','mobile_money','other')", name="ck_custodians_type"
        ),
        CheckConstraint(
            "status IN ('prospect','onboarding','active','suspended','terminated')", name="ck_custodians_status"
        ),
    )

    id: Mapped[UUIDPk]
    name: Mapped[str] = mapped_column(Text)
    country_code: Mapped[str] = mapped_column(String(2), _country(), index=True)
    institution_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="prospect")
    integration_status: Mapped[str] = mapped_column(String(20), default="none")  # none/sandbox/production
    regulatory_status: Mapped[str] = mapped_column(Text, default="not_started")
    safeguarding_arrangement: Mapped[str | None] = mapped_column(Text)
    api_config_ref: Mapped[str | None] = mapped_column(Text)  # name of a secret, never the secret
    contact: Mapped[dict] = mapped_column(JSONB, default=dict)


class CountryCustodian(Base, TimestampMixin):
    """Which custodian backs balances in (country, currency). Changes go
    through approvals; a new primary never silently re-points existing
    liabilities — it starts 'pending' and is activated by an approved,
    reconciled migration."""

    __tablename__ = "country_custodians"
    __table_args__ = (
        CheckConstraint("role IN ('primary','backup')", name="ck_country_custodians_role"),
        CheckConstraint("status IN ('pending','active','retired')", name="ck_country_custodians_status"),
        Index(
            "uq_country_custodians_active_primary", "country_code", "currency_code",
            unique=True, postgresql_where="role = 'primary' AND status = 'active'",
        ),
    )

    id: Mapped[UUIDPk]
    country_code: Mapped[str] = mapped_column(String(2), _country())
    currency_code: Mapped[str] = mapped_column(String(3), _ccy())
    custodian_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("custodians.id", ondelete="RESTRICT")
    )
    role: Mapped[str] = mapped_column(String(10), default="primary")
    status: Mapped[str] = mapped_column(String(10), default="pending")
    settlement_account_ref: Mapped[str | None] = mapped_column(Text)
    collection_methods: Mapped[list] = mapped_column(JSONB, default=list)
    withdrawal_methods: Mapped[list] = mapped_column(JSONB, default=list)
    reconciliation_settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    effective_from: Mapped[OptionalTimestamp]
    effective_to: Mapped[OptionalTimestamp]


PROVIDER_TYPES = ("bank", "psp", "card", "mobile_money", "network", "settlement", "fx")


class PaymentProvider(Base, TimestampMixin):
    __tablename__ = "payment_providers"
    __table_args__ = (
        CheckConstraint(
            "provider_type IN ('bank','psp','card','mobile_money','network','settlement','fx')",
            name="ck_payment_providers_type",
        ),
        CheckConstraint("mode IN ('sandbox','production')", name="ck_payment_providers_mode"),
        CheckConstraint("status IN ('inactive','active','degraded','suspended')", name="ck_payment_providers_status"),
    )

    id: Mapped[UUIDPk]
    code: Mapped[str] = mapped_column(String(40), unique=True)  # adapter key, e.g. "stitch", "sandbox", "papss"
    name: Mapped[str] = mapped_column(Text)
    provider_type: Mapped[str] = mapped_column(String(20))
    country_code: Mapped[str | None] = mapped_column(String(2), _country())
    currencies: Mapped[list] = mapped_column(JSONB, default=list)
    methods: Mapped[list] = mapped_column(JSONB, default=list)  # bank_transfer, card, mobile_money, eft...
    mode: Mapped[str] = mapped_column(String(12), default="sandbox")
    status: Mapped[str] = mapped_column(String(12), default="inactive")
    webhook_status: Mapped[str] = mapped_column(String(20), default="not_configured")
    limits: Mapped[dict] = mapped_column(JSONB, default=dict)
    credentials_ref: Mapped[str | None] = mapped_column(Text)  # env var / secret name only
    last_health_at: Mapped[OptionalTimestamp]


# ─── Corridors, FX, fees, limits ───────────────────────────────────────────

CORRIDOR_STATUSES = ("draft", "pilot", "active", "suspended")


class PaymentCorridor(Base, TimestampMixin):
    """An approved route for cross-border money: who sends, who receives,
    which rail settles it and how it is funded."""

    __tablename__ = "payment_corridors"
    __table_args__ = (
        UniqueConstraint(
            "from_country", "to_country", "from_currency", "to_currency", name="uq_payment_corridors_route"
        ),
        CheckConstraint("status IN ('draft','pilot','active','suspended')", name="ck_payment_corridors_status"),
        CheckConstraint(
            "settlement_model IN ('prefunded','net_settlement','internal_book')",
            name="ck_payment_corridors_settlement_model",
        ),
    )

    id: Mapped[UUIDPk]
    from_country: Mapped[str] = mapped_column(String(2), _country())
    to_country: Mapped[str] = mapped_column(String(2), _country())
    from_currency: Mapped[str] = mapped_column(String(3), _ccy())
    to_currency: Mapped[str] = mapped_column(String(3), _ccy())
    rail_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_providers.id", ondelete="RESTRICT")
    )
    fx_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_providers.id", ondelete="RESTRICT")
    )
    # Backup rails, tried in order when the main rail is down or refuses.
    fallback_provider_ids: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    settlement_model: Mapped[str] = mapped_column(String(20), default="prefunded")
    status: Mapped[str] = mapped_column(String(12), default="draft")
    min_amount: Mapped[Decimal] = mapped_column(Amount, default=Decimal("10"))
    max_amount: Mapped[Decimal] = mapped_column(Amount, default=Decimal("50000"))
    # Executable FX: the rate the provider quoted, its age limit and markup.
    rate: Mapped[Decimal | None] = mapped_column(Rate)
    rate_source: Mapped[str] = mapped_column(Text, default="manual")
    rate_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_rate_age_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    fx_markup_bps: Mapped[int] = mapped_column(Integer, default=0)
    quote_ttl_seconds: Mapped[int] = mapped_column(Integer, default=60)
    # Destination liquidity available to pay out (prefunded model).
    liquidity_limit: Mapped[Decimal | None] = mapped_column(Amount)
    notes: Mapped[str | None] = mapped_column(Text)


class FxQuote(Base):
    __tablename__ = "fx_quotes"
    __table_args__ = (
        CheckConstraint("status IN ('open','used','expired')", name="ck_fx_quotes_status"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    corridor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_corridors.id", ondelete="RESTRICT")
    )
    product: Mapped[str] = mapped_column(String(30))
    from_currency: Mapped[str] = mapped_column(String(3), _ccy())
    to_currency: Mapped[str] = mapped_column(String(3), _ccy())
    source_amount: Mapped[Decimal] = mapped_column(Amount)
    fee: Mapped[Decimal] = mapped_column(Amount)
    rate: Mapped[Decimal] = mapped_column(Rate)
    destination_amount: Mapped[Decimal] = mapped_column(Amount)
    fee_breakdown: Mapped[dict] = mapped_column(JSONB, default=dict)
    rate_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(10), default="open")
    created_at: Mapped[CreatedAt]


FEE_PRODUCTS = (
    "p2p", "cross_border", "merchant_payment", "payment_link", "funding", "withdrawal",
    "card_issuance", "card_maintenance", "contribution_payout", "trade_escrow",
)


class FeeSchedule(Base, TimestampMixin):
    """A fee rule. The most specific active rule wins (country+currency+method
    over currency-only over global); ties go to the higher priority. The
    exact rule and computed fee are stored on every transaction, so editing a
    rule never changes history."""

    __tablename__ = "fee_schedules"
    __table_args__ = (
        CheckConstraint("percentage >= 0 AND fixed >= 0", name="ck_fee_schedules_nonneg"),
    )

    id: Mapped[UUIDPk]
    product: Mapped[str] = mapped_column(String(30), index=True)
    country_code: Mapped[str | None] = mapped_column(String(2), _country())
    currency: Mapped[str | None] = mapped_column(String(3), _ccy())
    method: Mapped[str | None] = mapped_column(String(30))
    merchant_category: Mapped[str | None] = mapped_column(String(40))
    customer_type: Mapped[str | None] = mapped_column(String(20))
    corridor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_corridors.id", ondelete="CASCADE")
    )
    min_amount: Mapped[Decimal | None] = mapped_column(Amount)
    max_amount: Mapped[Decimal | None] = mapped_column(Amount)
    percentage: Mapped[Decimal] = mapped_column(Numeric(7, 4), default=Decimal("0"))
    fixed: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0"))
    cap: Mapped[Decimal | None] = mapped_column(Amount)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    effective_from: Mapped[OptionalTimestamp]
    effective_to: Mapped[OptionalTimestamp]


class TransactionLimit(Base, TimestampMixin):
    """Per-product limits by country/currency and KYC level. Missing rule =
    no limit beyond the corridor/provider ones."""

    __tablename__ = "transaction_limits"

    id: Mapped[UUIDPk]
    product: Mapped[str] = mapped_column(String(30), index=True)
    country_code: Mapped[str | None] = mapped_column(String(2), _country())
    currency: Mapped[str | None] = mapped_column(String(3), _ccy())
    kyc_level: Mapped[int] = mapped_column(Integer, default=0)
    per_transaction_min: Mapped[Decimal | None] = mapped_column(Amount)
    # 0 means "not allowed at this KYC level".
    per_transaction_max: Mapped[Decimal | None] = mapped_column(Amount)
    daily_max: Mapped[Decimal | None] = mapped_column(Amount)
    monthly_max: Mapped[Decimal | None] = mapped_column(Amount)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


# ─── Cross-border transfers ─────────────────────────────────────────────────

TRANSFER_STATUSES = (
    "sender_debited",   # sender wallet debited into outbound transit
    "instructed",       # settlement instruction accepted by the rail
    "settled",          # rail confirmed funds at the receiving side
    "credited",         # recipient wallet credited — final
    "failed",           # rail rejected / timed out definitively
    "reversed",         # sender refunded
)


class Transfer(Base, TimestampMixin):
    __tablename__ = "transfers"
    __table_args__ = (
        CheckConstraint(
            "status IN ('sender_debited','instructed','settled','credited','failed','reversed')",
            name="ck_transfers_status",
        ),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    recipient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    sender_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id"))
    recipient_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id"))
    corridor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_corridors.id"))
    quote_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("fx_quotes.id"))
    from_currency: Mapped[str] = mapped_column(String(3), _ccy())
    to_currency: Mapped[str] = mapped_column(String(3), _ccy())
    source_amount: Mapped[Decimal] = mapped_column(Amount)
    fee: Mapped[Decimal] = mapped_column(Amount)
    rate: Mapped[Decimal] = mapped_column(Rate)
    destination_amount: Mapped[Decimal] = mapped_column(Amount)
    status: Mapped[str] = mapped_column(String(20), default="sender_debited", index=True)
    rail: Mapped[str] = mapped_column(String(40))
    rail_reference: Mapped[str | None] = mapped_column(String(200))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    debit_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    settlement_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id")
    )
    reversal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id")
    )
    purpose_category: Mapped[str | None] = mapped_column(String(40))
    purpose_subcategory: Mapped[str | None] = mapped_column(Text)
    settled_at: Mapped[OptionalTimestamp]
    credited_at: Mapped[OptionalTimestamp]


# ─── Webhooks & outbox ──────────────────────────────────────────────────────


class ProviderWebhook(Base):
    __tablename__ = "provider_webhooks"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_provider_webhooks_event"),
        CheckConstraint(
            "status IN ('received','processed','ignored','failed','rejected')", name="ck_provider_webhooks_status"
        ),
    )

    id: Mapped[UUIDPk]
    provider: Mapped[str] = mapped_column(String(40))
    event_id: Mapped[str] = mapped_column(String(200))
    event_type: Mapped[str] = mapped_column(String(80))
    signature_valid: Mapped[bool] = mapped_column(Boolean)
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="received")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[CreatedAt]
    processed_at: Mapped[OptionalTimestamp]


class OutboxEvent(Base):
    """Written in the same transaction as the business change; a worker
    delivers it. Guarantees "the transfer committed ⇒ the event is sent"."""

    __tablename__ = "outbox_events"
    __table_args__ = (
        CheckConstraint("status IN ('pending','done','failed')", name="ck_outbox_events_status"),
        Index("ix_outbox_events_pending", "status", "available_at"),
    )

    id: Mapped[UUIDPk]
    topic: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(10), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[CreatedAt]
    processed_at: Mapped[OptionalTimestamp]


# ─── Governance ─────────────────────────────────────────────────────────────


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_created", "created_at"),)

    id: Mapped[UUIDPk]
    actor_type: Mapped[str] = mapped_column(String(20))  # admin / master_key / system / user
    actor_id: Mapped[str | None] = mapped_column(String(64))
    actor_email: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[CreatedAt]


class ApprovalRequest(Base, TimestampMixin):
    """Maker-checker: one admin proposes a high-risk action, a different
    admin with the right permission approves it, and only then does it run."""

    __tablename__ = "approval_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected','executed','failed','cancelled')",
            name="ck_approval_requests_status",
        ),
    )

    id: Mapped[UUIDPk]
    action: Mapped[str] = mapped_column(String(60), index=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"))
    decision_note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[OptionalTimestamp]
    result: Mapped[dict | None] = mapped_column(JSONB)


# ─── Reconciliation ─────────────────────────────────────────────────────────


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"
    __table_args__ = (
        CheckConstraint("status IN ('running','completed','failed')", name="ck_reconciliation_runs_status"),
    )

    id: Mapped[UUIDPk]
    kind: Mapped[str] = mapped_column(String(40))  # ledger_integrity / provider_statement
    provider: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12), default="running")
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    started_by: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[CreatedAt]
    finished_at: Mapped[OptionalTimestamp]


class ReconciliationItem(Base):
    __tablename__ = "reconciliation_items"
    __table_args__ = (
        CheckConstraint(
            "result IN ('matched','unmatched_ledger','unmatched_provider','amount_mismatch','duplicate',"
            "'stale_pending','integrity_error','timing_difference')",
            name="ck_reconciliation_items_result",
        ),
        CheckConstraint("resolution IN ('open','resolved','ignored')", name="ck_reconciliation_items_resolution"),
    )

    id: Mapped[UUIDPk]
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reconciliation_runs.id", ondelete="CASCADE"), index=True
    )
    result: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str | None] = mapped_column(String(200))
    ledger_amount: Mapped[Decimal | None] = mapped_column(Amount)
    provider_amount: Mapped[Decimal | None] = mapped_column(Amount)
    currency: Mapped[str | None] = mapped_column(String(3))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    resolution: Mapped[str] = mapped_column(String(10), default="open")
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[CreatedAt]


# ─── Compliance ─────────────────────────────────────────────────────────────


class RiskEvent(Base):
    __tablename__ = "risk_events"

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    rule: Mapped[str] = mapped_column(String(60))
    severity: Mapped[str] = mapped_column(String(10))  # low/medium/high
    score: Mapped[int] = mapped_column(Integer, default=0)
    reference: Mapped[str | None] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    case_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("compliance_cases.id"))
    created_at: Mapped[CreatedAt]


class ComplianceCase(Base, TimestampMixin):
    __tablename__ = "compliance_cases"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','investigating','escalated','closed_no_action','closed_action_taken')",
            name="ck_compliance_cases_status",
        ),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("merchants.id"))
    title: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="open")
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"))
    notes: Mapped[list] = mapped_column(JSONB, default=list)
    evidence: Mapped[list] = mapped_column(JSONB, default=list)
    closed_at: Mapped[OptionalTimestamp]


class ScreeningResult(Base):
    """Sanctions/PEP screening outcome. With no screening provider wired the
    result is recorded as 'not_screened' — never as a pass."""

    __tablename__ = "screening_results"

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("merchants.id"))
    screening_type: Mapped[str] = mapped_column(String(20))  # sanctions / pep
    provider: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))  # not_screened / clear / potential_match / match
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[CreatedAt]


# ─── Merchant integration ───────────────────────────────────────────────────


class MerchantQrCode(Base):
    """A merchant QR. Static codes identify the merchant only; dynamic codes
    also fix amount/currency/reference and expire. The payload the customer
    scans is HMAC-signed (app.payments.qr) so it can't be altered."""

    __tablename__ = "merchant_qr_codes"
    __table_args__ = (
        CheckConstraint("kind IN ('static','dynamic')", name="ck_merchant_qr_codes_kind"),
        CheckConstraint("status IN ('active','paid','expired','cancelled')", name="ck_merchant_qr_codes_status"),
    )

    id: Mapped[UUIDPk]
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    label: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Decimal | None] = mapped_column(Amount)
    currency: Mapped[str] = mapped_column(String(3), _ccy())
    reference: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(10), default="active")
    expires_at: Mapped[OptionalTimestamp]
    paid_at: Mapped[OptionalTimestamp]
    created_at: Mapped[CreatedAt]


class MerchantApiKey(Base):
    __tablename__ = "merchant_api_keys"

    id: Mapped[UUIDPk]
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    prefix: Mapped[str] = mapped_column(String(16), unique=True)
    key_hash: Mapped[str] = mapped_column(String(128))
    label: Mapped[str | None] = mapped_column(Text)
    revoked_at: Mapped[OptionalTimestamp]
    last_used_at: Mapped[OptionalTimestamp]
    created_at: Mapped[CreatedAt]


class MerchantWebhookEndpoint(Base):
    __tablename__ = "merchant_webhook_endpoints"

    id: Mapped[UUIDPk]
    merchant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(Text)
    secret: Mapped[str] = mapped_column(String(80))
    events: Mapped[list] = mapped_column(JSONB, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[CreatedAt]


class ContributionPayout(Base):
    __tablename__ = "contribution_payouts"

    id: Mapped[UUIDPk]
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contribution_groups.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Amount)
    currency: Mapped[str] = mapped_column(String(3), _ccy())
    destination_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("wallet_cards.id"))
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
    created_at: Mapped[CreatedAt]


class Enquiry(Base):
    """Contact / partnership / business enquiries from the public website."""

    __tablename__ = "enquiries"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('contact','business','bank_partner','psp_partner','custodian','press','other')",
            name="ck_enquiries_kind",
        ),
        CheckConstraint("status IN ('new','in_progress','closed')", name="ck_enquiries_status"),
    )

    id: Mapped[UUIDPk]
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text)
    organisation: Mapped[str | None] = mapped_column(Text)
    country_code: Mapped[str | None] = mapped_column(String(2))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="new")
    created_at: Mapped[CreatedAt]
