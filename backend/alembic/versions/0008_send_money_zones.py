"""Unified Send Money: expands wallet_currency with 5 more real settlement
currencies (NGN, KES, GHS, EUR, GBP — alongside the existing USD/ZAR/BWP)
so the Africa/International destination pickers have real currencies
behind them, adds transfer_purpose/transfer_zone enums plus matching
nullable columns on transactions and international_transfers so every
send can be tagged with a category/sub-category and a destination
country/zone, and seeds CurrencyCorridor rows for every new currency pair
so admin has real numbers to tune from day one (same spirit as 0005's
SEED_CORRIDORS).

Revision ID: 0008_send_money_zones
Revises: 0007_retire_tag_ride
Create Date: 2026-07-16
"""

from alembic import op

revision = "0008_send_money_zones"
down_revision = "0007_retire_tag_ride"
branch_labels = None
depends_on = None

NEW_CURRENCIES = ["NGN", "KES", "GHS", "EUR", "GBP"]
ALL_CURRENCIES = ["USD", "ZAR", "BWP", *NEW_CURRENCIES]

# Approximate units of each currency per 1 USD — used only to compute a
# sensible starting cross-rate for every new corridor pair; admin tunes
# from here, same as every existing corridor.
USD_RATE = {
    "USD": 1.0,
    "ZAR": 18.2,
    "BWP": 13.5,
    "NGN": 1550.0,
    "KES": 129.0,
    "GHS": 15.5,
    "EUR": 0.92,
    "GBP": 0.79,
}


def upgrade() -> None:
    # ─── wallet_currency: add the 5 new settlement currencies ──────────────
    for currency in NEW_CURRENCIES:
        op.execute(f"ALTER TYPE wallet_currency ADD VALUE IF NOT EXISTS '{currency}'")

    # Postgres won't let a transaction use a brand-new enum value in the
    # same transaction that added it ("unsafe use of new value"). Commit
    # here so the corridor-seeding INSERTs below can use NGN/KES/GHS/EUR/GBP
    # immediately — safe because this migration runs alone in a single
    # `alembic upgrade head` transaction in the deploys that actually need
    # it (any earlier revision is already committed from a prior deploy).
    op.execute("COMMIT")

    # ─── transfer_purpose / transfer_zone enums ─────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE transfer_purpose AS ENUM (
                'family_friends', 'business', 'bills_rent', 'school_fees', 'medical', 'gift', 'other'
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE transfer_zone AS ENUM ('local', 'africa', 'international');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    # ─── transactions / international_transfers: purpose + destination ─────
    for table in ("transactions", "international_transfers"):
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS purpose_category transfer_purpose")
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS purpose_subcategory text")
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS destination_country_code text")
        op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS destination_zone transfer_zone")

    # ─── seed a corridor for every new currency pair ────────────────────────
    for from_cur in ALL_CURRENCIES:
        for to_cur in ALL_CURRENCIES:
            if from_cur == to_cur:
                continue
            rate = USD_RATE[to_cur] / USD_RATE[from_cur]
            op.execute(f"""
                INSERT INTO currency_corridors (from_currency, to_currency, exchange_rate, fee_percentage, fee_fixed)
                VALUES ('{from_cur}', '{to_cur}', {rate:.6f}, 1.0, 0)
                ON CONFLICT (from_currency, to_currency) DO NOTHING
            """)


def downgrade() -> None:
    new_currency_list = ",".join(f"'{c}'" for c in NEW_CURRENCIES)
    op.execute(f"""
        DELETE FROM currency_corridors
        WHERE from_currency::text = ANY(ARRAY[{new_currency_list}])
           OR to_currency::text = ANY(ARRAY[{new_currency_list}])
    """)
    for table in ("transactions", "international_transfers"):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS destination_zone")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS destination_country_code")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS purpose_subcategory")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS purpose_category")
    op.execute("DROP TYPE IF EXISTS transfer_zone")
    op.execute("DROP TYPE IF EXISTS transfer_purpose")
    # Note: Postgres has no ALTER TYPE ... DROP VALUE — removing NGN/KES/GHS/EUR/GBP
    # from wallet_currency on downgrade would require rebuilding the enum type,
    # which isn't safe to do blindly if any row already uses one of these
    # values. Left in place; a currency that's merely an unused enum member
    # is harmless.