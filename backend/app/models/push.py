"""Push notification devices and per-user notification preferences.

A device is either an Expo push token (the iOS/Android app) or a Web Push
subscription (the web app at app.bukkapay.com). A token belongs to exactly
one user at a time: signing in on a phone moves it to the new account, and
signing out removes it, so one person's alerts never reach the next.
"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, OptionalTimestamp, UpdatedAt, UUIDFk, UUIDPk


class PushDevice(Base):
    __tablename__ = "push_devices"
    __table_args__ = (
        CheckConstraint("kind IN ('expo','webpush')", name="ck_push_devices_kind"),
        CheckConstraint("platform IN ('ios','android','web')", name="ck_push_devices_platform"),
    )

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    # Expo push token, or the Web Push endpoint URL.
    token: Mapped[str] = mapped_column(Text, unique=True)
    # Web Push only: {"p256dh": ..., "auth": ...}
    keys: Mapped[dict | None] = mapped_column(JSONB)
    platform: Mapped[str] = mapped_column(String(10))
    device_name: Mapped[str | None] = mapped_column(String(120))
    failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[CreatedAt]
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_sent_at: Mapped[OptionalTimestamp]
    disabled_at: Mapped[OptionalTimestamp]


class NotificationPreference(Base):
    """Which kinds of alerts a user wants pushed. Every notification is
    still kept in the in-app inbox; these switches only control pushes.
    Security alerts are always pushed and have no switch."""

    __tablename__ = "notification_preferences"

    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    money: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    cards: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    trade: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    support: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Product news needs an explicit opt-in (POPIA / marketing consent).
    updates: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Off = lock screen shows "New payment activity" instead of amounts.
    show_previews: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    updated_at: Mapped[UpdatedAt]
