from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import KycDocumentType, KycStatus
from app.models.mixins import CreatedOnlyMixin, OptionalTimestamp, Timestamp, UUIDFk, UUIDPk


class User(Base, CreatedOnlyMixin):
    __tablename__ = "users"

    id: Mapped[UUIDPk]
    wallet_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(Text)
    country_code: Mapped[str | None] = mapped_column(Text, default="+1")
    password: Mapped[str | None] = mapped_column(Text)
    avatar: Mapped[str | None] = mapped_column(Text)
    biometric_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[str] = mapped_column(String(20), default="user")
    loyalty_points: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[OptionalTimestamp]

    kyc_status: Mapped[KycStatus] = mapped_column(
        Enum(KycStatus, name="kyc_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=KycStatus.NOT_SUBMITTED,
    )
    kyc_full_name: Mapped[str | None] = mapped_column(Text)
    kyc_document_type: Mapped[KycDocumentType | None] = mapped_column(
        Enum(KycDocumentType, name="kyc_document_type", native_enum=True, values_callable=lambda x: [e.value for e in x])
    )
    kyc_document_number: Mapped[str | None] = mapped_column(Text)
    kyc_submitted_at: Mapped[OptionalTimestamp]
    kyc_reviewed_at: Mapped[OptionalTimestamp]
    kyc_rejection_reason: Mapped[str | None] = mapped_column(Text)

    # 0 = registered, 1 = contact verified, 2 = identity verified (KYC approved).
    # Limits per level are configured in transaction_limits.
    kyc_level: Mapped[int] = mapped_column(Integer, default=0)
    # ISO-3166 alpha-2 home country (users.country_code is the phone prefix).
    residence_country: Mapped[str | None] = mapped_column(
        String(2), ForeignKey("countries.code", ondelete="RESTRICT")
    )
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    terms_accepted_at: Mapped[OptionalTimestamp]
    transaction_pin: Mapped[str | None] = mapped_column(Text)
    pin_failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pin_locked_until: Mapped[OptionalTimestamp]
    # Stable Sign in with Apple subject; customers who hide their email get a
    # relay address, so the subject is what identifies them on return.
    apple_sub: Mapped[str | None] = mapped_column(String(255), unique=True)


class UserSession(Base, CreatedOnlyMixin):
    __tablename__ = "user_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[Timestamp]
