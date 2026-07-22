"""Card maintenance fee tracking. Adds last_maintenance_fee_at to wallet_cards
so the monthly maintenance-fee cron can tell which cards are due without
double-charging one that was already billed this month.

Revision ID: 0011_card_maintenance_fee
Revises: 0010_transaction_pin
Create Date: 2026-07-22
"""

from alembic import op

revision = "0011_card_maintenance_fee"
down_revision = "0010_transaction_pin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS last_maintenance_fee_at timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE wallet_cards DROP COLUMN IF EXISTS last_maintenance_fee_at")
