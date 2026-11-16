"""Website enquiries (contact, business, bank/PSP/custodian partnerships).

Revision ID: 0018_enquiries
Revises: 0017_network_platform
Create Date: 2026-11-13
"""

from alembic import op

revision = "0018_enquiries"
down_revision = "0017_network_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE enquiries (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            kind varchar(20) NOT NULL CONSTRAINT ck_enquiries_kind CHECK
                (kind IN ('contact','business','bank_partner','psp_partner','custodian','press','other')),
            name text NOT NULL,
            email text NOT NULL,
            organisation text,
            country_code varchar(2),
            message text NOT NULL,
            status varchar(12) NOT NULL DEFAULT 'new'
                CONSTRAINT ck_enquiries_status CHECK (status IN ('new','in_progress','closed')),
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS enquiries")
