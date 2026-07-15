from sqlalchemy import Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import Money, TimestampMixin, UUIDFk, UUIDPk


class VirtualCard(Base, TimestampMixin):
    __tablename__ = "virtual_cards"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    card_number: Mapped[str] = mapped_column(Text, unique=True, index=True)
    expiry_date: Mapped[str] = mapped_column(Text)
    spending_limit: Mapped[Money | None]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
