"""Personal vs Business accounts; admins never share an email with them.

- users.account_type: 'personal' (BukkaPay app) or 'business' (merchant
  dashboard). Accounts that own a business or are linked staff become
  'business'.
- Triggers stop a customer/business account and an admin account from ever
  using the same email (existing overlaps are refused at sign-in by the API).

Revision ID: 0027_account_types
Revises: 0026_admin_mfa_columns
Create Date: 2026-11-20
"""

from alembic import op

from app.db import account_guard

revision = "0027_account_types"
down_revision = "0026_admin_mfa_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(16) NOT NULL DEFAULT 'personal'")
    op.execute(account_guard.ACCOUNT_TYPE_CHECK)
    op.execute("""
        UPDATE users SET account_type = 'business'
        WHERE id IN (SELECT user_id FROM merchants WHERE user_id IS NOT NULL)
           OR id IN (SELECT user_id FROM merchant_staff WHERE user_id IS NOT NULL)
    """)
    op.execute(account_guard.FUNCTION)
    for stmt in account_guard.TRIGGERS:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_users_not_admin_email ON users")
    op.execute("DROP TRIGGER IF EXISTS trg_admin_users_not_user_email ON admin_users")
    op.execute("DROP FUNCTION IF EXISTS bukkapay_separate_admin_and_user_emails()")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_account_type")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS account_type")
