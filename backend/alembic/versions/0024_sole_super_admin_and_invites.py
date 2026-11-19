"""The owner is the only super admin, enforced by the database; emailed
admin invitations.

- Any other super admin becomes a regular admin; the owner's account (if it
  exists) becomes the super admin.
- A trigger refuses: super_admin on any other email, changing the owner's
  email, demoting or deactivating the owner, and deleting the owner.
- A unique partial index means there can never be two super admins.

Revision ID: 0024_sole_super_admin
Revises: 0023_legal_documents
Create Date: 2026-11-19
"""

from alembic import op

from app.db import admin_guard, rls

revision = "0024_sole_super_admin"
down_revision = "0023_legal_documents"
branch_labels = None
depends_on = None

OWNER = admin_guard.OWNER


def upgrade() -> None:
    op.execute(f"UPDATE admin_users SET role = 'admin' WHERE role = 'super_admin' AND lower(email) <> '{OWNER}'")
    op.execute(f"UPDATE admin_users SET role = 'super_admin', is_active = true WHERE lower(email) = '{OWNER}'")
    op.execute(admin_guard.SINGLE_SUPER_ADMIN_INDEX)
    op.execute(admin_guard.FUNCTION)
    op.execute(admin_guard.DROP_TRIGGER)
    op.execute(admin_guard.TRIGGER)

    op.execute("""
        CREATE TABLE admin_invites (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR NOT NULL,
            name TEXT NOT NULL,
            role admin_role NOT NULL,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            invited_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            accepted_at TIMESTAMP WITH TIME ZONE,
            revoked_at TIMESTAMP WITH TIME ZONE,
            mfa_secret VARCHAR(64),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
        )
    """)
    op.execute(admin_guard.INVITES_NOT_SUPER)
    op.execute("CREATE INDEX ix_admin_invites_email ON admin_invites (email)")
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.execute("DROP TABLE admin_invites")
    op.execute("DROP TRIGGER trg_admin_owner_guard ON admin_users")
    op.execute("DROP FUNCTION bukkapay_admin_owner_guard()")
    op.execute("DROP INDEX uq_admin_users_single_super_admin")
