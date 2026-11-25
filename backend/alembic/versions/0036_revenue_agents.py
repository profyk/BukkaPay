"""Revenue: admin pricing policy, the monthly account fee ledger, and the
cash agent network (agents and their cash-in / cash-out transactions).

Additive only: four new tables, nothing existing changes.

Revision ID: 0036_revenue_agents
Revises: 0035_payouts
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0036_revenue_agents"
down_revision = "0035_payouts"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "pricing_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_by", sa.Text()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "account_fee_charges",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("wallet_card_id", UUID, sa.ForeignKey("wallet_cards.id")),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("reason", sa.String(40)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_at", TS),
        sa.Column("journal_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("charged_at", TS),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('charged','due','waived')", name="ck_account_fee_charges_status"),
        sa.UniqueConstraint("user_id", "period", name="uq_account_fee_charges_user_period"),
    )
    op.create_index("ix_account_fee_charges_period_status", "account_fee_charges", ["period", "status"])

    op.create_table(
        "agents",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("merchant_id", UUID, sa.ForeignKey("merchants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("city", sa.String(60)),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("phone", sa.String(20)),
        sa.Column("opening_hours", sa.String(80)),
        sa.Column("latitude", sa.Numeric(9, 6)),
        sa.Column("longitude", sa.Numeric(9, 6)),
        sa.Column("daily_limit", sa.Numeric(20, 2), nullable=False, server_default="20000.00"),
        sa.Column("approved_at", TS),
        sa.Column("approved_by", sa.Text()),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','active','suspended')", name="ck_agents_status"),
        sa.UniqueConstraint("merchant_id", name="uq_agents_merchant"),
    )

    op.create_table(
        "agent_transactions",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reference", sa.String(24), nullable=False, unique=True),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("wallet_card_id", UUID, sa.ForeignKey("wallet_cards.id"), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("fee", sa.Numeric(20, 2), nullable=False, server_default="0.00"),
        sa.Column("commission", sa.Numeric(20, 2), nullable=False, server_default="0.00"),
        sa.Column("code_hash", sa.String(64)),
        sa.Column("expires_at", TS),
        sa.Column("hold_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("journal_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("served_by", UUID, sa.ForeignKey("users.id")),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", TS),
        sa.CheckConstraint("kind IN ('cash_in','cash_out')", name="ck_agent_tx_kind"),
        sa.CheckConstraint("status IN ('pending','completed','expired','cancelled')", name="ck_agent_tx_status"),
        sa.UniqueConstraint("code_hash", name="uq_agent_tx_code"),
    )
    op.create_index("ix_agent_tx_agent", "agent_transactions", ["agent_id", "created_at"])
    op.create_index("ix_agent_tx_user", "agent_transactions", ["user_id", "created_at"])
    op.create_index("ix_agent_tx_pending", "agent_transactions", ["status", "expires_at"])
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("agent_transactions")
    op.drop_table("agents")
    op.drop_table("account_fee_charges")
    op.drop_table("pricing_settings")
