from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ClaimMethod, ClaimPaymentStatus, PickupStatus
from app.models.mixins import (
    CurrencyCode,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    Timestamp,
    UUIDFk,
    UUIDPk,
)


class ClaimPayment(Base, TimestampMixin):
    __tablename__ = "claim_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_claim_payments_amount_positive"),)

    id: Mapped[UUIDPk]
    sender_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipient_name: Mapped[str] = mapped_column(Text)
    recipient_contact: Mapped[str] = mapped_column(Text)
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    note: Mapped[str | None] = mapped_column(Text)
    pin_hash: Mapped[str] = mapped_column(Text)
    require_pin: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[ClaimPaymentStatus] = mapped_column(
        Enum(ClaimPaymentStatus, name="claim_payment_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=ClaimPaymentStatus.PENDING,
    )
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    claim_method: Mapped[ClaimMethod | None] = mapped_column(
        Enum(ClaimMethod, name="claim_method", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    bank_details: Mapped[dict | None] = mapped_column(JSONB)
    pickup_code: Mapped[str | None] = mapped_column(Text)
    pickup_status: Mapped[PickupStatus] = mapped_column(
        Enum(PickupStatus, name="pickup_status", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=PickupStatus.PENDING
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[Timestamp]
