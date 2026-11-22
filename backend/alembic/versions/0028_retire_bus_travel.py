"""Retire bus travel: BukkaPay sells flights only.

Bus operators, routes and future departures are switched off (kept for the
history of past tickets; nothing is deleted).

Revision ID: 0028_retire_bus_travel
Revises: 0027_account_types
Create Date: 2026-11-22
"""

from alembic import op

revision = "0028_retire_bus_travel"
down_revision = "0027_account_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE travel_operators SET is_active = false WHERE mode = 'bus'")
    op.execute("UPDATE travel_routes SET is_active = false WHERE mode = 'bus'")
    op.execute("""
        UPDATE travel_departures SET is_active = false
        WHERE route_id IN (SELECT id FROM travel_routes WHERE mode = 'bus')
    """)


def downgrade() -> None:
    pass  # re-enable bus listings by hand if ever needed
