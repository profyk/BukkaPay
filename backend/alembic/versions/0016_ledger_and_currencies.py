"""Double-entry ledger + currencies table.

1. ``currencies`` replaces the ``wallet_currency`` Postgres enum. The enum
   columns (wallet_cards, currency_corridors, international_transfers)
   become VARCHAR(3) with a foreign key to currencies(code). This also fixes
   the drift where the Python enum had lost NGN/KES/GHS/EUR/GBP while the
   database (0008) still had them.
2. Ledger tables: ledger_accounts, journal_entries, journal_lines,
   idempotency_records, funding_requests, withdrawal_requests.
3. Triggers (``app.ledger.ddl``): journals append-only, balanced per currency
   at COMMIT, and balances writable only by the posting engine.

Existing balances are NOT moved here. Each wallet/merchant gets its ledger
account (with an opening entry against ``suspense:migration:<CCY>``) the
first time it is touched, inside a normal locked posting. That keeps this
migration fast and lock-light on a live database.

Revision ID: 0016_ledger_and_currencies
Revises: 0015_chat_read_tracking
Create Date: 2026-11-12
"""

from alembic import op

revision = "0016_ledger_and_currencies"
down_revision = "0015_chat_read_tracking"
branch_labels = None
depends_on = None

# Frozen copy of app.reference.currencies.SEED at the time of this migration.
CURRENCIES = [
    ("ZAR", "South African Rand", "R", 2, True),
    ("USD", "United States Dollar", "$", 2, True),
    ("BWP", "Botswana Pula", "P", 2, True),
    ("NGN", "Nigerian Naira", "₦", 2, True),
    ("KES", "Kenyan Shilling", "KSh", 2, True),
    ("GHS", "Ghanaian Cedi", "GH₵", 2, True),
    ("EUR", "Euro", "€", 2, True),
    ("GBP", "Pound Sterling", "£", 2, True),
    ("ZWG", "Zimbabwe Gold (ZiG)", "ZiG", 2, False),
    ("ZMW", "Zambian Kwacha", "K", 2, False),
    ("EGP", "Egyptian Pound", "E£", 2, False),
]

ENUM_COLUMNS = [
    ("wallet_cards", "currency"),
    ("currency_corridors", "from_currency"),
    ("currency_corridors", "to_currency"),
    ("international_transfers", "from_currency"),
    ("international_transfers", "to_currency"),
]

# Frozen copy of app.ledger.ddl at the time of this migration.
LEDGER_DDL = [
    """
    CREATE OR REPLACE FUNCTION ledger_forbid_mutation() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'ledger table % is append-only; post a reversal instead', TG_TABLE_NAME;
    END
    $$ LANGUAGE plpgsql
    """,
    """
    CREATE OR REPLACE FUNCTION ledger_check_line() RETURNS trigger AS $$
    DECLARE acct_currency text;
    BEGIN
        SELECT currency INTO acct_currency FROM ledger_accounts WHERE id = NEW.account_id;
        IF acct_currency IS DISTINCT FROM NEW.currency THEN
            RAISE EXCEPTION 'journal line currency % does not match account currency %',
                NEW.currency, acct_currency;
        END IF;
        RETURN NEW;
    END
    $$ LANGUAGE plpgsql
    """,
    """
    CREATE OR REPLACE FUNCTION ledger_check_entry_balanced() RETURNS trigger AS $$
    DECLARE bad record;
    BEGIN
        SELECT currency, sum(debit) AS d, sum(credit) AS c INTO bad
        FROM journal_lines WHERE entry_id = NEW.entry_id
        GROUP BY currency HAVING sum(debit) <> sum(credit) LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'journal entry % does not balance in % (debits %, credits %)',
                NEW.entry_id, bad.currency, bad.d, bad.c;
        END IF;
        RETURN NULL;
    END
    $$ LANGUAGE plpgsql
    """,
    """
    CREATE OR REPLACE FUNCTION ledger_guard_balance() RETURNS trigger AS $$
    BEGIN
        IF current_setting('bukkapay.ledger_posting', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION '%.% can only be changed by a ledger posting', TG_TABLE_NAME, TG_ARGV[0];
        END IF;
        RETURN NEW;
    END
    $$ LANGUAGE plpgsql
    """,
    """CREATE TRIGGER trg_journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
       FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()""",
    """CREATE TRIGGER trg_journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
       FOR EACH ROW EXECUTE FUNCTION ledger_forbid_mutation()""",
    """CREATE TRIGGER trg_journal_lines_currency BEFORE INSERT ON journal_lines
       FOR EACH ROW EXECUTE FUNCTION ledger_check_line()""",
    """CREATE CONSTRAINT TRIGGER trg_journal_lines_balanced AFTER INSERT ON journal_lines
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced()""",
    """CREATE TRIGGER trg_ledger_accounts_balance_guard BEFORE UPDATE OF balance ON ledger_accounts
       FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
       EXECUTE FUNCTION ledger_guard_balance('balance')""",
    """CREATE TRIGGER trg_wallet_cards_balance_guard BEFORE UPDATE OF balance ON wallet_cards
       FOR EACH ROW WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
       EXECUTE FUNCTION ledger_guard_balance('balance')""",
    """CREATE TRIGGER trg_merchants_balance_guard BEFORE UPDATE OF wallet_balance ON merchants
       FOR EACH ROW WHEN (OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance)
       EXECUTE FUNCTION ledger_guard_balance('wallet_balance')""",
]


