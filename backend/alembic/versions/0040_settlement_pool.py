"""Settlement lines say which pool they square: book transfers or the FX
(currency-swap) pool. Existing lines are book lines.

Revision ID: 0040_settlement_pool
Revises: 0039_closed_accounts
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0040_settlement_pool"
down_revision = "0039_closed_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("settlement_lines", sa.Column("pool", sa.String(8), nullable=False, server_default="book"))


def downgrade() -> None:
    op.drop_column("settlement_lines", "pool")
