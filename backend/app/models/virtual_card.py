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
    # Present (NOT NULL) in the real deployed schema (bukkapay_supabase.sql)
    # but absent from the newer shared/schema.ts, whose insertVirtualCardSchema
    # never supplies it — the live insert path can't satisfy a NOT NULL
    # constraint here, so this is nullable rather than perpetuating a column
    # the app can never actually populate on create.
    cvv: Mapped[str | None] = mapped_column(Text)
    expiry_date: Mapped[str] = mapped_column(Text)
    spending_limit: Mapped[Money | None]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
