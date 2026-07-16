"""Cross-border currency wallets: native wallet_currency enum (USD/ZAR/BWP),
converts wallet_cards.currency from free char(3) to it (every existing row
is already 'USD', so this is a safe in-place conversion), plus two new
tables — currency_corridors (admin-editable FX rate + fee per currency
pair) and international_transfers (locked-in audit ledger for cross-currency
sends). Also adds nullable exchange_rate/fee_amount to transactions so the
transaction detail view can show FX info for cross-border sends.

Revision ID: 0005_currency_corridors
Revises: 0004_remaining_and_retirement
Create Date: 2026-07-16
"""

from alembic import op

revision = "0005_currency_corridors"
down_revision = "0004_remaining_and_retirement"
branch_labels = None
depends_on = None

# Seed rates match the client's previously-hardcoded display multipliers
# (BukkaPay-Expo/lib/currency.ts: ZAR 18.2, BWP 13.5 per USD) so nothing
# changes for users the moment this migration lands — an admin adjusts
# from here going forward.
SEED_CORRIDORS = [
    ("USD", "ZAR", "18.200000"),
    ("ZAR", "USD", "0.054945"),
    ("USD", "BWP", "13.500000"),
    ("BWP", "USD", "0.074074"),
    ("ZAR", "BWP", "0.741758"),
    ("BWP", "ZAR", "1.348148"),
]


def upgrade() -> None:
    # ─── wallet_currency enum ───────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE wallet_currency AS ENUM ('USD', 'ZAR', 'BWP');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        UPDATE wallet_cards SET currency = 'USD'
        WHERE currency IS NULL OR currency NOT IN ('USD', 'ZAR', 'BWP')
    """)
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency DROP DEFAULT")
    op.execute(
        "ALTER TABLE wallet_cards ALTER COLUMN currency TYPE wallet_currency "
        "USING currency::wallet_currency"
    )
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency SET DEFAULT 'ZAR'::wallet_currency")

    # ─── currency_corridors ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE currency_corridors (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            from_currency wallet_currency NOT NULL,
            to_currency wallet_currency NOT NULL,
            exchange_rate numeric(12,6) NOT NULL,
            fee_percentage numeric(5,2) NOT NULL DEFAULT 0,
            fee_fixed numeric(14,2) NOT NULL DEFAULT 0,
            min_amount numeric(14,2) NOT NULL DEFAULT 10,
            max_amount numeric(14,2) NOT NULL DEFAULT 50000,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_currency_corridors_different_currencies CHECK (from_currency <> to_currency),
            CONSTRAINT uq_currency_corridors_pair UNIQUE (from_currency, to_currency)
        )
    """)
    for from_cur, to_cur, rate in SEED_CORRIDORS:
        op.execute(f"""
            INSERT INTO currency_corridors (from_currency, to_currency, exchange_rate, fee_percentage, fee_fixed)
            VALUES ('{from_cur}', '{to_cur}', {rate}, 1.0, 0)
        """)

    # ─── international_transfers ────────────────────────────────────────────
    op.execute("""
        CREATE TABLE international_transfers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            recipient_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            from_currency wallet_currency NOT NULL,
            to_currency wallet_currency NOT NULL,
            source_amount numeric(14,2) NOT NULL,
            exchange_rate_applied numeric(12,6) NOT NULL,
            fee_amount numeric(14,2) NOT NULL,
            destination_amount numeric(14,2) NOT NULL,
            sender_transaction_id uuid REFERENCES transactions (id) ON DELETE SET NULL,
            recipient_transaction_id uuid REFERENCES transactions (id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_international_transfers_amount_positive CHECK (source_amount > 0)
        )
    """)
    op.execute("CREATE INDEX ix_international_transfers_sender_id ON international_transfers (sender_id)")
    op.execute("CREATE INDEX ix_international_transfers_recipient_id ON international_transfers (recipient_id)")

    # ─── transactions: optional FX metadata ─────────────────────────────────
    op.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate numeric(12,6)")
    op.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2)")


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS fee_amount")
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS exchange_rate")
    op.execute("DROP TABLE IF EXISTS international_transfers")
    op.execute("DROP TABLE IF EXISTS currency_corridors")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency DROP DEFAULT")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency TYPE char(3) USING currency::text")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency SET DEFAULT 'USD'")
    op.execute("DROP TYPE IF EXISTS wallet_currency")
