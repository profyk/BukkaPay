"""Weekly cross-border bulk settlement runs (plans; booking stays maker-checker).

Additive only: two new tables.

Revision ID: 0038_settlement_runs
Revises: 0037_africa_rollout
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0038_settlement_runs"
down_revision = "0037_africa_rollout"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "settlement_batches",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reference", sa.String(40), nullable=False, unique=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="proposed"),
        sa.Column("positions", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("unfunded", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("settled_at", TS),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('proposed','in_progress','settled','cancelled')",
                           name="ck_settlement_batches_status"),
    )
    op.create_index("ix_settlement_batches_status", "settlement_batches", ["status", "created_at"])
    op.create_table(
        "settlement_lines",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("batch_id", UUID, sa.ForeignKey("settlement_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_currency", sa.String(3), nullable=False),
        sa.Column("to_currency", sa.String(3), nullable=False),
        sa.Column("from_amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("expected_to_amount", sa.Numeric(20, 2)),
        sa.Column("rate", sa.Numeric(18, 8)),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("bank_reference", sa.String(80)),
        sa.Column("actual_from_amount", sa.Numeric(20, 2)),
        sa.Column("actual_to_amount", sa.Numeric(20, 2)),
        sa.Column("approval_request_id", UUID, sa.ForeignKey("approval_requests.id")),
        sa.Column("journal_reference", sa.String(40)),
        sa.Column("settled_at", TS),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','requested','settled','cancelled')", name="ck_settlement_lines_status"),
        sa.CheckConstraint("from_amount > 0", name="ck_settlement_lines_amount"),
    )
    op.create_index("ix_settlement_lines_batch_id", "settlement_lines", ["batch_id"])
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("settlement_lines")
    op.drop_table("settlement_batches")
