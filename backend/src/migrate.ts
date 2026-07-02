import { Pool } from "pg";

export async function runCoreMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
  if (!dbUrl) return;
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  // Admin tables run first in their own block so they always exist
  // even if later migrations fail (e.g. foreign-key ordering issues).
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token VARCHAR(64) PRIMARY KEY,
        admin_id VARCHAR NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[db] Admin tables ensured");
  } catch (e: any) {
    console.error("[db] Admin table migration failed:", e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        description TEXT,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        remaining_balance DECIMAL(12,2),
        allow_partial_payment BOOLEAN DEFAULT false,
        minimum_payment DECIMAL(12,2),
        type TEXT NOT NULL DEFAULT 'personal',
        region TEXT NOT NULL DEFAULT 'local',
        sub_region TEXT,
        destination TEXT NOT NULL DEFAULT 'wallet',
        bank_details JSONB,
        business_name TEXT,
        business_logo TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        payment_link_id VARCHAR NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
        customer_name TEXT NOT NULL,
        customer_email TEXT,
        customer_phone TEXT,
        items JSONB NOT NULL DEFAULT '[]',
        total_amount DECIMAL(12,2) NOT NULL,
        type TEXT NOT NULL DEFAULT 'invoice',
        due_date TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        payment_link_id VARCHAR NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        method TEXT NOT NULL DEFAULT 'card',
        payer_name TEXT,
        payer_email TEXT,
        payer_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        gateway TEXT,
        gateway_ref TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_payment_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payment_link_id VARCHAR NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token VARCHAR(64) PRIMARY KEY,
        admin_id VARCHAR NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT false,
        related_id VARCHAR,
        related_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // New tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        merchant_id VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'active',
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        merchant_id VARCHAR NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        payment_link_id VARCHAR REFERENCES payment_links(id) ON DELETE SET NULL,
        biller_name TEXT NOT NULL,
        bill_type TEXT NOT NULL DEFAULT 'other',
        description TEXT,
        amount DECIMAL(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ZAR',
        account_number TEXT,
        billing_period TEXT,
        due_date TIMESTAMPTZ,
        attachments JSONB DEFAULT '[]',
        recipients JSONB DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        total_collected DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const alterStmts = [
      `ALTER TABLE IF EXISTS wallet_cards ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE IF EXISTS wallet_cards ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12,2)`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS allow_partial_payment BOOLEAN DEFAULT false`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS minimum_payment DECIMAL(12,2)`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS sub_region TEXT`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS bank_details JSONB`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS business_name TEXT`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS business_logo TEXT`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS attachments JSONB`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'payment'`,
      `ALTER TABLE IF EXISTS invoices ADD COLUMN IF NOT EXISTS attachment JSONB`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS business_logo TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS business_email TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS business_phone TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS business_address TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS business_reg_number TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS vat_number TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS website TEXT`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'starter'`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active'`,
      `ALTER TABLE IF EXISTS merchants ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`,
    ];
    for (const stmt of alterStmts) {
      try { await pool.query(stmt); } catch (_) {}
    }
    await pool.query(`UPDATE payment_links SET remaining_balance = amount WHERE remaining_balance IS NULL`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tag_ride_drivers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        vehicle_number TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'taxi',
        is_active BOOLEAN DEFAULT true,
        total_earnings DECIMAL(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tag_ride_rides (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
        passenger_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        driver_id VARCHAR NOT NULL REFERENCES tag_ride_drivers(id) ON DELETE CASCADE,
        passenger_card_id VARCHAR REFERENCES wallet_cards(id) ON DELETE SET NULL,
        driver_card_id VARCHAR REFERENCES wallet_cards(id) ON DELETE SET NULL,
        amount DECIMAL(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        reference TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log("[db] Core tables ensured");
  } finally {
    await pool.end();
  }
}
