"""Help desk: support tickets and their conversation.

Every customer conversation is a ticket — from in-app chat, the help form,
the email help line, or opened by an agent (e.g. after a phone call).

Status:  open → waiting_customer → (customer replies) → open … → resolved → closed
         Resolved tickets reopen if the customer replies within 7 days;
         after that they close, and a new message starts a new ticket.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, OptionalTimestamp, TimestampMixin, UUIDPk

TICKET_STATUSES = ("open", "waiting_customer", "resolved", "closed")
TICKET_PRIORITIES = ("low", "normal", "high", "urgent")
TICKET_CATEGORIES = ("account", "payments", "cards", "transfers", "verification", "merchant", "fraud", "fees", "other")
TICKET_CHANNELS = ("chat", "app", "email", "phone", "web")


class SupportTicket(Base, TimestampMixin):
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint("status IN ('open','waiting_customer','resolved','closed')", name="ck_support_tickets_status"),
        CheckConstraint("priority IN ('low','normal','high','urgent')", name="ck_support_tickets_priority"),
        CheckConstraint("csat_rating IS NULL OR csat_rating BETWEEN 1 AND 5", name="ck_support_tickets_csat"),
        Index("ix_support_tickets_status", "status", "updated_at"),
        Index("ix_support_tickets_user", "user_id", "created_at"),
    )

    id: Mapped[UUIDPk]
    reference: Mapped[str] = mapped_column(String(12), unique=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requester_email: Mapped[str | None] = mapped_column(Text)
    requester_name: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(8))
    subject: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(20), default="other", server_default="other")
    priority: Mapped[str] = mapped_column(String(8), default="normal", server_default="normal")
    status: Mapped[str] = mapped_column(String(18), default="open", server_default="open")
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                              ondelete="SET NULL"))
    first_response_at: Mapped[OptionalTimestamp]
    last_customer_at: Mapped[OptionalTimestamp]
    last_agent_at: Mapped[OptionalTimestamp]
    resolved_at: Mapped[OptionalTimestamp]
    closed_at: Mapped[OptionalTimestamp]
    csat_rating: Mapped[int | None] = mapped_column(Integer)
    csat_comment: Mapped[str | None] = mapped_column(Text)
    rating_token: Mapped[str | None] = mapped_column(String(64), unique=True)


class TicketMessage(Base):
    __tablename__ = "support_ticket_messages"

    id: Mapped[UUIDPk]
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"),
                                                 index=True)
    author: Mapped[str] = mapped_column(String(10))  # customer | agent | system
    admin_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id",
                                                                                     ondelete="SET NULL"))
    body: Mapped[str] = mapped_column(Text)
    internal: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # agent-only note
    via: Mapped[str] = mapped_column(String(8))
    email_message_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[CreatedAt]
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
