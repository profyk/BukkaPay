"""core users/wallets: users, sessions, wallet_cards, transactions, contacts, payment_requests

Revision ID: 0001_core_users_wallets
Revises:
Create Date: 2026-07-15

In-place evolution of tables created by the old Node app's migrate.ts /
schema.ts (varchar PKs/FKs, inconsistent money precision, free-text
status/currency columns) into the redesigned schema: native uuid keys,
numeric(14,2) money, char(3) ISO currency, native enums, FK indexes,
updated_at, and CHECK constraints. See app/models/*.py for the target shape.
"""

from alembic import op

revision = "0001_core_users_wallets"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Every table's id/FK columns are converted from varchar to uuid across
    # this and the next 3 revisions. Postgres refuses to retype a column
    # that's still referenced by (or holds) a foreign key of a different
    # type, and the FK graph here is dense (nearly everything points at
    # users/merchants). Simplest correct approach: drop every FK constraint
    # up front, do all type conversions across all 4 revisions with nothing
    # blocking them, then re-add every FK (now uuid-to-uuid) at the end of
    # 0004 once every table has been converted.
    op.execute("""
        DO $$
        DECLARE r RECORD;
        BEGIN
            FOR r IN
                SELECT conname, conrelid::regclass AS table_name
                FROM pg_constraint
                WHERE contype = 'f' AND connamespace = 'public'::regnamespace
            LOOP
                EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
            END LOOP;
        END $$;
    """)

    # ─── users ──────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE users ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE users ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'user'")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_wallet_id ON users (wallet_id)")

    # ─── user_sessions ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE user_sessions ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions (user_id)")

    # ─── admin_users ────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE admin_role AS ENUM ('admin', 'super_admin');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE admin_users ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE admin_users ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE admin_users ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE admin_users ALTER COLUMN role DROP DEFAULT")
    op.execute("ALTER TABLE admin_users ALTER COLUMN role TYPE admin_role USING role::admin_role")
    op.execute("ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'admin'::admin_role")

    # ─── admin_sessions ─────────────────────────────────────────────────────
    op.execute("ALTER TABLE admin_sessions ALTER COLUMN admin_id TYPE uuid USING admin_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_sessions_admin_id ON admin_sessions (admin_id)")

    # ─── wallet_cards ───────────────────────────────────────────────────────
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE wallet_cards ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wallet_cards_user_id ON wallet_cards (user_id)")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN balance TYPE numeric(14,2)")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN spending_limit TYPE numeric(14,2)")
    op.execute("UPDATE wallet_cards SET currency = 'USD' WHERE currency = '$'")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS expiry_date text")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS cvv text")
    op.execute("ALTER TABLE wallet_cards ADD COLUMN IF NOT EXISTS stitch_card_id text")
    op.execute("""
        ALTER TABLE wallet_cards ADD CONSTRAINT ck_wallet_cards_balance_nonneg
            CHECK (balance >= 0) NOT VALID
    """)
    op.execute("ALTER TABLE wallet_cards VALIDATE CONSTRAINT ck_wallet_cards_balance_nonneg")

    # ─── transactions ───────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE transaction_type AS ENUM ('credit', 'debit', 'transfer');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE transactions ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE transactions ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE transactions ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE transactions ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON transactions (user_id)")
    op.execute("ALTER TABLE transactions ALTER COLUMN card_id TYPE uuid USING card_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_transactions_card_id ON transactions (card_id)")
    op.execute("ALTER TABLE transactions ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE transactions ALTER COLUMN type TYPE transaction_type USING type::transaction_type")
    op.execute("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE transactions ADD CONSTRAINT ck_transactions_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE transactions VALIDATE CONSTRAINT ck_transactions_amount_positive")

    # ─── contacts ───────────────────────────────────────────────────────────
    op.execute("ALTER TABLE contacts ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE contacts ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE contacts ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE contacts ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contacts_user_id ON contacts (user_id)")
    op.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()")

    # ─── payment_requests ───────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE payment_request_status AS ENUM
                ('pending', 'paid', 'declined', 'expired', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE payment_requests ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE payment_requests ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_requests_user_id ON payment_requests (user_id)")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("UPDATE payment_requests SET currency = 'USD' WHERE currency = '$'")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE payment_requests ALTER COLUMN status TYPE payment_request_status "
        "USING status::payment_request_status"
    )
    op.execute("ALTER TABLE payment_requests ALTER COLUMN status SET DEFAULT 'pending'::payment_request_status")
    op.execute("ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE payment_requests ADD CONSTRAINT ck_payment_requests_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE payment_requests VALIDATE CONSTRAINT ck_payment_requests_amount_positive")


def downgrade() -> None:
    op.execute("ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS ck_payment_requests_amount_positive")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN status TYPE text USING status::text")
    op.execute("DROP TYPE IF EXISTS payment_request_status")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN currency TYPE text")
    op.execute("ALTER TABLE payment_requests ALTER COLUMN amount TYPE numeric(12,2)")

    op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS ck_transactions_amount_positive")
    op.execute("ALTER TABLE transactions ALTER COLUMN type TYPE text USING type::text")
    op.execute("DROP TYPE IF EXISTS transaction_type")
    op.execute("ALTER TABLE transactions ALTER COLUMN amount TYPE numeric(10,2)")

    op.execute("ALTER TABLE wallet_cards DROP CONSTRAINT IF EXISTS ck_wallet_cards_balance_nonneg")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency TYPE text")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN balance TYPE numeric(10,2)")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN spending_limit TYPE numeric(10,2)")

    op.execute("ALTER TABLE admin_users ALTER COLUMN role TYPE text USING role::text")
    op.execute("DROP TYPE IF EXISTS admin_role")
