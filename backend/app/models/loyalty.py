from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AutoPayFrequency
from app.models.mixins import (
    CreatedOnlyMixin,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class LoyaltyReward(Base, CreatedOnlyMixin):
    __tablename__ = "loyalty_rewards"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    points_earned: Mapped[int] = mapped_column(Integer)
    points_redeemed: Mapped[int] = mapped_column(Integer, default=0)
    tier: Mapped[str] = mapped_column(Text, default="bronze")
    total_points: Mapped[int] = mapped_column(Integer, default=0)


class AutoPay(Base, TimestampMixin):
    __tablename__ = "auto_pays"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_auto_pays_amount_positive"),)

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    bill_name: Mapped[str] = mapped_column(Text)
    amount: Mapped[Money]
    frequency: Mapped[AutoPayFrequency] = mapped_column(
        Enum(AutoPayFrequency, name="autopay_frequency", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    next_payment_date: Mapped[OptionalTimestamp]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Beneficiary(Base, CreatedOnlyMixin):
    __tablename__ = "beneficiaries"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    wallet_id: Mapped[str] = mapped_column(Text)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
