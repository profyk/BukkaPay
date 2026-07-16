"""Travel Booking inventory: travel_mode enum plus three admin-managed
tables — travel_operators, travel_routes (a fixed origin/destination for
a bus or flight operator), and travel_departures (a specific bookable
date/time/price/seat-count instance of a route). Mirrors the
Property/PropertyUnit "template vs instance" shape already used for
rentals. Also adds 'travel' to the purchase_category enum, since a booked
ticket is recorded as a PurchaseTransaction (category=travel) — the
existing "purchase hub" (BukkaPay-Expo's purchases-hub.tsx /
purchase-detail.tsx) already renders that category, no new ledger needed.

Seeds a handful of real-world operators/routes/departures (bus: Intercape,
Greyhound, FlixBus — already named in the mobile app's former "Coming
Soon" copy; flight: South African Airways, Kenya Airways, British Airways)
with departures dated relative to `now()` so they never look expired,
regardless of when this migration actually runs.

Revision ID: 0009_travel_booking
Revises: 0008_send_money_zones
Create Date: 2026-07-16
"""

from alembic import op

revision = "0009_travel_booking"
down_revision = "0008_send_money_zones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN CREATE TYPE travel_mode AS ENUM ('bus', 'flight');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)
    op.execute("ALTER TYPE purchase_category ADD VALUE IF NOT EXISTS 'travel'")

    op.execute("""
        CREATE TABLE IF NOT EXISTS travel_operators (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name text NOT NULL,
            mode travel_mode NOT NULL,
            logo_url text,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS travel_routes (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            operator_id uuid NOT NULL REFERENCES travel_operators (id) ON DELETE CASCADE,
            mode travel_mode NOT NULL,
            origin_code text NOT NULL,
            origin_city text NOT NULL,
            origin_country_code text NOT NULL,
            destination_code text NOT NULL,
            destination_city text NOT NULL,
            destination_country_code text NOT NULL,
            flight_number text,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_travel_routes_operator_id ON travel_routes (operator_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS travel_departures (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            route_id uuid NOT NULL REFERENCES travel_routes (id) ON DELETE CASCADE,
            departure_at timestamptz NOT NULL,
            arrival_at timestamptz NOT NULL,
            price numeric(14,2) NOT NULL,
            business_price numeric(14,2),
            currency char(3) NOT NULL DEFAULT 'ZAR',
            total_seats integer NOT NULL DEFAULT 40,
            seats_booked integer NOT NULL DEFAULT 0,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_travel_departures_price_positive CHECK (price > 0),
            CONSTRAINT ck_travel_departures_seats_within_capacity CHECK (seats_booked <= total_seats)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_travel_departures_route_id ON travel_departures (route_id)")

    # ─── seed operators ──────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO travel_operators (id, name, mode) VALUES
            ('11111111-1111-1111-1111-111111111101', 'Intercape', 'bus'),
            ('11111111-1111-1111-1111-111111111102', 'Greyhound', 'bus'),
            ('11111111-1111-1111-1111-111111111103', 'FlixBus', 'bus'),
            ('11111111-1111-1111-1111-111111111104', 'South African Airways', 'flight'),
            ('11111111-1111-1111-1111-111111111105', 'Kenya Airways', 'flight'),
            ('11111111-1111-1111-1111-111111111106', 'British Airways', 'flight')
        ON CONFLICT (id) DO NOTHING
    """)

    # ─── seed routes ─────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO travel_routes (
            id, operator_id, mode, origin_code, origin_city, origin_country_code,
            destination_code, destination_city, destination_country_code, flight_number
        ) VALUES
            ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'bus',
             'Johannesburg', 'Johannesburg', 'ZA', 'Cape Town', 'Cape Town', 'ZA', NULL),
            ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'bus',
             'Johannesburg', 'Johannesburg', 'ZA', 'Durban', 'Durban', 'ZA', NULL),
            ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102', 'bus',
             'Cape Town', 'Cape Town', 'ZA', 'Durban', 'Durban', 'ZA', NULL),
            ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111103', 'bus',
             'Cape Town', 'Cape Town', 'ZA', 'Johannesburg', 'Johannesburg', 'ZA', NULL),
            ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111104', 'flight',
             'JNB', 'Johannesburg', 'ZA', 'CPT', 'Cape Town', 'ZA', 'SA1234'),
            ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111104', 'flight',
             'JNB', 'Johannesburg', 'ZA', 'LHR', 'London', 'GB', 'SA231'),
            ('22222222-2222-2222-2222-222222222207', '11111111-1111-1111-1111-111111111105', 'flight',
             'NBO', 'Nairobi', 'KE', 'LOS', 'Lagos', 'NG', 'KQ532'),
            ('22222222-2222-2222-2222-222222222208', '11111111-1111-1111-1111-111111111106', 'flight',
             'LHR', 'London', 'GB', 'JNB', 'Johannesburg', 'ZA', 'BA056')
        ON CONFLICT (id) DO NOTHING
    """)

    # ─── seed departures (dated relative to now() so they never expire) ────
    op.execute("""
        INSERT INTO travel_departures (route_id, departure_at, arrival_at, price, business_price, currency, total_seats) VALUES
            ('22222222-2222-2222-2222-222222222201', now() + interval '3 days' + time '07:00', now() + interval '3 days' + time '16:30', 650.00, NULL, 'ZAR', 60),
            ('22222222-2222-2222-2222-222222222201', now() + interval '5 days' + time '20:00', now() + interval '6 days' + time '05:30', 650.00, NULL, 'ZAR', 60),
            ('22222222-2222-2222-2222-222222222202', now() + interval '4 days' + time '08:00', now() + interval '4 days' + time '16:00', 480.00, NULL, 'ZAR', 55),
            ('22222222-2222-2222-2222-222222222203', now() + interval '4 days' + time '09:00', now() + interval '4 days' + time '22:00', 550.00, NULL, 'ZAR', 55),
            ('22222222-2222-2222-2222-222222222204', now() + interval '6 days' + time '18:00', now() + interval '7 days' + time '03:30', 620.00, NULL, 'ZAR', 50),
            ('22222222-2222-2222-2222-222222222205', now() + interval '3 days' + time '09:15', now() + interval '3 days' + time '11:20', 1850.00, 4200.00, 'ZAR', 150),
            ('22222222-2222-2222-2222-222222222205', now() + interval '7 days' + time '14:40', now() + interval '7 days' + time '16:45', 1750.00, 3900.00, 'ZAR', 150),
            ('22222222-2222-2222-2222-222222222206', now() + interval '10 days' + time '19:30', now() + interval '11 days' + time '06:15', 12500.00, 38000.00, 'ZAR', 220),
            ('22222222-2222-2222-2222-222222222207', now() + interval '5 days' + time '11:00', now() + interval '5 days' + time '13:10', 185.00, 420.00, 'USD', 160),
            ('22222222-2222-2222-2222-222222222208', now() + interval '8 days' + time '21:00', now() + interval '9 days' + time '09:30', 780.00, 2600.00, 'GBP', 250)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS travel_departures")
    op.execute("DROP TABLE IF EXISTS travel_routes")
    op.execute("DROP TABLE IF EXISTS travel_operators")
    op.execute("DROP TYPE IF EXISTS travel_mode")
    # Note: Postgres has no ALTER TYPE ... DROP VALUE — 'travel' stays a
    # harmless unused member of purchase_category on downgrade, same
    # rationale as the new wallet_currency values in 0008.