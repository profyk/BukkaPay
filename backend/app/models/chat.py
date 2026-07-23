from sqlalchemy import Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedOnlyMixin, UUIDFk, UUIDPk


class ChatMessage(Base, CreatedOnlyMixin):
    """A single message in a user's support conversation with BukkaPay.
    is_user_message distinguishes direction (True = from the user, False =
    from support); read tracks whether the *other* party has seen it."""

    __tablename__ = "chat_messages"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    message: Mapped[str] = mapped_column(Text)
    is_user_message: Mapped[bool] = mapped_column(Boolean, default=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
