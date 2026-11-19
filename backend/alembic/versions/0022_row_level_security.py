"""Row-level security on every public table (deny-by-default for Supabase's
anon/authenticated API roles). See app/db/rls.py for the reasoning.

The backend role owns the tables and bypasses RLS, so the API is unaffected.
If the database's tables are owned by a different role than the one running
migrations, those tables are skipped; the deploy runbook checks for that
(docs/launch-checklist.md, "RLS").

Revision ID: 0022_rls
Revises: 0021_social_signin
Create Date: 2026-11-19
"""

from alembic import op
from app.db import rls

revision = "0022_rls"
down_revision = "0021_social_signin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(rls.FUNCTION)
    op.execute(rls.ENABLE)
    op.execute(rls.EVENT_TRIGGER)


def downgrade() -> None:
    op.execute("DROP EVENT TRIGGER IF EXISTS bukkapay_rls_on_create")
    op.execute("DROP FUNCTION IF EXISTS bukkapay_rls_on_create()")
    # RLS stays enabled on purpose: turning it off would re-expose the data
    # through the Supabase API. Disable it table by table only deliberately.
    op.execute("DROP FUNCTION IF EXISTS bukkapay_enable_rls()")
