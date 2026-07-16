"""Retire tag_ride_drivers/tag_ride_rides. Tag-ride was already dropped
from the FastAPI backend's API surface during the Node rewrite (see
0004_remaining_and_retirement.py's comment) — these two tables were left
untouched at the time as a deliberate "come back to this later" item, with
no app code anywhere reading or writing them (verified via grep across
app/). Same one-way retirement pattern as the stokvel_* tables in 0004.

Revision ID: 0007_retire_tag_ride
Revises: 0006_kyc_submission
Create Date: 2026-07-16
"""

from alembic import op

revision = "0007_retire_tag_ride"
down_revision = "0006_kyc_submission"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tag_ride_rides CASCADE")
    op.execute("DROP TABLE IF EXISTS tag_ride_drivers CASCADE")


def downgrade() -> None:
    # Retirement is one-way, same as stokvel_* in 0004 — not recreated.
    pass
