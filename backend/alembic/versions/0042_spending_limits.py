"""Customer-set spending limits (per currency), enforced on outgoing payments.

Additive only: one JSONB column with an empty default.

Revision ID: 0042_spending_limits
Revises: 0041_help_desk
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0042_spending_limits"
down_revision = "0041_help_desk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("spending_limits", postgresql.JSONB(), nullable=False,
                                     server_default=sa.text("'{}'::jsonb")))


def downgrade() -> None:
    op.drop_column("users", "spending_limits")
