"""More least-privilege admin roles: risk analyst, KYC analyst, treasury
manager, marketing manager, travel manager.

Revision ID: 0029_more_admin_roles
Revises: 0028_retire_bus_travel
Create Date: 2026-11-22
"""

from alembic import op

revision = "0029_more_admin_roles"
down_revision = "0028_retire_bus_travel"
branch_labels = None
depends_on = None

NEW = ("risk_analyst", "kyc_analyst", "treasury_manager", "marketing_manager", "travel_manager")


def upgrade() -> None:
    # Enum values can't be added inside a transaction block on older Postgres.
    with op.get_context().autocommit_block():
        for value in NEW:
            op.execute(f"ALTER TYPE admin_role ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass  # Postgres can't drop enum values; unused values are harmless
