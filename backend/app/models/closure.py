"""Closed accounts: the sealed record kept for the legal retention period.

When an account is deleted (by the customer or by an admin) the live user
row is anonymised immediately. The identity details that financial-crime
law requires us to keep (name, contact details, identity document) are
moved into this record, readable only by compliance, and purged
automatically when `retain_until` passes.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OptionalTimestamp, UUIDPk


class ClosedAccount(Base):
    __tablename__ = "closed_accounts"

    id: Mapped[UUIDPk]
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
                                               unique=True)
    wallet_id: Mapped[str] = mapped_column(String(40))
    closed_by: Mapped[str] = mapped_column(String(20))  # customer | admin
    reason: Mapped[str | None] = mapped_column(Text)
    snapshot: Mapped[dict | None] = mapped_column(JSONB)  # null once purged
    closed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    retain_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    purged_at: Mapped[OptionalTimestamp]
