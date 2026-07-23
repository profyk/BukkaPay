"""Merchant onboarding/dashboard overhaul: expands merchant_business_type
with the real categories the onboarding flow actually offers (the old enum
only had retail/restaurant/services/rental/other, so picking anything else
in onboarding failed at the DB layer with an invalid-enum-value error).
Adds persistent payout banking details to merchants (replacing re-entering
bank details on every withdrawal), and a merchant_staff table for real,
permission-scoped staff accounts.

Revision ID: 0014_merchant_staff_banking
Revises: 0013_soft_delete_transactions
Create Date: 2026-07-23
"""

from alembic import op

revision = "0014_merchant_staff_banking"
down_revision = "0013_soft_delete_transactions"
branch_labels = None
depends_on = None

NEW_BUSINESS_TYPES = ["sme", "tuckshop", "street_vendor", "logistics", "online", "school", "utility"]


def upgrade() -> None:
    for value in NEW_BUSINESS_TYPES:
        op.execute(f"ALTER TYPE merchant_business_type ADD VALUE IF NOT EXISTS '{value}'")

    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bank_id text")
    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bank_name text")
    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_holder text")
    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_number text")
    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'savings'")

    op.execute("CREATE TYPE merchant_staff_role AS ENUM ('manager', 'cashier')")
    op.execute("CREATE TYPE merchant_staff_status AS ENUM ('pending', 'active', 'removed')")
    op.execute("""
        CREATE TABLE merchant_staff (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            invite_code text NOT NULL UNIQUE,
            user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            name text NOT NULL,
            role merchant_staff_role NOT NULL DEFAULT 'cashier',
            status merchant_staff_status NOT NULL DEFAULT 'pending',
            linked_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_merchant_staff_merchant_id ON merchant_staff (merchant_id)")
    op.execute("CREATE INDEX ix_merchant_staff_invite_code ON merchant_staff (invite_code)")
    op.execute("CREATE INDEX ix_merchant_staff_user_id ON merchant_staff (user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS merchant_staff")
    op.execute("DROP TYPE IF EXISTS merchant_staff_status")
    op.execute("DROP TYPE IF EXISTS merchant_staff_role")

    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS account_type")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS account_number")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS account_holder")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS bank_name")
    op.execute("ALTER TABLE merchants DROP COLUMN IF EXISTS bank_id")
    # New enum values can't be dropped from merchant_business_type without
    # recreating the type; left in place (non-destructive, matches every
    # other additive enum migration in this codebase).
