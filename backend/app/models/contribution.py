from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ContributionCategory
from app.models.mixins import (
    CreatedOnlyMixin,
    CurrencyCode,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class ContributionGroup(Base, TimestampMixin):
    __tablename__ = "contribution_groups"
    __table_args__ = (
        CheckConstraint("current_amount >= 0", name="ck_contribution_groups_current_nonneg"),
    )

    id: Mapped[UUIDPk]
    creator_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[ContributionCategory] = mapped_column(
        Enum(ContributionCategory, name="contribution_category", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    target_amount: Mapped[Money | None]
    current_amount: Mapped[Money] = mapped_column(default=0)
    currency: Mapped[CurrencyCode] = mapped_column(default="USD")
    share_code: Mapped[str] = mapped_column(Text, unique=True, index=True)
    # Total ever paid out to the creator (current_amount is what's still held).
    paid_out_amount: Mapped[Money] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    end_date: Mapped[OptionalTimestamp]


class Contribution(Base, CreatedOnlyMixin):
    __tablename__ = "contributions"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_contributions_amount_positive"),)

    id: Mapped[UUIDPk]
    group_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contribution_groups.id", ondelete="CASCADE"), index=True
    )
    contributor_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    contributor_name: Mapped[str] = mapped_column(Text)
    contributor_phone: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[Money]
    message: Mapped[str | None] = mapped_column(Text)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    # paid = money moved through the ledger; pledge_legacy = recorded before
    # contributions moved real money (0017) and never backed by funds.
    status: Mapped[str] = mapped_column(Text, default="paid")
    journal_entry_id: Mapped[UUIDFk | None] = mapped_column(UUID(as_uuid=True), ForeignKey("journal_entries.id"))
