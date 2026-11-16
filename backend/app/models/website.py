"""Public website content, edited by admins (no redeploy needed), and the
pre-launch waitlist."""

from sqlalchemy import CheckConstraint, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, UpdatedAt, UUIDPk


class SiteContent(Base):
    """One row per section (settings, home, pricing, faq …). `data` is
    validated against the section's schema in app.website.content before it
    is saved, and every save is audited."""

    __tablename__ = "site_content"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(default=1)
    updated_by: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[UpdatedAt]


class WaitlistSignup(Base):
    __tablename__ = "waitlist_signups"
    __table_args__ = (
        UniqueConstraint("email", name="uq_waitlist_email"),
        CheckConstraint("kind IN ('personal','business')", name="ck_waitlist_kind"),
    )

    id: Mapped[UUIDPk]
    email: Mapped[str] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    country_code: Mapped[str | None] = mapped_column(String(2))
    kind: Mapped[str] = mapped_column(String(10), default="personal")
    source: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[CreatedAt]
