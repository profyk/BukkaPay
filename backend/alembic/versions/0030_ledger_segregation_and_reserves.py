"""Strict account segregation, the SYS_* chart of accounts, and custodian
balance snapshots for proof of reserve.

- ledger_accounts.category: customer (wallet:*), merchant (merchant:*) or
  system; enforced by check constraints tied to the account code.
- ledger_accounts.system_code: SYS_* name per currency (app.ledger.chart).
  Existing accounts that already do that job get the name; the rest are
  created for ZAR, USD and BWP.
- custodian_balance_snapshots: what each safeguarding bank/custodian reports.
- AfCFTA trade: trade_invoices (+ items), escrow_contracts, append-only
  escrow_events and hash-chained trade_receipts.

Revision ID: 0030_ledger_segregation
Revises: 0029_more_admin_roles
Create Date: 2026-11-22
"""

import re

from alembic import op

from app.db import rls, trade_guard
from app.ledger.chart import LAUNCH_CURRENCIES, SYSTEM_ACCOUNTS

revision = "0030_ledger_segregation"
down_revision = "0029_more_admin_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE ledger_accounts ADD COLUMN category VARCHAR(10) NOT NULL DEFAULT 'system'")
    op.execute("ALTER TABLE ledger_accounts ADD COLUMN system_code VARCHAR(64) UNIQUE")
    op.execute("UPDATE ledger_accounts SET category = 'customer' WHERE code LIKE 'wallet:%'")
    op.execute("UPDATE ledger_accounts SET category = 'merchant' WHERE code LIKE 'merchant:%'")
    op.execute("ALTER TABLE ledger_accounts ADD CONSTRAINT ck_ledger_accounts_category "
               "CHECK (category IN ('customer','merchant','system'))")
    op.execute("ALTER TABLE ledger_accounts ADD CONSTRAINT ck_ledger_accounts_category_code "
               "CHECK ((category = 'customer') = (code LIKE 'wallet:%') "
               "AND (category = 'merchant') = (code LIKE 'merchant:%'))")
    op.execute("ALTER TABLE ledger_accounts ADD CONSTRAINT ck_ledger_accounts_system_code "
               "CHECK (system_code IS NULL OR category = 'system')")

    for a in SYSTEM_ACCOUNTS:
        prefix = a.code.split("{ccy}")[0]
        pattern = "^" + re.escape(prefix) + "[A-Z]{3}$"
        op.execute(f"UPDATE ledger_accounts SET system_code = '{a.name}_' || right(code, 3) "
                   f"WHERE code ~ '{pattern}'")
        for ccy in LAUNCH_CURRENCIES:
            code = a.code.format(ccy=ccy)
            name = f"{a.title} ({ccy})".replace("'", "''")
            op.execute(f"""
                INSERT INTO ledger_accounts (id, code, name, type, currency, allow_negative, category, system_code,
                                             balance, version, created_at)
                VALUES (gen_random_uuid(), '{code}', '{name}', '{a.type}', '{ccy}', {str(a.allow_negative).lower()},
                        'system', '{a.name}_{ccy}', 0, 0, now())
                ON CONFLICT (code) DO NOTHING
            """)

    op.execute("""
        CREATE TABLE custodian_balance_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            custodian_id UUID NOT NULL REFERENCES custodians(id) ON DELETE RESTRICT,
            currency VARCHAR(3) NOT NULL,
            balance NUMERIC(20, 2) NOT NULL,
            as_of TIMESTAMP WITH TIME ZONE NOT NULL,
            source VARCHAR(20) NOT NULL,
            reference TEXT,
            recorded_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT ck_custodian_snapshots_nonneg CHECK (balance >= 0)
        )
    """)
    op.execute("CREATE INDEX ix_custodian_balance_snapshots_custodian_id ON custodian_balance_snapshots (custodian_id)")

    # ─── AfCFTA trade: invoices, escrow, receipts (built from the models so
    # the migration and the ORM can't drift).
    from sqlalchemy.schema import CreateIndex, CreateTable

    from app.models import trade

    bind = op.get_bind()
    for model in (trade.TradeInvoice, trade.TradeInvoiceItem, trade.EscrowContract, trade.EscrowEvent,
                  trade.TradeReceipt):
        op.execute(CreateTable(model.__table__).compile(dialect=bind.dialect).string)
        for index in model.__table__.indexes:
            op.execute(CreateIndex(index).compile(dialect=bind.dialect).string)
    for stmt in trade_guard.TRIGGERS:
        op.execute(stmt)
    op.execute(rls.ENABLE)


def downgrade() -> None:
    for t in ("trade_receipts", "escrow_events", "escrow_contracts", "trade_invoice_items", "trade_invoices"):
        op.execute(f"DROP TABLE {t}")
    op.execute("DROP TABLE custodian_balance_snapshots")
    op.execute("ALTER TABLE ledger_accounts DROP CONSTRAINT ck_ledger_accounts_system_code")
    op.execute("ALTER TABLE ledger_accounts DROP CONSTRAINT ck_ledger_accounts_category_code")
    op.execute("ALTER TABLE ledger_accounts DROP CONSTRAINT ck_ledger_accounts_category")
    op.execute("ALTER TABLE ledger_accounts DROP COLUMN system_code")
    op.execute("ALTER TABLE ledger_accounts DROP COLUMN category")
