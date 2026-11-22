"""Cash-replacement pricing: free P2P, 1.0% merchant payments, 1.0% trade escrow.

Only rules still at their original defaults are changed; any rule an admin
has edited is left alone.

Revision ID: 0031_pricing
Revises: 0030_ledger_segregation
Create Date: 2026-11-22
"""

from alembic import op

revision = "0031_pricing"
down_revision = "0030_ledger_segregation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Free wallet-to-wallet transfers.
    op.execute("""UPDATE fee_schedules SET percentage = 0, fixed = 0, updated_at = now()
                  WHERE product = 'p2p' AND ((percentage = 0.5 AND fixed IN (0, 1.00)))""")
    # Merchant QR / checkout default 1.5% -> 1.0%.
    op.execute("""UPDATE fee_schedules SET percentage = 1.0, updated_at = now()
                  WHERE product = 'merchant_payment' AND percentage = 1.5 AND fixed = 0
                    AND country_code IS NULL AND currency IS NULL""")
    # Trade escrow fee rule (admins can raise it up to 1.5%).
    op.execute("""INSERT INTO fee_schedules (id, product, percentage, fixed, priority, active, created_at, updated_at)
                  SELECT gen_random_uuid(), 'trade_escrow', 1.0, 0, 0, true, now(), now()
                  WHERE NOT EXISTS (SELECT 1 FROM fee_schedules WHERE product = 'trade_escrow')""")


def downgrade() -> None:
    op.execute("DELETE FROM fee_schedules WHERE product = 'trade_escrow'")
