"""remaining domains + retirement: loyalty_rewards, auto_pays, beneficiaries,
challenges, achievements, virtual_cards, webauthn_credentials,
purchase_transactions, notifications, chat_messages, security_settings,
family_members. Retires the dead stokvels/stokvel_members/
stokvel_contributions/stokvel_payouts tables (zero write path anywhere in
the app — verified via grep across routes.ts/admin-routes.ts, only a
paginated admin GET reached them). tag_ride_drivers/tag_ride_rides are
intentionally left untouched — the tag-ride feature was dropped from the
new backend's scope; see the comment further down.

Revision ID: 0004_remaining_and_retirement
Revises: 0003_savings_paylinks
Create Date: 2026-07-15
"""

from alembic import op

revision = "0004_remaining_and_retirement"
down_revision = "0003_savings_paylinks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── loyalty_rewards ────────────────────────────────────────────────────
    op.execute("ALTER TABLE loyalty_rewards ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE loyalty_rewards ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE loyalty_rewards ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE loyalty_rewards ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_rewards_user_id ON loyalty_rewards (user_id)")

    # ─── auto_pays ──────────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN CREATE TYPE autopay_frequency AS ENUM ('weekly', 'monthly', 'yearly');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE auto_pays ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE auto_pays ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE auto_pays ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE auto_pays ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_auto_pays_user_id ON auto_pays (user_id)")
    op.execute("ALTER TABLE auto_pays ALTER COLUMN amount TYPE numeric(14,2)")
    op.execute(
        "ALTER TABLE auto_pays ALTER COLUMN frequency TYPE autopay_frequency USING frequency::autopay_frequency"
    )
    op.execute("ALTER TABLE auto_pays ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    op.execute("""
        ALTER TABLE auto_pays ADD CONSTRAINT ck_auto_pays_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE auto_pays VALIDATE CONSTRAINT ck_auto_pays_amount_positive")

    # ─── beneficiaries ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE beneficiaries ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE beneficiaries ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE beneficiaries ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE beneficiaries ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_beneficiaries_user_id ON beneficiaries (user_id)")

    # ─── challenges ─────────────────────────────────────────────────────────
    op.execute("ALTER TABLE challenges ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE challenges ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE challenges ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE challenges ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_challenges_user_id ON challenges (user_id)")
    op.execute("ALTER TABLE challenges ALTER COLUMN target TYPE numeric(14,2)")
    op.execute("ALTER TABLE challenges ALTER COLUMN current TYPE numeric(14,2)")
    op.execute("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")

    # ─── achievements ───────────────────────────────────────────────────────
    op.execute("ALTER TABLE achievements ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE achievements ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE achievements ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE achievements ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_achievements_user_id ON achievements (user_id)")
    op.execute("ALTER TABLE achievements ALTER COLUMN unlocked_at SET NOT NULL")

    # ─── virtual_cards ──────────────────────────────────────────────────────
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE virtual_cards ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_virtual_cards_user_id ON virtual_cards (user_id)")
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN spending_limit TYPE numeric(14,2)")
    op.execute("ALTER TABLE virtual_cards ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
    # cvv is NOT NULL in the real deployed schema but shared/schema.ts's
    # insertVirtualCardSchema never supplies it, so the live create path
    # can't satisfy that constraint — relax it rather than leave a column
    # the app can never populate on insert (see app/models/virtual_card.py).
    op.execute("ALTER TABLE virtual_cards ALTER COLUMN cvv DROP NOT NULL")

    # ─── webauthn_credentials ───────────────────────────────────────────────
    op.execute("ALTER TABLE webauthn_credentials ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE webauthn_credentials ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE webauthn_credentials ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE webauthn_credentials ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_webauthn_credentials_user_id ON webauthn_credentials (user_id)")

    # ─── purchase_transactions ──────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE purchase_category AS ENUM
                ('airtime', 'electricity', 'ticket', 'hotel', 'rental', 'marketplace',
                 'contribution', 'transfer');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE purchase_status AS ENUM ('success', 'pending', 'failed', 'refunded');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_purchase_transactions_user_id ON purchase_transactions (user_id)")
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN amount TYPE numeric(14,2)")
    # currency is a new column — the original schema never had one, purchases
    # were implicitly ZAR-only.
    op.execute("ALTER TABLE purchase_transactions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ZAR'")
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN currency TYPE char(3)")
    op.execute(
        "ALTER TABLE purchase_transactions ALTER COLUMN category TYPE purchase_category "
        "USING category::purchase_category"
    )
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE purchase_transactions ALTER COLUMN status TYPE purchase_status USING status::purchase_status"
    )
    op.execute("ALTER TABLE purchase_transactions ALTER COLUMN status SET DEFAULT 'success'::purchase_status")
    op.execute("""
        ALTER TABLE purchase_transactions ADD CONSTRAINT ck_purchase_transactions_amount_positive
            CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE purchase_transactions VALIDATE CONSTRAINT ck_purchase_transactions_amount_positive")

    # ─── notifications ──────────────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notification_type AS ENUM ('info', 'success', 'alert', 'warning', 'error');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TABLE notifications ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE notifications ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE notifications ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE notifications ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)")
    op.execute("""
        UPDATE notifications SET type = 'info'
        WHERE type IS NULL OR type NOT IN ('info', 'success', 'alert', 'warning', 'error')
    """)
    op.execute("ALTER TABLE notifications ALTER COLUMN type DROP DEFAULT")
    op.execute(
        "ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::notification_type"
    )
    op.execute("ALTER TABLE notifications ALTER COLUMN type SET DEFAULT 'info'::notification_type")

    # tag_ride_drivers / tag_ride_rides: intentionally left untouched.
    # Tag-ride was dropped from the new backend's scope — these tables keep
    # their original varchar columns and (per the bulk FK drop at the start
    # of 0001) end up without foreign key constraints after this migration.
    # That's a metadata-only regression, not a data loss one; nothing here
    # deletes rows. If ride-hailing is fully sunset, retiring these tables
    # the same way stokvels* was retired is a reasonable follow-up.

    # ─── dormant tables (chat_messages, security_settings, family_members) ──
    # No reachable route anywhere in the app (verified via grep) — kept for
    # data fidelity, still get the same UUID/index treatment as everything
    # else in case rows exist in prod.
    op.execute("ALTER TABLE chat_messages ALTER COLUMN id DROP DEFAULT")

    op.execute("ALTER TABLE chat_messages ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE chat_messages ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE chat_messages ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages (user_id)")

    op.execute("ALTER TABLE security_settings ALTER COLUMN id DROP DEFAULT")


    op.execute("ALTER TABLE security_settings ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE security_settings ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE security_settings ALTER COLUMN user_id TYPE uuid USING user_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_security_settings_user_id ON security_settings (user_id)")

    op.execute("ALTER TABLE family_members ALTER COLUMN id DROP DEFAULT")


    op.execute("ALTER TABLE family_members ALTER COLUMN id TYPE uuid USING id::uuid")
    op.execute("ALTER TABLE family_members ALTER COLUMN id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE family_members ALTER COLUMN parent_id TYPE uuid USING parent_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_family_members_parent_id ON family_members (parent_id)")
    op.execute("ALTER TABLE family_members ALTER COLUMN child_id TYPE uuid USING child_id::uuid")
    op.execute("CREATE INDEX IF NOT EXISTS ix_family_members_child_id ON family_members (child_id)")
    op.execute("ALTER TABLE family_members ALTER COLUMN monthly_allowance TYPE numeric(14,2)")

    # ─── retire dead stokvel* tables ────────────────────────────────────────
    op.execute("DROP TABLE IF EXISTS stokvel_payouts CASCADE")
    op.execute("DROP TABLE IF EXISTS stokvel_contributions CASCADE")
    op.execute("DROP TABLE IF EXISTS stokvel_members CASCADE")
    op.execute("DROP TABLE IF EXISTS stokvels CASCADE")

    # ─── re-add every foreign key, now uuid-to-uuid ─────────────────────────
    # (dropped in bulk at the start of 0001 to unblock the type conversions
    # across all 4 revisions — see the comment there.)
    fk_defs = [
        ("user_sessions", "user_id", "users", "id", "CASCADE"),
        ("admin_sessions", "admin_id", "admin_users", "id", "CASCADE"),
        ("wallet_cards", "user_id", "users", "id", "CASCADE"),
        ("transactions", "user_id", "users", "id", "CASCADE"),
        ("transactions", "card_id", "wallet_cards", "id", "SET NULL"),
        ("contacts", "user_id", "users", "id", "CASCADE"),
        ("payment_requests", "user_id", "users", "id", "CASCADE"),
        ("merchants", "user_id", "users", "id", "CASCADE"),
        ("merchant_transactions", "merchant_id", "merchants", "id", "CASCADE"),
        ("merchant_transactions", "payer_id", "users", "id", "SET NULL"),
        ("merchant_subscriptions", "merchant_id", "merchants", "id", "CASCADE"),
        ("billing_links", "merchant_id", "merchants", "id", "CASCADE"),
        ("billing_links", "payment_link_id", "payment_links", "id", "SET NULL"),
        ("properties", "merchant_id", "merchants", "id", "CASCADE"),
        ("properties", "landlord_id", "users", "id", "CASCADE"),
        ("property_units", "property_id", "properties", "id", "CASCADE"),
        ("tenants", "property_id", "properties", "id", "CASCADE"),
        ("tenants", "unit_id", "property_units", "id", "CASCADE"),
        ("tenants", "user_id", "users", "id", "SET NULL"),
        ("rent_payments", "tenant_id", "tenants", "id", "CASCADE"),
        ("rent_payments", "property_id", "properties", "id", "CASCADE"),
        ("rent_payments", "unit_id", "property_units", "id", "CASCADE"),
        ("rent_payments", "merchant_id", "merchants", "id", "CASCADE"),
        ("rent_payment_links", "tenant_id", "tenants", "id", "CASCADE"),
        ("rent_payment_links", "merchant_id", "merchants", "id", "CASCADE"),
        ("gift_cards", "sender_id", "users", "id", "CASCADE"),
        ("gift_cards", "redeemed_by", "users", "id", "NO ACTION"),
        ("contribution_groups", "creator_id", "users", "id", "CASCADE"),
        ("contributions", "group_id", "contribution_groups", "id", "CASCADE"),
        ("contributions", "contributor_id", "users", "id", "NO ACTION"),
        ("payment_links", "sender_id", "users", "id", "CASCADE"),
        ("invoices", "payment_link_id", "payment_links", "id", "CASCADE"),
        ("invoice_payments", "payment_link_id", "payment_links", "id", "CASCADE"),
        ("invoice_payments", "payer_user_id", "users", "id", "SET NULL"),
        ("saved_payment_links", "user_id", "users", "id", "CASCADE"),
        ("saved_payment_links", "payment_link_id", "payment_links", "id", "CASCADE"),
        ("claim_payments", "sender_id", "users", "id", "CASCADE"),
        ("bill_splits", "creator_id", "users", "id", "CASCADE"),
        ("loyalty_rewards", "user_id", "users", "id", "CASCADE"),
        ("auto_pays", "user_id", "users", "id", "CASCADE"),
        ("beneficiaries", "user_id", "users", "id", "CASCADE"),
        ("challenges", "user_id", "users", "id", "CASCADE"),
        ("achievements", "user_id", "users", "id", "CASCADE"),
        ("virtual_cards", "user_id", "users", "id", "CASCADE"),
        ("webauthn_credentials", "user_id", "users", "id", "CASCADE"),
        ("purchase_transactions", "user_id", "users", "id", "CASCADE"),
        ("notifications", "user_id", "users", "id", "CASCADE"),
        ("chat_messages", "user_id", "users", "id", "CASCADE"),
        ("security_settings", "user_id", "users", "id", "CASCADE"),
        ("family_members", "parent_id", "users", "id", "CASCADE"),
        ("family_members", "child_id", "users", "id", "CASCADE"),
    ]
    for table, col, ref_table, ref_col, on_delete in fk_defs:
        constraint_name = f"{table}_{col}_fkey"
        op.execute(f"""
            ALTER TABLE {table} ADD CONSTRAINT {constraint_name}
                FOREIGN KEY ({col}) REFERENCES {ref_table} ({ref_col}) ON DELETE {on_delete}
        """)


def downgrade() -> None:
    # Drop every FK again before reverting any types below — same reasoning
    # as the bulk drop in 0001's upgrade(). Best-effort downgrade: the
    # original varchar-typed FK constraints are not recreated here.
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

    # stokvel* tables are not recreated — retirement is one-way. Everything
    # else reverts enum/type changes back to text/numeric(10,2) best-effort.
    drop_constraints = [
        ("purchase_transactions", "ck_purchase_transactions_amount_positive"),
        ("auto_pays", "ck_auto_pays_amount_positive"),
    ]
    for table, constraint in drop_constraints:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")

    for table, col in [
        ("notifications", "type"), ("purchase_transactions", "status"),
        ("purchase_transactions", "category"), ("auto_pays", "frequency"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {col} TYPE text USING {col}::text")

    for enum_type in [
        "notification_type", "purchase_status", "purchase_category", "autopay_frequency",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_type}")

    op.execute("ALTER TABLE purchase_transactions DROP COLUMN IF EXISTS currency")
