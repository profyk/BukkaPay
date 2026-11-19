"""The owner can be sent a super-admin invitation (to set or reset their own
password and MFA); nobody else can.

Revision ID: 0025_owner_invite
Revises: 0024_sole_super_admin
Create Date: 2026-11-19
"""

from alembic import op

from app.db import admin_guard

revision = "0025_owner_invite"
down_revision = "0024_sole_super_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for stmt in admin_guard.INVITES_OWNER_ONLY_SUPER:
        op.execute(stmt)


def downgrade() -> None:
    op.execute("ALTER TABLE admin_invites DROP CONSTRAINT IF EXISTS ck_admin_invites_super_owner_only")
    op.execute("DELETE FROM admin_invites WHERE role = 'super_admin'")
    op.execute(admin_guard.INVITES_NOT_SUPER)
