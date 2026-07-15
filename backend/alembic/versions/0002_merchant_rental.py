"""merchant + rental: merchants, merchant_transactions, merchant_subscriptions,
billing_links, properties, property_units, tenants, rent_payments, rent_payment_links

Revision ID: 0002_merchant_rental
Revises: 0001_core_users_wallets
Create Date: 2026-07-15
"""

from alembic import op

revision = "0002_merchant_rental"
down_revision = "0001_core_users_wallets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── merchants ──────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE merchant_business_type AS ENUM
                ('retail', 'restaurant', 'services', 'rental', 'other');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE subscription_plan AS ENUM ('starter', 'growth', 'pro');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE merchants ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE merchants ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE merchants ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE merchants ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_merchants_user_id ON merchants (user_id)")
    op.execute("ALTER TABLE merchants ALTER COLUMN wallet_balance TYPE numeric(14,2)")
    op.execute("ALTER TABLE merchants ALTER COLUMN daily_limit TYPE numeric(14,2)")
    # business_type was free text with no guaranteed populated values on old rows;
    # backfill anything unmapped to 'other' before converting to the enum.
    op.execute("""
        UPDATE merchants SET business_type = 'other'
        WHERE business_type IS NULL
           OR business_type NOT IN ('retail', 'restaurant', 'services', 'rental', 'other')
    """)
    op.execute(
        "ALTER TABLE merchants ALTER COLUMN business_type TYPE merchant_business_type "
        "USING business_type::merchant_business_type"
    )
    op.execute("ALTER TABLE merchants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_plan DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchants ALTER COLUMN subscription_plan TYPE subscription_plan "
        "USING subscription_plan::subscription_plan"
    )
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_plan SET DEFAULT 'starter'::subscription_plan")
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_status DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchants ALTER COLUMN subscription_status TYPE subscription_status "
        "USING subscription_status::subscription_status"
    )
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_status SET DEFAULT 'active'::subscription_status")
    op.execute("""
        ALTER TABLE merchants ADD CONSTRAINT ck_merchants_wallet_balance_nonneg
            CHECK (wallet_balance >= 0) NOT VALID
    """)
    op.execute("ALTER TABLE merchants VALIDATE CONSTRAINT ck_merchants_wallet_balance_nonneg")

    # ─── merchant_transactions ──────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE merchant_transaction_type AS ENUM ('payment', 'refund', 'withdrawal');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE merchant_transaction_status AS ENUM ('pending', 'completed', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_merchant_transactions_merchant_id ON merchant_transactions (merchant_id)")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN payer_id TYPE uuid USING payer_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_merchant_transactions_payer_id ON merchant_transactions (payer_id)")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN type DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchant_transactions ALTER COLUMN type TYPE merchant_transaction_type "
        "USING type::merchant_transaction_type"
    )
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN type SET DEFAULT 'payment'::merchant_transaction_type")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchant_transactions ALTER COLUMN status TYPE merchant_transaction_status "
        "USING status::merchant_transaction_status"
    )
    op.execute(
        "ALTER TABLE merchant_transactions ALTER COLUMN status SET DEFAULT 'completed'::merchant_transaction_status"
    )
    op.execute("""
        ALTER TABLE merchant_transactions ADD CONSTRAINT ck_merchant_transactions_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE merchant_transactions VALIDATE CONSTRAINT ck_merchant_transactions_amount_positive")

    # ─── merchant_subscriptions ─────────────────────────────────────────────
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_merchant_subscriptions_merchant_id ON merchant_subscriptions (merchant_id)")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN price TYPE numeric(14,2)")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN plan DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchant_subscriptions ALTER COLUMN plan TYPE subscription_plan USING plan::subscription_plan"
    )
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN plan SET DEFAULT 'starter'::subscription_plan")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE merchant_subscriptions ALTER COLUMN status TYPE subscription_status "
        "USING status::subscription_status"
    )
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN status SET DEFAULT 'active'::subscription_status")

    # ─── billing_links ──────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE billing_link_status AS ENUM ('active', 'paused', 'archived');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE billing_links ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE billing_links ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE billing_links ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE billing_links ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_billing_links_merchant_id ON billing_links (merchant_id)")
    op.execute("ALTER TABLE billing_links ALTER COLUMN payment_link_id TYPE uuid USING payment_link_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_billing_links_payment_link_id ON billing_links (payment_link_id)")
    op.execute("ALTER TABLE billing_links ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE billing_links ALTER COLUMN total_collected TYPE numeric(14,2)")
    op.execute("UPDATE billing_links SET currency = 'ZAR' WHERE currency = '$'")
    op.execute("ALTER TABLE billing_links ALTER COLUMN currency TYPE char(3)")
    op.execute("""
        UPDATE billing_links SET status = 'active'
        WHERE status IS NULL OR status NOT IN ('active', 'paused', 'archived')
    """)
    op.execute("ALTER TABLE billing_links ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE billing_links ALTER COLUMN status TYPE billing_link_status USING status::billing_link_status"
    )
    op.execute("ALTER TABLE billing_links ALTER COLUMN status SET DEFAULT 'active'::billing_link_status")
    op.execute("""
        ALTER TABLE billing_links ADD CONSTRAINT ck_billing_links_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE billing_links VALIDATE CONSTRAINT ck_billing_links_amount_positive")

    # ─── properties ─────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE property_type AS ENUM ('apartment', 'house', 'commercial', 'other');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE properties ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE properties ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE properties ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE properties ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_properties_merchant_id ON properties (merchant_id)")
    op.execute("ALTER TABLE properties ALTER COLUMN landlord_id TYPE uuid USING landlord_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_properties_landlord_id ON properties (landlord_id)")
    op.execute("ALTER TABLE properties ALTER COLUMN property_type DROP DEFAULT")
    op.execute(
        "ALTER TABLE properties ALTER COLUMN property_type TYPE property_type USING property_type::property_type"
    )
    op.execute("ALTER TABLE properties ALTER COLUMN property_type SET DEFAULT 'apartment'::property_type")
    op.execute("ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")

    # ─── property_units ─────────────────────────────────────────────────────
    op.execute("ALTER TABLE property_units ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE property_units ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE property_units ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE property_units ALTER COLUMN property_id TYPE uuid USING property_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_property_units_property_id ON property_units (property_id)")
    op.execute("ALTER TABLE property_units ALTER COLUMN monthly_rent TYPE numeric(14,2)")
    op.execute("ALTER TABLE property_units ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE property_units ADD CONSTRAINT ck_property_units_monthly_rent_positive
            CHECK (monthly_rent > 0) NOT VALID
    """)
    op.execute("ALTER TABLE property_units VALIDATE CONSTRAINT ck_property_units_monthly_rent_positive")

    # ─── tenants ─────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE tenants ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE tenants ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE tenants ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE tenants ALTER COLUMN property_id TYPE uuid USING property_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_property_id ON tenants (property_id)")
    op.execute("ALTER TABLE tenants ALTER COLUMN unit_id TYPE uuid USING unit_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_unit_id ON tenants (unit_id)")
    op.execute("ALTER TABLE tenants ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_user_id ON tenants (user_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_tenants_tenant_id ON tenants (tenant_id)")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")

    # ─── rent_payments ──────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE rent_payment_method AS ENUM ('wallet', 'card', 'stitch');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE rent_payment_status AS ENUM ('pending', 'completed', 'failed');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE rent_payments ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE rent_payments ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payments_tenant_id ON rent_payments (tenant_id)")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN property_id TYPE uuid USING property_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payments_property_id ON rent_payments (property_id)")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN unit_id TYPE uuid USING unit_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payments_unit_id ON rent_payments (unit_id)")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payments_merchant_id ON rent_payments (merchant_id)")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN payment_method DROP DEFAULT")
    op.execute(
        "ALTER TABLE rent_payments ALTER COLUMN payment_method TYPE rent_payment_method "
        "USING payment_method::rent_payment_method"
    )
    op.execute("ALTER TABLE rent_payments ALTER COLUMN payment_method SET DEFAULT 'wallet'::rent_payment_method")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE rent_payments ALTER COLUMN status TYPE rent_payment_status USING status::rent_payment_status"
    )
    op.execute("ALTER TABLE rent_payments ALTER COLUMN status SET DEFAULT 'completed'::rent_payment_status")
    op.execute("""
        ALTER TABLE rent_payments ADD CONSTRAINT ck_rent_payments_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE rent_payments VALIDATE CONSTRAINT ck_rent_payments_amount_positive")

    # ─── rent_payment_links ─────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE link_status AS ENUM ('pending', 'paid', 'expired', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN tenant_id TYPE uuid USING tenant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payment_links_tenant_id ON rent_payment_links (tenant_id)")
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN merchant_id TYPE uuid USING merchant_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rent_payment_links_merchant_id ON rent_payment_links (merchant_id)")
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE rent_payment_links ALTER COLUMN status TYPE link_status USING status::link_status"
    )
    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN status SET DEFAULT 'pending'::link_status")
    op.execute("ALTER TABLE rent_payment_links ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE rent_payment_links ADD CONSTRAINT ck_rent_payment_links_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE rent_payment_links VALIDATE CONSTRAINT ck_rent_payment_links_amount_positive")


def downgrade() -> None:
    for table, constraint in [
        ("rent_payment_links", "ck_rent_payment_links_amount_positive"),
        ("rent_payments", "ck_rent_payments_amount_positive"),
        ("property_units", "ck_property_units_monthly_rent_positive"),
        ("billing_links", "ck_billing_links_amount_positive"),
        ("merchant_transactions", "ck_merchant_transactions_amount_positive"),
        ("merchants", "ck_merchants_wallet_balance_nonneg"),
    ]:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")

    op.execute("ALTER TABLE rent_payment_links ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE rent_payments ALTER COLUMN payment_method TYPE text USING payment_method::text")
    op.execute("ALTER TABLE properties ALTER COLUMN property_type TYPE text USING property_type::text")
    op.execute("ALTER TABLE billing_links ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE merchant_subscriptions ALTER COLUMN plan TYPE text USING plan::text")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE merchant_transactions ALTER COLUMN type TYPE text USING type::text")
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_status TYPE text USING subscription_status::text")
    op.execute("ALTER TABLE merchants ALTER COLUMN subscription_plan TYPE text USING subscription_plan::text")
    op.execute("ALTER TABLE merchants ALTER COLUMN business_type TYPE text USING business_type::text")

    op.execute("DROP TYPE IF EXISTS link_status")
    op.execute("DROP TYPE IF EXISTS rent_payment_status")
    op.execute("DROP TYPE IF EXISTS rent_payment_method")
    op.execute("DROP TYPE IF EXISTS property_type")
    op.execute("DROP TYPE IF EXISTS billing_link_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS subscription_plan")
    op.execute("DROP TYPE IF EXISTS merchant_transaction_status")
    op.execute("DROP TYPE IF EXISTS merchant_transaction_type")
    op.execute("DROP TYPE IF EXISTS merchant_business_type")
