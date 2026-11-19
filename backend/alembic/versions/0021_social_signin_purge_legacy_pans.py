"""Sign in with Apple; purge the legacy locally-generated card numbers.

* users.apple_sub: the stable Sign in with Apple subject, unique.
* wallet_cards.card_number / cvv and virtual_cards.card_number / cvv held
  16-digit numbers and CVVs the old backend generated itself. They belonged
  to no card network, never worked anywhere, and nothing reads them any more
  (real cards live in issued_cards and BukkaPay never stores a PAN or CVV).
  Keeping them only creates PCI-shaped risk, so they are wiped. The columns
  stay (nullable) so older code paths and the downgrade still line up; a
  later migration can drop them.

Revision ID: 0021_social_signin
Revises: 0020_website_content
Create Date: 2026-11-19
"""

from alembic import op

revision = "0021_social_signin"
down_revision = "0020_website_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub varchar(255)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_users_apple_sub ON users (apple_sub)")

    op.execute("UPDATE wallet_cards SET card_number = NULL, cvv = NULL "
               "WHERE card_number IS NOT NULL OR cvv IS NOT NULL")
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN card_number DROP NOT NULL")
    op.execute("UPDATE virtual_cards SET card_number = NULL, cvv = NULL "
               "WHERE card_number IS NOT NULL OR cvv IS NOT NULL")


def downgrade() -> None:
    # The wiped numbers are not restorable (and must not be).
    op.execute("DROP INDEX IF EXISTS uq_users_apple_sub")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS apple_sub")
