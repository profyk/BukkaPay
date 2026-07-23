"""Tables carried over from the Node schema that have zero reachable route
in the entire app (verified via grep across routes.ts/admin-routes.ts) —
same situation as the retired `stokvels*` tables, but these were never even
given a read-only admin view. Kept as models for data fidelity (in case rows
exist in prod) but intentionally have no service/router built for them.

(chat_messages used to live here too — it's been activated as a real support
chat and moved to app.models.chat.)
"""

from sqlalchemy import Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedOnlyMixin, Money, UUIDFk, UUIDPk


class SecuritySetting(Base, CreatedOnlyMixin):
    __tablename__ = "security_settings"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    cards_frozen: Mapped[dict | None] = mapped_column(JSONB)
    whitelisted_merchants: Mapped[dict | None] = mapped_column(JSONB)
    fraud_alerts: Mapped[bool] = mapped_column(Boolean, default=True)


class FamilyMember(Base, CreatedOnlyMixin):
    __tablename__ = "family_members"

    id: Mapped[UUIDPk]
    parent_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    child_id: Mapped[UUIDFk | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, default="child")
    monthly_allowance: Mapped[Money | None]
