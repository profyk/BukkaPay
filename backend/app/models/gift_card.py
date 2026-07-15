from sqlalchemy import CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import GiftCardStatus
from app.models.mixins import (
    CreatedOnlyMixin,
    CurrencyCode,
    Money,
    OptionalTimestamp,
    UUIDFk,
    UUIDPk,
)


class GiftCard(Base, CreatedOnlyMixin):
    __tablename__ = "gift_cards"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_gift_cards_amount_positive"),)

    id: Mapped[UUIDPk]
    sender_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipient_email: Mapped[str | None] = mapped_column(Text)
    recipient_phone: Mapped[str | None] = mapped_column(Text)
    recipient_name: Mapped[str] = mapped_column(Text)
    amount: Mapped[Money]
    currency: Mapped[CurrencyCode] = mapped_column(default="USD")
    message: Mapped[str | None] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, unique=True, index=True)
    status: Mapped[GiftCardStatus] = mapped_column(
        Enum(GiftCardStatus, name="gift_card_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=GiftCardStatus.PENDING,
    )
    design: Mapped[str] = mapped_column(Text, default="default")
    redeemed_by: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    redeemed_at: Mapped[OptionalTimestamp]
    expires_at: Mapped[OptionalTimestamp]