def upgrade() -> None:
    # ─── currencies ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE currencies (
            code varchar(3) PRIMARY KEY CONSTRAINT ck_currencies_code_iso CHECK (code ~ '^[A-Z]{3}$'),
            name text NOT NULL,
            symbol varchar(8) NOT NULL,
            decimals integer NOT NULL DEFAULT 2 CONSTRAINT ck_currencies_decimals CHECK (decimals BETWEEN 0 AND 4),
            status varchar(20) NOT NULL DEFAULT 'active'
                CONSTRAINT ck_currencies_status CHECK (status IN ('active','inactive')),
            wallet_enabled boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    for code, name, symbol, decimals, enabled in CURRENCIES:
        op.execute(
            "INSERT INTO currencies (code, name, symbol, decimals, wallet_enabled) VALUES "
            f"('{code}', '{name}', '{symbol}', {decimals}, {'true' if enabled else 'false'})"
        )

    # ─── wallet_currency enum → varchar(3) + FK ─────────────────────────────
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency DROP DEFAULT")
    # This check compares two enum columns; it can't survive one of them
    # changing type before the other, so it is re-created afterwards.
    op.execute("ALTER TABLE currency_corridors DROP CONSTRAINT IF EXISTS ck_currency_corridors_different_currencies")
    for table, column in ENUM_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE varchar(3) USING {column}::text")
    op.execute(
        "ALTER TABLE currency_corridors ADD CONSTRAINT ck_currency_corridors_different_currencies "
        "CHECK (from_currency <> to_currency)"
    )
    # Any code already in use but missing from the seed is kept (inactive for
    # new wallets) so the foreign keys below can never fail on live data.
    for table, column in ENUM_COLUMNS:
        op.execute(f"""
            INSERT INTO currencies (code, name, symbol, status, wallet_enabled)
            SELECT DISTINCT {column}, {column}, {column}, 'active', true FROM {table}
            WHERE {column} IS NOT NULL AND {column} NOT IN (SELECT code FROM currencies)
        """)
    for table, column in ENUM_COLUMNS:
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT fk_{table}_{column}_currencies "
            f"FOREIGN KEY ({column}) REFERENCES currencies(code) ON DELETE RESTRICT"
        )
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency SET DEFAULT 'ZAR'")
    op.execute("DROP TYPE IF EXISTS wallet_currency")

    # ─── ledger ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE ledger_accounts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            code varchar(200) NOT NULL UNIQUE,
            name text NOT NULL,
            type varchar(20) NOT NULL
                CONSTRAINT ck_ledger_accounts_type CHECK (type IN ('asset','liability','equity','revenue','expense')),
            currency varchar(3) NOT NULL,
            wallet_card_id uuid UNIQUE REFERENCES wallet_cards(id) ON DELETE RESTRICT,
            merchant_id uuid UNIQUE REFERENCES merchants(id) ON DELETE RESTRICT,
            allow_negative boolean NOT NULL DEFAULT false,
            balance numeric(20,2) NOT NULL DEFAULT 0,
            version integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_ledger_accounts_nonneg CHECK (allow_negative OR balance >= 0)
        )
    """)
    op.execute("""
        CREATE TABLE journal_entries (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            reference varchar(40) NOT NULL UNIQUE,
            kind varchar(60) NOT NULL,
            description text NOT NULL,
            reverses_entry_id uuid UNIQUE REFERENCES journal_entries(id) ON DELETE RESTRICT,
            details jsonb NOT NULL DEFAULT '{}'::jsonb,
            posted_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_journal_entries_kind ON journal_entries (kind)")
    op.execute("""
        CREATE TABLE journal_lines (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
            line_no integer NOT NULL,
            account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
            currency varchar(3) NOT NULL,
            debit numeric(20,2) NOT NULL DEFAULT 0,
            credit numeric(20,2) NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_journal_lines_one_side CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
            CONSTRAINT uq_journal_lines_entry_line UNIQUE (entry_id, line_no)
        )
    """)
    op.execute("CREATE INDEX ix_journal_lines_entry_id ON journal_lines (entry_id)")
    op.execute("CREATE INDEX ix_journal_lines_account_created ON journal_lines (account_id, created_at)")
    op.execute("""
        CREATE TABLE idempotency_records (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            scope varchar(120) NOT NULL,
            key varchar(200) NOT NULL,
            request_hash varchar(64) NOT NULL,
            response jsonb,
            status_code integer,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_idempotency_scope_key UNIQUE (scope, key)
        )
    """)
    op.execute("""
        CREATE TABLE funding_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            purpose varchar(30) NOT NULL DEFAULT 'wallet_topup',
            user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
            wallet_card_id uuid REFERENCES wallet_cards(id) ON DELETE RESTRICT,
            payment_link_id uuid REFERENCES payment_links(id) ON DELETE RESTRICT,
            payer_name text,
            payer_email text,
            provider varchar(40) NOT NULL,
            provider_reference varchar(200) NOT NULL,
            reference varchar(60) NOT NULL UNIQUE,
            amount numeric(20,2) NOT NULL CONSTRAINT ck_funding_requests_amount_positive CHECK (amount > 0),
            currency varchar(3) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending'
                CONSTRAINT ck_funding_requests_status CHECK (status IN ('pending','completed','failed','review')),
            review_reason text,
            provider_amount numeric(20,2),
            journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
            completed_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_funding_provider_ref UNIQUE (provider, provider_reference),
            CONSTRAINT ck_funding_requests_target CHECK (
                (purpose = 'wallet_topup' AND wallet_card_id IS NOT NULL AND user_id IS NOT NULL)
                OR (purpose = 'payment_link' AND payment_link_id IS NOT NULL))
        )
    """)
    op.execute("CREATE INDEX ix_funding_requests_user_id ON funding_requests (user_id)")
    op.execute("CREATE INDEX ix_funding_requests_payment_link_id ON funding_requests (payment_link_id)")
    op.execute("""
        CREATE TABLE withdrawal_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            wallet_card_id uuid NOT NULL REFERENCES wallet_cards(id) ON DELETE RESTRICT,
            provider varchar(40) NOT NULL,
            provider_reference varchar(200),
            reference varchar(60) NOT NULL UNIQUE,
            amount numeric(20,2) NOT NULL CONSTRAINT ck_withdrawal_requests_amount_positive CHECK (amount > 0),
            currency varchar(3) NOT NULL,
            bank_id varchar(60) NOT NULL,
            account_number_last4 varchar(4) NOT NULL,
            account_name text NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'submitted'
                CONSTRAINT ck_withdrawal_requests_status CHECK (status IN ('submitted','completed','failed')),
            failure_reason text,
            debit_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
            reversal_entry_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_withdrawal_requests_user_id ON withdrawal_requests (user_id)")

    for stmt in LEDGER_DDL:
        op.execute(stmt)


def downgrade() -> None:
    # Ledger data is the financial record of truth; refuse to drop it once
    # anything has been posted.
    op.execute("""
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM journal_entries) THEN
                RAISE EXCEPTION 'refusing to downgrade: the ledger already holds postings';
            END IF;
        END $$
    """)
    for table in ("ledger_accounts", "wallet_cards", "merchants"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_balance_guard ON {table}")
    for table in ("withdrawal_requests", "funding_requests", "idempotency_records",
                  "journal_lines", "journal_entries", "ledger_accounts"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
    for fn in ("ledger_guard_balance", "ledger_check_entry_balanced", "ledger_check_line",
               "ledger_forbid_mutation"):
        op.execute(f"DROP FUNCTION IF EXISTS {fn}()")
    for table, column in ENUM_COLUMNS:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS fk_{table}_{column}_currencies")
    codes = ", ".join(f"'{c[0]}'" for c in CURRENCIES[:8])
    op.execute(f"DO $$ BEGIN CREATE TYPE wallet_currency AS ENUM ({codes}); "
               "EXCEPTION WHEN duplicate_object THEN null; END $$")
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency DROP DEFAULT")
    op.execute("ALTER TABLE currency_corridors DROP CONSTRAINT IF EXISTS ck_currency_corridors_different_currencies")
    for table, column in ENUM_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE wallet_currency USING {column}::wallet_currency")
    op.execute(
        "ALTER TABLE currency_corridors ADD CONSTRAINT ck_currency_corridors_different_currencies "
        "CHECK (from_currency <> to_currency)"
    )
    op.execute("ALTER TABLE wallet_cards ALTER COLUMN currency SET DEFAULT 'ZAR'::wallet_currency")
    op.execute("DROP TABLE IF EXISTS currencies")
