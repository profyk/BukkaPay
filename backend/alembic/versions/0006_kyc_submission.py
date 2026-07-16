"""Real KYC submissions. Previously `admin_user_service.list_kyc_pending()`
returned every unverified user with hardcoded placeholder document data —
no user ever actually submitted anything. This adds real submission fields
to `users` and a proper status lifecycle (not_submitted -> pending ->
approved/rejected), so the admin KYC queue (which already expects this
shape — see BukkaPay-Admin's use-kyc.ts/kyc.tsx) reflects real data.

Revision ID: 0006_kyc_submission
Revises: 0005_currency_corridors
Create Date: 2026-07-16
"""

from alembic import op

revision = "0006_kyc_submission"
down_revision = "0005_currency_corridors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE kyc_status AS ENUM ('not_submitted', 'pending', 'approved', 'rejected');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE kyc_document_type AS ENUM ('national_id', 'passport', 'driver_license');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status kyc_status NOT NULL DEFAULT 'not_submitted'")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_full_name text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_document_type kyc_document_type")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_document_number text")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_reviewed_at timestamptz")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason text")

    # Users already manually verified (via the old placeholder flow, or
    # admin's direct verify toggle) count as already-approved — real
    # submissions start from zero for everyone else, since no genuine
    # submission ever existed before this migration.
    op.execute("UPDATE users SET kyc_status = 'approved' WHERE verified = true")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_rejection_reason")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_reviewed_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_submitted_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_document_number")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_document_type")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_full_name")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS kyc_status")
    op.execute("DROP TYPE IF EXISTS kyc_document_type")
    op.execute("DROP TYPE IF EXISTS kyc_status")
