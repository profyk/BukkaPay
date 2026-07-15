"""savings/gift-cards/payment-links: gift_cards, contribution_groups,
contributions, payment_links, invoices, invoice_payments,
saved_payment_links, claim_payments, bill_splits

Revision ID: 0003_savings_paylinks
Revises: 0002_merchant_rental
Create Date: 2026-07-15
"""

from alembic import op

revision = "0003_savings_paylinks"
down_revision = "0002_merchant_rental"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── gift_cards ─────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE gift_card_status AS ENUM ('pending', 'redeemed', 'expired', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE gift_cards ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE gift_cards ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN sender_id TYPE uuid USING sender_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_cards_sender_id ON gift_cards (sender_id)")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN redeemed_by TYPE uuid USING redeemed_by::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gift_cards_redeemed_by ON gift_cards (redeemed_by)")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("UPDATE gift_cards SET currency = 'USD' WHERE currency = '$'")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE gift_cards ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE gift_cards ALTER COLUMN status TYPE gift_card_status USING status::gift_card_status"
    )
    op.execute("ALTER TABLE gift_cards ALTER COLUMN status SET DEFAULT 'pending'::gift_card_status")
    op.execute("""
        ALTER TABLE gift_cards ADD CONSTRAINT ck_gift_cards_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE gift_cards VALIDATE CONSTRAINT ck_gift_cards_amount_positive")

    # ─── contribution_groups ────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE contribution_category AS ENUM
                ('medical', 'education', 'event', 'emergency', 'community', 'other');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE contribution_groups ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN creator_id TYPE uuid USING creator_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contribution_groups_creator_id ON contribution_groups (creator_id)")
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN target_amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN current_amount TYPE numeric(14,2)")
    op.execute("UPDATE contribution_groups SET currency = 'USD' WHERE currency = '$'")
    op.execute("ALTER TABLE contribution_groups ALTER COLUMN currency TYPE char(3)")
    op.execute("""
        UPDATE contribution_groups SET category = 'other'
        WHERE category IS NULL
           OR category NOT IN ('medical', 'education', 'event', 'emergency', 'community', 'other')
    """)
    op.execute(
        "ALTER TABLE contribution_groups ALTER COLUMN category TYPE contribution_category "
        "USING category::contribution_category"
    )
    op.execute("ALTER TABLE contribution_groups ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE contribution_groups ADD CONSTRAINT ck_contribution_groups_current_nonneg
            CHECK (current_amount >= 0) NOT VALID
    """)
    op.execute("ALTER TABLE contribution_groups VALIDATE CONSTRAINT ck_contribution_groups_current_nonneg")

    # ─── contributions ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE contributions ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE contributions ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE contributions ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE contributions ALTER COLUMN group_id TYPE uuid USING group_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contributions_group_id ON contributions (group_id)")
    op.execute("ALTER TABLE contributions ALTER COLUMN contributor_id TYPE uuid USING contributor_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contributions_contributor_id ON contributions (contributor_id)")
    op.execute("ALTER TABLE contributions ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("""
        ALTER TABLE contributions ADD CONSTRAINT ck_contributions_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE contributions VALIDATE CONSTRAINT ck_contributions_amount_positive")

    # ─── payment_links ──────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE payment_link_type AS ENUM ('personal', 'business');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE payment_link_region AS ENUM ('local', 'international');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE payment_link_destination AS ENUM ('wallet', 'bank');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE link_type AS ENUM ('payment', 'invoice');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE payment_link_status AS ENUM
                ('pending', 'partial', 'paid', 'expired', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE payment_links ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE payment_links ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE payment_links ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE payment_links ALTER COLUMN sender_id TYPE uuid USING sender_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_links_sender_id ON payment_links (sender_id)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN amount_paid TYPE numeric(14,2)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN remaining_balance TYPE numeric(14,2)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN minimum_payment TYPE numeric(14,2)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE payment_links ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TABLE payment_links ALTER COLUMN type TYPE payment_link_type USING type::payment_link_type")
    op.execute("ALTER TABLE payment_links ALTER COLUMN type SET DEFAULT 'personal'::payment_link_type")
    op.execute("ALTER TABLE payment_links ALTER COLUMN region DROP DEFAULT")
    op.execute(
        "ALTER TABLE payment_links ALTER COLUMN region TYPE payment_link_region USING region::payment_link_region"
    )
    op.execute("ALTER TABLE payment_links ALTER COLUMN region SET DEFAULT 'local'::payment_link_region")
    op.execute("ALTER TABLE payment_links ALTER COLUMN destination DROP DEFAULT")
    op.execute(
        "ALTER TABLE payment_links ALTER COLUMN destination TYPE payment_link_destination "
        "USING destination::payment_link_destination"
    )
    op.execute("ALTER TABLE payment_links ALTER COLUMN destination SET DEFAULT 'wallet'::payment_link_destination")
    op.execute("ALTER TABLE payment_links ALTER COLUMN link_type DROP DEFAULT")
    op.execute("ALTER TABLE payment_links ALTER COLUMN link_type TYPE link_type USING link_type::link_type")
    op.execute("ALTER TABLE payment_links ALTER COLUMN link_type SET DEFAULT 'payment'::link_type")
    op.execute("""
        UPDATE payment_links SET status = 'pending'
        WHERE status IS NULL
           OR status NOT IN ('pending', 'partial', 'paid', 'expired', 'cancelled')
    """)
    op.execute("ALTER TABLE payment_links ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE payment_links ALTER COLUMN status TYPE payment_link_status USING status::payment_link_status"
    )
    op.execute("ALTER TABLE payment_links ALTER COLUMN status SET DEFAULT 'pending'::payment_link_status")
    op.execute("ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE payment_links ADD CONSTRAINT ck_payment_links_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE payment_links VALIDATE CONSTRAINT ck_payment_links_amount_positive")

    # ─── invoices ───────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE document_type AS ENUM ('invoice', 'receipt');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE invoices ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE invoices ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE invoices ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE invoices ALTER COLUMN payment_link_id TYPE uuid USING payment_link_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_payment_link_id ON invoices (payment_link_id)")
    op.execute("ALTER TABLE invoices ALTER COLUMN total_amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE invoices ALTER COLUMN type DROP DEFAULT")
    op.execute("ALTER TABLE invoices ALTER COLUMN type TYPE document_type USING type::document_type")
    op.execute("ALTER TABLE invoices ALTER COLUMN type SET DEFAULT 'invoice'::document_type")
    op.execute("""
        ALTER TABLE invoices ADD CONSTRAINT ck_invoices_total_positive
            CHECK (total_amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE invoices VALIDATE CONSTRAINT ck_invoices_total_positive")

    # ─── invoice_payments ───────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE invoice_payment_method AS ENUM ('card', 'wallet', 'stitch');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE invoice_payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE invoice_payments ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN payment_link_id TYPE uuid USING payment_link_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoice_payments_payment_link_id ON invoice_payments (payment_link_id)")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN payer_user_id TYPE uuid USING payer_user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoice_payments_payer_user_id ON invoice_payments (payer_user_id)")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN method DROP DEFAULT")
    op.execute(
        "ALTER TABLE invoice_payments ALTER COLUMN method TYPE invoice_payment_method "
        "USING method::invoice_payment_method"
    )
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN method SET DEFAULT 'card'::invoice_payment_method")
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE invoice_payments ALTER COLUMN status TYPE invoice_payment_status "
        "USING status::invoice_payment_status"
    )
    op.execute("ALTER TABLE invoice_payments ALTER COLUMN status SET DEFAULT 'pending'::invoice_payment_status")
    op.execute("""
        ALTER TABLE invoice_payments ADD CONSTRAINT ck_invoice_payments_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE invoice_payments VALIDATE CONSTRAINT ck_invoice_payments_amount_positive")

    # ─── saved_payment_links ────────────────────────────────────────────────
    op.execute("ALTER TABLE saved_payment_links ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE saved_payment_links ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE saved_payment_links ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE saved_payment_links ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_payment_links_user_id ON saved_payment_links (user_id)")
    op.execute("ALTER TABLE saved_payment_links ALTER COLUMN payment_link_id TYPE uuid USING payment_link_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_saved_payment_links_payment_link_id ON saved_payment_links (payment_link_id)")

    # ─── claim_payments ─────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE claim_payment_status AS ENUM ('pending', 'claimed', 'expired', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE claim_method AS ENUM ('wallet', 'bank', 'cash');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN CREATE TYPE pickup_status AS ENUM ('pending', 'collected', 'expired');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE claim_payments ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE claim_payments ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE claim_payments ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE claim_payments ALTER COLUMN sender_id TYPE uuid USING sender_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_claim_payments_sender_id ON claim_payments (sender_id)")
    op.execute("ALTER TABLE claim_payments ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE claim_payments ALTER COLUMN currency TYPE char(3)")
    op.execute("ALTER TABLE claim_payments ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE claim_payments ALTER COLUMN status TYPE claim_payment_status "
        "USING status::claim_payment_status"
    )
    op.execute("ALTER TABLE claim_payments ALTER COLUMN status SET DEFAULT 'pending'::claim_payment_status")
    op.execute(
        "ALTER TABLE claim_payments ALTER COLUMN claim_method TYPE claim_method "
        "USING NULLIF(claim_method, '')::claim_method"
    )
    op.execute("ALTER TABLE claim_payments ALTER COLUMN pickup_status DROP DEFAULT")
    op.execute(
        "ALTER TABLE claim_payments ALTER COLUMN pickup_status TYPE pickup_status "
        "USING pickup_status::pickup_status"
    )
    op.execute("ALTER TABLE claim_payments ALTER COLUMN pickup_status SET DEFAULT 'pending'::pickup_status")
    op.execute("ALTER TABLE claim_payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE claim_payments ADD CONSTRAINT ck_claim_payments_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE claim_payments VALIDATE CONSTRAINT ck_claim_payments_amount_positive")

    # ─── bill_splits ────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE bill_split_status AS ENUM ('pending', 'settled', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE bill_splits ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE bill_splits ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE bill_splits ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE bill_splits ALTER COLUMN creator_id TYPE uuid USING creator_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bill_splits_creator_id ON bill_splits (creator_id)")
    op.execute("ALTER TABLE bill_splits ALTER COLUMN total_amount TYPE numeric(14,2)")
    op.execute("ALTER TABLE bill_splits ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE bill_splits ALTER COLUMN status TYPE bill_split_status USING status::bill_split_status"
    )
    op.execute("ALTER TABLE bill_splits ALTER COLUMN status SET DEFAULT 'pending'::bill_split_status")
    op.execute("ALTER TABLE bill_splits ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE bill_splits ADD CONSTRAINT ck_bill_splits_total_amount_positive
            CHECK (total_amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE bill_splits VALIDATE CONSTRAINT ck_bill_splits_total_amount_positive")


def downgrade() -> None:
    drop_constraints = [
        ("bill_splits", "ck_bill_splits_total_amount_positive"),
        ("claim_payments", "ck_claim_payments_amount_positive"),
        ("invoice_payments", "ck_invoice_payments_amount_positive"),
        ("invoices", "ck_invoices_total_positive"),
        ("payment_links", "ck_payment_links_amount_positive"),
        ("contributions", "ck_contributions_amount_positive"),
        ("contribution_groups", "ck_contribution_groups_current_nonneg"),
        ("gift_cards", "ck_gift_cards_amount_positive"),
    ]
    for table, constraint in drop_constraints:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")

    for table, col in [
        ("bill_splits", "status"), ("claim_payments", "pickup_status"),
        ("claim_payments", "claim_method"), ("claim_payments", "status"),
        ("invoice_payments", "status"), ("invoice_payments", "method"),
        ("invoices", "type"), ("payment_links", "status"), ("payment_links", "link_type"),
        ("payment_links", "destination"), ("payment_links", "region"), ("payment_links", "type"),
        ("contribution_groups", "category"), ("gift_cards", "status"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE text USING {col}::text")

    for enum_type in [
        "bill_split_status", "pickup_status", "claim_method", "claim_payment_status",
        "invoice_payment_status", "invoice_payment_method", "document_type",
        "payment_link_status", "link_type", "payment_link_destination",
        "payment_link_region", "payment_link_type", "contribution_category", "gift_card_status",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_type}")
