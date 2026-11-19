"""Legal documents edited in the admin app and published to the website,
with an append-only history of every published version.

Revision ID: 0023_legal_documents
Revises: 0022_rls
Create Date: 2026-11-19
"""

from alembic import op

from app.db import rls

revision = "0023_legal_documents"
down_revision = "0022_rls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE legal_documents (
            slug VARCHAR(60) NOT NULL,
            title VARCHAR(120) NOT NULL,
            summary VARCHAR(300) NOT NULL DEFAULT '',
            audience VARCHAR(20) NOT NULL DEFAULT 'everyone',
            body TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 100,
            listed BOOLEAN NOT NULL DEFAULT true,
            draft_version INTEGER NOT NULL DEFAULT 1,
            published_version INTEGER,
            updated_by TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            PRIMARY KEY (slug),
            CONSTRAINT ck_legal_documents_audience
                CHECK (audience IN ('everyone', 'customers', 'merchants', 'cardholders'))
        )
    """)
    op.execute("""
        CREATE TABLE legal_document_versions (
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            slug VARCHAR(60) NOT NULL REFERENCES legal_documents (slug) ON DELETE RESTRICT,
            version INTEGER NOT NULL,
            title VARCHAR(120) NOT NULL,
            summary VARCHAR(300) NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            effective_date DATE NOT NULL,
            review_status VARCHAR(20) NOT NULL,
            reviewed_by TEXT,
            change_note TEXT,
            published_by TEXT,
            published_at TIMESTAMP WITH TIME ZONE NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_legal_document_versions_slug_version UNIQUE (slug, version),
            CONSTRAINT ck_legal_document_versions_review
                CHECK (review_status IN ('template', 'in_review', 'approved'))
        )
    """)
    # Published versions are a legal record: never edited or deleted.
    op.execute("""
        CREATE FUNCTION legal_versions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'published legal document versions cannot be changed or deleted';
        END $$
    """)
    op.execute("""
        CREATE TRIGGER legal_versions_append_only
        BEFORE UPDATE OR DELETE ON legal_document_versions
        FOR EACH ROW EXECUTE FUNCTION legal_versions_append_only()
    """)
    # Supabase doesn't allow the RLS event trigger, so lock the new tables
    # down explicitly (RLS on, nothing granted to anon/authenticated).
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS legal_document_versions")
    op.execute("DROP FUNCTION IF EXISTS legal_versions_append_only()")
    op.execute("DROP TABLE IF EXISTS legal_documents")
