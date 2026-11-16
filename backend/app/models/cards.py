"""Payment cards issued on the Visa network by a licensed issuer-processor.

BukkaPay never stores a card's PAN or CVV (that would put the whole platform
in PCI-DSS scope). The issuer holds them; we keep only its card id, the last
four digits and the expiry. Customers see the full details through the
issuer's PIN-gated reveal session, and tap-to-pay works through wallet tokens
(Apple Pay / Google Pay) that the issuer provisions with the Visa Token
Service.

Money for a card payment is moved by the ledger: an authorization places a
hold (wallet → card holds), clearing captures it (holds → owed to issuer),
and a reversal or expiry releases it back to the wallet.
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
from app.models.mixins import CreatedAt, OptionalTimestamp, TimestampMixin, UUIDPk

Amount = Numeric(20, 2)

CARD_STATUSES = ("pending_kyc", "requested", "active", "frozen", "cancelled", "failed")
AUTH_STATUSES = ("approved", "declined", "reversed", "captured", "expired")
CHANNELS = ("online", "contactless", "chip", "magstripe", "atm", "wallet_token", "recurring")


def default_controls() -> dict:
    return {
        "online": True,
        "contactless": True,
        "chip": True,
        "atm": False,
        "international": True,
        "per_transaction_limit": None,
        "daily_limit": None,
        "blocked_mccs": [],
    }


class IssuedCard(Base, TimestampMixin):
    __tablename__ = "issued_cards"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_kyc','requested','active','frozen','cancelled','failed')",
            name="ck_issued_cards_status",
        ),
        CheckConstraint("network IN ('visa')", name="ck_issued_cards_network"),
        CheckConstraint("form IN ('virtual','physical')", name="ck_issued_cards_form"),
        UniqueConstraint("issuer", "issuer_card_id", name="uq_issued_cards_issuer_card"),
        # At most one live card per wallet; cancelled/failed cards stay as history.
        Index(
            "uq_issued_cards_one_live_per_wallet", "wallet_card_id", unique=True,
            postgresql_where=text("status NOT IN ('cancelled','failed')"),
        ),
    )

    id: Mapped[UUIDPk]
    wallet_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="RESTRICT"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    issuer: Mapped[str] = mapped_column(String(40))
    issuer_card_id: Mapped[str | None] = mapped_column(String(120))
    network: Mapped[str] = mapped_column(String(10), default="visa")
    form: Mapped[str] = mapped_column(String(10), default="virtual")
    status: Mapped[str] = mapped_column(String(12))
    billing_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code", ondelete="RESTRICT"))
    last4: Mapped[str | None] = mapped_column(String(4))
    exp_month: Mapped[int | None] = mapped_column(Integer)
    exp_year: Mapped[int | None] = mapped_column(Integer)
    cardholder_name: Mapped[str] = mapped_column(Text)
    controls: Mapped[dict] = mapped_column(JSONB, default=default_controls)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    # Why the card is frozen: "customer", "overdraft" (cleared above the
    # balance; unfreezes once repaid) or "admin".
    frozen_reason: Mapped[str | None] = mapped_column(String(12))
    overdraft_outstanding: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    cancelled_at: Mapped[OptionalTimestamp]


class CardAuthorization(Base, TimestampMixin):
    """One real-time authorization decision. `amount` is in the card's billing
    currency (the network has already converted the merchant amount)."""

    __tablename__ = "card_authorizations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('approved','declined','reversed','captured','expired')", name="ck_card_auth_status"
        ),
        UniqueConstraint("issuer", "issuer_authorization_id", name="uq_card_auth_issuer_id"),
        Index("ix_card_auth_open_holds", "status", "created_at"),
    )

    id: Mapped[UUIDPk]
    issued_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issued_cards.id", ondelete="RESTRICT"), index=True
    )
    issuer: Mapped[str] = mapped_column(String(40))
    issuer_authorization_id: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(10))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Amount)
    fee: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    # What is still held on the wallet for this authorization (amount + fee
    # minus partial reversals and captures).
    held_amount: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    captured_amount: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    merchant_amount: Mapped[Decimal | None] = mapped_column(Amount)
    merchant_currency: Mapped[str | None] = mapped_column(String(3))
    merchant_name: Mapped[str | None] = mapped_column(Text)
    merchant_mcc: Mapped[str | None] = mapped_column(String(4))
    merchant_country: Mapped[str | None] = mapped_column(String(2))
    channel: Mapped[str] = mapped_column(String(14))
    wallet_token_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("card_wallet_tokens.id", ondelete="SET NULL")
    )
    decline_reason: Mapped[str | None] = mapped_column(String(40))
    fee_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    hold_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT")
    )
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CardClearing(Base):
    """A cleared (settled) card event from the issuer: a capture of an
    authorization, a force-post without one, or a merchant refund."""

    __tablename__ = "card_clearings"
    __table_args__ = (
        CheckConstraint("kind IN ('capture','refund')", name="ck_card_clearings_kind"),
        UniqueConstraint("issuer", "issuer_transaction_id", name="uq_card_clearings_issuer_txn"),
    )

    id: Mapped[UUIDPk]
    issued_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issued_cards.id", ondelete="RESTRICT"), index=True
    )
    authorization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("card_authorizations.id", ondelete="RESTRICT"), index=True
    )
    issuer: Mapped[str] = mapped_column(String(40))
    issuer_transaction_id: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(8))
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Amount)
    fee: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    # Amount the wallet could not cover at clearing (clearing can't be
    # declined); owed by the customer and tracked as a receivable.
    shortfall: Mapped[Decimal] = mapped_column(Amount, default=Decimal("0.00"))
    merchant_name: Mapped[str | None] = mapped_column(Text)
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("journal_entries.id", ondelete="RESTRICT")
    )
    created_at: Mapped[CreatedAt]


class CardWalletToken(Base, TimestampMixin):
    """A device token (Apple Pay, Google Pay, Samsung Pay) for tap-to-pay.
    The token PAN lives in the device secure element and at Visa; we keep the
    issuer's token reference and its lifecycle."""

    __tablename__ = "card_wallet_tokens"
    __table_args__ = (
        CheckConstraint(
            "wallet IN ('apple_pay','google_pay','samsung_pay')", name="ck_card_wallet_tokens_wallet"
        ),
        CheckConstraint(
            "status IN ('requested','active','suspended','deleted')", name="ck_card_wallet_tokens_status"
        ),
        UniqueConstraint("issuer", "issuer_token_id", name="uq_card_wallet_tokens_issuer_token"),
    )

    id: Mapped[UUIDPk]
    issued_card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("issued_cards.id", ondelete="RESTRICT"), index=True
    )
    issuer: Mapped[str] = mapped_column(String(40))
    issuer_token_id: Mapped[str] = mapped_column(String(120))
    wallet: Mapped[str] = mapped_column(String(12))
    status: Mapped[str] = mapped_column(String(10))
    device_name: Mapped[str | None] = mapped_column(Text)
    token_last4: Mapped[str | None] = mapped_column(String(4))
    deleted_at: Mapped[OptionalTimestamp]
