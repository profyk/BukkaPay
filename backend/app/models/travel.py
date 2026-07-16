from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TravelMode
from app.models.mixins import CurrencyCode, Money, Timestamp, TimestampMixin, UUIDFk, UUIDPk

_travel_mode_enum = Enum(TravelMode, name="travel_mode", native_enum=True, values_callable=lambda x: [e.value for e in x])


class TravelOperator(Base, TimestampMixin):
    __tablename__ = "travel_operators"

    id: Mapped[UUIDPk]
    name: Mapped[str] = mapped_column(Text)
    mode: Mapped[TravelMode] = mapped_column(_travel_mode_enum)
    logo_url: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TravelRoute(Base, TimestampMixin):
    __tablename__ = "travel_routes"

    id: Mapped[UUIDPk]
    operator_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("travel_operators.id", ondelete="CASCADE"), index=True
    )
    mode: Mapped[TravelMode] = mapped_column(_travel_mode_enum)
    origin_code: Mapped[str] = mapped_column(Text)  # city name (bus) or IATA code (flight)
    origin_city: Mapped[str] = mapped_column(Text)
    origin_country_code: Mapped[str] = mapped_column(Text)
    destination_code: Mapped[str] = mapped_column(Text)
    destination_city: Mapped[str] = mapped_column(Text)
    destination_country_code: Mapped[str] = mapped_column(Text)
    flight_number: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TravelDeparture(Base, TimestampMixin):
    __tablename__ = "travel_departures"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_travel_departures_price_positive"),
        CheckConstraint("seats_booked <= total_seats", name="ck_travel_departures_seats_within_capacity"),
    )

    id: Mapped[UUIDPk]
    route_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("travel_routes.id", ondelete="CASCADE"), index=True
    )
    departure_at: Mapped[Timestamp]
    arrival_at: Mapped[Timestamp]
    price: Mapped[Money]
    business_price: Mapped[Money | None]
    currency: Mapped[CurrencyCode] = mapped_column(default="ZAR")
    total_seats: Mapped[int] = mapped_column(Integer, default=40)
    seats_booked: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
