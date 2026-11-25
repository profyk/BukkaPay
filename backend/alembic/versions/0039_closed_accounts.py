"""Closed accounts: identity details sealed for the legal retention period
after an account is deleted, purged automatically afterwards.

Additive only: one new table.

Revision ID: 0039_closed_accounts
Revises: 0038_settlement_runs
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0039_closed_accounts"
down_revision = "0038_settlement_runs"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "closed_accounts",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("wallet_id", sa.String(40), nullable=False),
        sa.Column("closed_by", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text()),
        sa.Column("snapshot", postgresql.JSONB()),
        sa.Column("closed_at", TS, nullable=False),
        sa.Column("retain_until", TS, nullable=False),
        sa.Column("purged_at", TS),
    )
    op.create_index("ix_closed_accounts_retain_until", "closed_accounts", ["retain_until"])
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("closed_accounts")
