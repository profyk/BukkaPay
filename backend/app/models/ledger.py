"""Double-entry ledger — the authoritative record of every money movement.

Semantics
---------
* ``LedgerAccount`` is one account in one currency. Customer wallets are
  ``liability`` accounts (BukkaPay, through its custodian, owes the customer);
  PSP/custodian clearing accounts are ``asset`` accounts; fees land in
  ``revenue``. ``balance`` is a cached figure in the account's *natural*
  direction (credit-normal for liability/revenue/equity, debit-normal for
  asset/expense) and is written only by ``app.ledger.posting``.
* ``JournalEntry`` + ``JournalLine`` are append-only. Database triggers
  (``app.ledger.ddl``) reject UPDATE/DELETE and reject any entry whose lines
  do not balance per currency. Corrections are new entries that reverse the
  original (``reverses_entry_id``).
* ``wallet_cards.balance`` is a projection of the linked account's balance,
  kept in step inside the same database transaction as the posting.
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
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import CreatedAt, CurrencyCode, OptionalTimestamp, UUIDPk

LedgerAmount = Numeric(20, 2)

ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "expense")
DEBIT_NORMAL_TYPES = ("asset", "expense")


class LedgerAccount(Base):
    __tablename__ = "ledger_accounts"
    __table_args__ = (
        CheckConstraint(
            "type IN ('asset','liability','equity','revenue','expense')",
            name="ck_ledger_accounts_type",
        ),
        CheckConstraint("allow_negative OR balance >= 0", name="ck_ledger_accounts_nonneg"),
    )

    id: Mapped[UUIDPk]
    code: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(20))
    currency: Mapped[CurrencyCode]
    wallet_card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="RESTRICT"), unique=True
    )
    # Merchant payable accounts project onto merchants.wallet_balance. A
    # merchant has one projected account today (its settlement currency).
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="RESTRICT"), unique=True
    )
    # Contribution campaign escrow projects onto contribution_groups.current_amount.
    contribution_group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contribution_groups.id", ondelete="RESTRICT"), unique=True
    )
    allow_negative: Mapped[bool] = mapped_column(Boolean, default=False)
    balance: Mapped[Decimal] = mapped_column(LedgerAmount, default=Decimal("0.00"))
    # Bumped on every posting; lets readers detect a concurrent change.
    version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[CreatedAt]


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(40), unique=True)
    kind: Mapped[str] = mapped_column(String(60), index=True)
    description: Mapped[str] = mapped_column(Text)
    reverses_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"), unique=True
    )
    # Free-form business context (transfer ids, provider refs, fee, rate…).
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lines: Mapped[list["JournalLine"]] = relationship(
        back_populates="entry", lazy="selectin", order_by="JournalLine.line_no"
    )


class JournalLine(Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        CheckConstraint(
            "(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)",
            name="ck_journal_lines_one_side",
        ),
        UniqueConstraint("entry_id", "line_no", name="uq_journal_lines_entry_line"),
        Index("ix_journal_lines_account_created", "account_id", "created_at"),
    )

    id: Mapped[UUIDPk]
    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT"), index=True
    )
    line_no: Mapped[int] = mapped_column(Integer)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ledger_accounts.id", ondelete="RESTRICT")
    )
    currency: Mapped[CurrencyCode]
    debit: Mapped[Decimal] = mapped_column(LedgerAmount, default=Decimal("0.00"))
    credit: Mapped[Decimal] = mapped_column(LedgerAmount, default=Decimal("0.00"))
    created_at: Mapped[CreatedAt]

    entry: Mapped[JournalEntry] = relationship(back_populates="lines")


class IdempotencyRecord(Base):
    """One row per (scope, key). Inserted in the same database transaction as
    the operation it guards, so a concurrent duplicate blocks on the unique
    index and then sees the committed response."""

    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idempotency_scope_key"),)

    id: Mapped[UUIDPk]
    scope: Mapped[str] = mapped_column(String(120))
    key: Mapped[str] = mapped_column(String(200))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict | None] = mapped_column(JSONB)
    status_code: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[CreatedAt]


class FundingRequest(Base):
    """Money coming in through a provider: a wallet top-up or a payment-link
    payment. Created server-side when the payment is initiated, so the
    eventual credit uses the amount and destination recorded here, never
    values supplied on the return redirect."""

    __tablename__ = "funding_requests"
    __table_args__ = (
        UniqueConstraint("provider", "provider_reference", name="uq_funding_provider_ref"),
        CheckConstraint("amount > 0", name="ck_funding_requests_amount_positive"),
        CheckConstraint(
            "status IN ('pending','completed','failed','review')",
            name="ck_funding_requests_status",
        ),
        CheckConstraint(
            "(purpose = 'wallet_topup' AND wallet_card_id IS NOT NULL AND user_id IS NOT NULL)"
            " OR (purpose = 'payment_link' AND payment_link_id IS NOT NULL)"
            " OR (purpose = 'contribution' AND contribution_group_id IS NOT NULL)",
            name="ck_funding_requests_target",
        ),
    )

    id: Mapped[UUIDPk]
    purpose: Mapped[str] = mapped_column(String(30), default="wallet_topup")
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    wallet_card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="RESTRICT")
    )
    payment_link_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="RESTRICT"), index=True
    )
    contribution_group_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contribution_groups.id", ondelete="RESTRICT")
    )
    payer_name: Mapped[str | None] = mapped_column(Text)
    payer_email: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(40))
    provider_reference: Mapped[str] = mapped_column(String(200))
    reference: Mapped[str] = mapped_column(String(60), unique=True)
    amount: Mapped[Decimal] = mapped_column(LedgerAmount)
    currency: Mapped[CurrencyCode]
    status: Mapped[str] = mapped_column(String(20), default="pending")
    review_reason: Mapped[str | None] = mapped_column(Text)
    provider_amount: Mapped[Decimal | None] = mapped_column(LedgerAmount)
    journal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT")
    )
    completed_at: Mapped[OptionalTimestamp]
    created_at: Mapped[CreatedAt]


class WithdrawalRequest(Base):
    """A payout to a bank account. The wallet is debited into a pending-payout
    liability when submitted; a provider failure reverses that entry."""

    __tablename__ = "withdrawal_requests"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_withdrawal_requests_amount_positive"),
        CheckConstraint(
            "status IN ('submitted','completed','failed')",
            name="ck_withdrawal_requests_status",
        ),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    wallet_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="RESTRICT")
    )
    provider: Mapped[str] = mapped_column(String(40))
    provider_reference: Mapped[str | None] = mapped_column(String(200))
    reference: Mapped[str] = mapped_column(String(60), unique=True)
    amount: Mapped[Decimal] = mapped_column(LedgerAmount)
    currency: Mapped[CurrencyCode]
    bank_id: Mapped[str] = mapped_column(String(60))
    account_number_last4: Mapped[str] = mapped_column(String(4))
    account_name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="submitted")
    failure_reason: Mapped[str | None] = mapped_column(Text)
    debit_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT")
    )
    reversal_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT")
    )
    created_at: Mapped[CreatedAt]
