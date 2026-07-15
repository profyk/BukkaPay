from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import LinkStatus, PropertyType, RentPaymentMethod, RentPaymentStatus
from app.models.mixins import (
    CreatedAt,
    CreatedOnlyMixin,
    Money,
    OptionalTimestamp,
    TimestampMixin,
    UUIDFk,
    UUIDPk,
)


class Property(Base, TimestampMixin):
    __tablename__ = "properties"

    id: Mapped[UUIDPk]
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    landlord_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    property_type: Mapped[PropertyType] = mapped_column(
        Enum(PropertyType, name="property_type", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=PropertyType.APARTMENT
    )
    total_units: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PropertyUnit(Base, TimestampMixin):
    __tablename__ = "property_units"
    __table_args__ = (
        CheckConstraint("monthly_rent > 0", name="ck_property_units_monthly_rent_positive"),
    )

    id: Mapped[UUIDPk]
    property_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    unit_number: Mapped[str] = mapped_column(Text)
    monthly_rent: Mapped[Money]
    is_occupied: Mapped[bool] = mapped_column(Boolean, default=False)


class Tenant(Base, TimestampMixin):
    __tablename__ = "tenants"

    id: Mapped[UUIDPk]
    tenant_id: Mapped[str] = mapped_column(Text, unique=True, index=True)
    property_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    unit_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_units.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    move_in_date: Mapped[CreatedAt]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RentPayment(Base, CreatedOnlyMixin):
    __tablename__ = "rent_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_rent_payments_amount_positive"),)

    id: Mapped[UUIDPk]
    tenant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    property_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    unit_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_units.id", ondelete="CASCADE"), index=True
    )
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Money]
    rent_month: Mapped[str] = mapped_column(Text)
    payment_method: Mapped[RentPaymentMethod] = mapped_column(
        Enum(RentPaymentMethod, name="rent_payment_method", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=RentPaymentMethod.WALLET,
    )
    status: Mapped[RentPaymentStatus] = mapped_column(
        Enum(RentPaymentStatus, name="rent_payment_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=RentPaymentStatus.COMPLETED,
    )
    reference: Mapped[str | None] = mapped_column(Text)


class RentPaymentLink(Base, TimestampMixin):
    __tablename__ = "rent_payment_links"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_rent_payment_links_amount_positive"),
    )

    id: Mapped[UUIDPk]
    link_code: Mapped[str] = mapped_column(Text, unique=True, index=True)
    tenant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    merchant_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("merchants.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Money]
    rent_month: Mapped[str] = mapped_column(Text)
    status: Mapped[LinkStatus] = mapped_column(
        Enum(LinkStatus, name="link_status", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=LinkStatus.PENDING
    )
    expires_at: Mapped[OptionalTimestamp]
