"""Add the admin MFA columns the AdminUser model has used but no migration
ever created (production admin login failed with "column
admin_users.mfa_enabled does not exist").

Revision ID: 0026_admin_mfa_columns
Revises: 0025_owner_invite
Create Date: 2026-11-20
"""

from alembic import op

revision = "0026_admin_mfa_columns"
down_revision = "0025_owner_invite"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64)")


def downgrade() -> None:
    op.execute("ALTER TABLE admin_users DROP COLUMN IF EXISTS mfa_secret")
    op.execute("ALTER TABLE admin_users DROP COLUMN IF EXISTS mfa_enabled")
