"""Soft-delete users. Admin "delete user" used to hard-delete the row, which
cascades (ondelete="CASCADE") through transactions, wallet_cards,
international_transfers, and notifications — destroying the entire financial
audit trail for that user. Adds deleted_at so delete_user can anonymize PII
and freeze the account instead, keeping every money-movement row intact.

Revision ID: 0012_soft_delete_users
Revises: 0011_card_maintenance_fee
Create Date: 2026-07-22
"""

from alembic import op

revision = "0012_soft_delete_users"
down_revision = "0011_card_maintenance_fee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS deleted_at")
