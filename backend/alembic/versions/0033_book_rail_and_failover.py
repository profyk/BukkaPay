"""Book-transfer rail (instant settlement against country pools) and backup rails per corridor.

Revision ID: 0033_book_rail
Revises: 0032_push
Create Date: 2026-11-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033_book_rail"
down_revision = "0032_push"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payment_corridors", sa.Column("fallback_provider_ids", postgresql.JSONB(), nullable=False,
                                                 server_default=sa.text("'[]'::jsonb")))
    # Active as a provider, but no corridor uses it until an admin sets a
    # corridor to internal_book and points it at this rail.
    op.execute("""
        INSERT INTO payment_providers (id, code, name, provider_type, country_code, currencies, methods, mode,
                                       status, webhook_status, limits, credentials_ref, created_at, updated_at)
        SELECT gen_random_uuid(), 'book', 'BukkaPay book transfer (prefunded country pools, instant)', 'settlement',
               NULL, '[]'::jsonb, '["cross_border"]'::jsonb, 'production', 'active', 'not_configured', '{}'::jsonb,
               NULL, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM payment_providers WHERE code = 'book')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM payment_providers WHERE code = 'book' "
               "AND NOT EXISTS (SELECT 1 FROM payment_corridors WHERE rail_provider_id = payment_providers.id)")
    op.drop_column("payment_corridors", "fallback_provider_ids")
