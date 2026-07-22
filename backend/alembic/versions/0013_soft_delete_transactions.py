"""Soft-delete transactions. The admin "delete transaction" action used to
hard-delete a ledger row outright with no trace — bad practice for a
financial audit trail, which should stay append-only. Adds deleted_at so
the row is hidden from normal views/lists instead of destroyed.

Revision ID: 0013_soft_delete_transactions
Revises: 0012_soft_delete_users
Create Date: 2026-07-22
"""

from alembic import op

revision = "0013_soft_delete_transactions"
down_revision = "0012_soft_delete_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS deleted_at")
