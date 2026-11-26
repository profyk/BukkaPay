"""The company behind BukkaPay: departments (each with a head and a shared
mailbox). Staff are admin_users, which carry their department, title,
manager and the countries they cover (app.governance.scope)."""

import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPk


class Department(Base, TimestampMixin):
    __tablename__ = "departments"

    id: Mapped[UUIDPk]
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(120))  # shared mailbox, e.g. finance@bukkapay.com
    # use_alter: departments ↔ admin_users reference each other.
    head_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey(
        "admin_users.id", ondelete="SET NULL", use_alter=True, name="fk_departments_head_admin"))
