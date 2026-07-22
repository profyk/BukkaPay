"""Transaction PIN. Adds a 4-6 digit PIN (bcrypt-hashed, same hash_secret/
verify_secret path as the login password) that the user must set from their
profile and enter to authorize any payment or transfer — enforced
server-side on the money-moving endpoints, not just a client-side prompt.
Includes failed-attempt lockout so a stolen session token can't be used to
brute-force the PIN.

Revision ID: 0010_transaction_pin
Revises: 0009_travel_booking
Create Date: 2026-07-22
"""

from alembic import op

revision = "0010_transaction_pin"
down_revision = "0009_travel_booking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_pin text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts integer NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until timestamptz")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS pin_locked_until")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS pin_failed_attempts")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS transaction_pin")
