import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import AdminRole
from app.models.mixins import CreatedOnlyMixin, OptionalTimestamp, Timestamp, UUIDFk, UUIDPk


class AdminUser(Base, CreatedOnlyMixin):
    __tablename__ = "admin_users"

    id: Mapped[UUIDPk]
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(Text)
    password: Mapped[str] = mapped_column(Text)
    role: Mapped[AdminRole] = mapped_column(
        Enum(AdminRole, name="admin_role", native_enum=True, values_callable=lambda x: [e.value for e in x]), default=AdminRole.ADMIN
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_login_at: Mapped[OptionalTimestamp]
    # Organisation (app.models.org / app.governance.scope)
    department_id: Mapped[UUIDFk | None] = mapped_column(UUID(as_uuid=True), ForeignKey("departments.id",
                                                                                      ondelete="SET NULL"))
    title: Mapped[str | None] = mapped_column(String(100))
    manager_id: Mapped[UUIDFk | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                   ondelete="SET NULL"))
    phone: Mapped[str | None] = mapped_column(String(30))
    started_on: Mapped[date | None] = mapped_column(Date)
    # Countries this person may work on (ISO codes). Empty = all countries.
    country_scope: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))


class AdminSession(Base, CreatedOnlyMixin):
    __tablename__ = "admin_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[Timestamp]


class AdminInvite(Base, CreatedOnlyMixin):
    """An emailed invitation to join the admin panel. Only a SHA-256 of the
    link token is stored; the link itself is shown once and emailed."""

    __tablename__ = "admin_invites"

    id: Mapped[UUIDPk]
    email: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[AdminRole] = mapped_column(
        Enum(AdminRole, name="admin_role", native_enum=True, create_type=False,
             values_callable=lambda x: [e.value for e in x])
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[Timestamp]
    accepted_at: Mapped[OptionalTimestamp]
    revoked_at: Mapped[OptionalTimestamp]
    # Authenticator secret the invitee enrols before the account exists.
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
