from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TagRideStatus, TagRideVehicleType
from app.models.mixins import CreatedOnlyMixin, Money, UUIDFk, UUIDPk


class TagRideDriver(Base, CreatedOnlyMixin):
    __tablename__ = "tag_ride_drivers"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    vehicle_number: Mapped[str] = mapped_column(Text)
    vehicle_type: Mapped[TagRideVehicleType] = mapped_column(
        Enum(TagRideVehicleType, name="tag_ride_vehicle_type", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=TagRideVehicleType.TAXI,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    total_earnings: Mapped[Money] = mapped_column(default=0)


class TagRideRide(Base, CreatedOnlyMixin):
    __tablename__ = "tag_ride_rides"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_tag_ride_rides_amount_positive"),)

    id: Mapped[UUIDPk]
    passenger_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    driver_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tag_ride_drivers.id", ondelete="CASCADE"), index=True
    )
    passenger_card_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="SET NULL"), index=True
    )
    driver_card_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("wallet_cards.id", ondelete="SET NULL"), index=True
    )
    amount: Mapped[Money]
    status: Mapped[TagRideStatus] = mapped_column(
        Enum(TagRideStatus, name="tag_ride_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=TagRideStatus.COMPLETED,
    )
    reference: Mapped[str] = mapped_column(Text, unique=True, index=True)
