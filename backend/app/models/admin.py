from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
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
    last_login_at: Mapped[OptionalTimestamp]


class AdminSession(Base, CreatedOnlyMixin):
    __tablename__ = "admin_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[Timestamp]
