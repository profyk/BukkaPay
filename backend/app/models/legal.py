"""Legal documents (terms, privacy policy, data breach policy …) edited in the
admin app and published to the website.

`legal_documents` holds the working draft of each document. Publishing copies
the draft into `legal_document_versions`, which is append-only: every version
that was ever public stays on record with its effective date, who published
it and whether counsel had reviewed it.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedAt, UpdatedAt, UUIDPk

REVIEW_STATUSES = ("template", "in_review", "approved")
AUDIENCES = ("everyone", "customers", "merchants", "cardholders")


class LegalDocument(Base):
    __tablename__ = "legal_documents"
    __table_args__ = (CheckConstraint(f"audience IN {AUDIENCES}", name="ck_legal_documents_audience"),)

    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(String(300), default="")
    audience: Mapped[str] = mapped_column(String(20), default="everyone")
    body: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    listed: Mapped[bool] = mapped_column(Boolean, default=True)
    # Optimistic lock for the draft; bumped on every save.
    draft_version: Mapped[int] = mapped_column(Integer, default=1)
    # Latest published version number (None = never published from the admin).
    published_version: Mapped[int | None] = mapped_column(Integer)
    updated_by: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[UpdatedAt]
    created_at: Mapped[CreatedAt]


class LegalDocumentVersion(Base):
    __tablename__ = "legal_document_versions"
    __table_args__ = (
        UniqueConstraint("slug", "version", name="uq_legal_document_versions_slug_version"),
        CheckConstraint(f"review_status IN {REVIEW_STATUSES}", name="ck_legal_document_versions_review"),
    )

    id: Mapped[UUIDPk]
    slug: Mapped[str] = mapped_column(String(60), ForeignKey("legal_documents.slug", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text)
    effective_date: Mapped[date] = mapped_column(Date)
    review_status: Mapped[str] = mapped_column(String(20))
    reviewed_by: Mapped[str | None] = mapped_column(Text)
    change_note: Mapped[str | None] = mapped_column(Text)
    published_by: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
