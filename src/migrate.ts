import { Pool } from "pg";

export async function runCoreMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
  if (!dbUrl) return;
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
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

    const alterStmts = [
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12,2)`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS allow_partial_payment BOOLEAN DEFAULT false`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS minimum_payment DECIMAL(12,2)`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS sub_region TEXT`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS bank_details JSONB`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS business_name TEXT`,
      `ALTER TABLE IF EXISTS payment_links ADD COLUMN IF NOT EXISTS business_logo TEXT`,
      `ALTER TABLE IF EXISTS invoices ADD COLUMN IF NOT EXISTS attachment JSONB`,
    ];
    for (const stmt of alterStmts) {
      try { await pool.query(stmt); } catch (_) {}
    }
    await pool.query(`UPDATE payment_links SET remaining_balance = amount WHERE remaining_balance IS NULL`);

    console.log("[db] Core tables ensured");
  } finally {
    await pool.end();
  }
}
