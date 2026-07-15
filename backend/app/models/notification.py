from sqlalchemy import Boolean, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import NotificationType
from app.models.mixins import CreatedOnlyMixin, UUIDFk, UUIDPk


class Notification(Base, CreatedOnlyMixin):
    __tablename__ = "notifications"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=NotificationType.INFO,
    )
    title: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    related_id: Mapped[str | None] = mapped_column(Text)
    related_type: Mapped[str | None] = mapped_column(Text)
