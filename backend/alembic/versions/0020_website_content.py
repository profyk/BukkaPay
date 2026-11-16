"""Admin-edited website content and the pre-launch waitlist.

Revision ID: 0020_website_content
Revises: 0019_card_issuing
Create Date: 2026-11-16
"""

from alembic import op

revision = "0020_website_content"
down_revision = "0019_card_issuing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE site_content (
            key VARCHAR(40) NOT NULL,
            data JSONB NOT NULL,
            version INTEGER NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            PRIMARY KEY (key)
        )
    """)
    op.execute("""
        CREATE TABLE waitlist_signups (
            id UUID DEFAULT gen_random_uuid() NOT NULL,
            email TEXT NOT NULL,
            name TEXT,
            country_code VARCHAR(2),
            kind VARCHAR(10) NOT NULL,
            source VARCHAR(60),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT uq_waitlist_email UNIQUE (email),
            CONSTRAINT ck_waitlist_kind CHECK (kind IN ('personal','business'))
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS waitlist_signups")
    op.execute("DROP TABLE IF EXISTS site_content")
