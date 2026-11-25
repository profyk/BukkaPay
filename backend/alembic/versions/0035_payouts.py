"""Cross-border payouts to bank accounts and mobile wallets: saved recipients
and payouts (amounts in integer minor units).

Revision ID: 0035_payouts
Revises: 0034_one_card
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0035_payouts"
down_revision = "0034_one_card"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "payout_recipients",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("nickname", sa.String(60)),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("method", sa.String(14), nullable=False),
        sa.Column("first_name", sa.String(80), nullable=False),
        sa.Column("last_name", sa.String(80), nullable=False),
        sa.Column("bank_code", sa.String(20)),
        sa.Column("bank_name", sa.String(80)),
        sa.Column("branch_code", sa.String(20)),
        sa.Column("account_number", sa.String(34)),
        sa.Column("msisdn", sa.String(16)),
        sa.Column("operator", sa.String(40)),
        sa.Column("extra", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("method IN ('bank','mobile_wallet')", name="ck_payout_recipients_method"),
    )
    op.create_index("ix_payout_recipients_user", "payout_recipients", ["user_id", "deleted_at"])

    op.create_table(
        "payouts",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reference", sa.String(24), nullable=False, unique=True),
        sa.Column("idempotency_key", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_wallet_id", UUID, sa.ForeignKey("wallet_cards.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recipient_id", UUID, sa.ForeignKey("payout_recipients.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("rail", sa.String(20), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="quoted"),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("method", sa.String(14), nullable=False),
        sa.Column("send_currency", sa.String(3), nullable=False),
        sa.Column("send_amount", sa.BigInteger(), nullable=False),
        sa.Column("fee_amount", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("receive_currency", sa.String(3), nullable=False),
        sa.Column("receive_amount", sa.BigInteger(), nullable=False),
        sa.Column("fx_rate", sa.Numeric(18, 8)),
        sa.Column("fx_spread_amount", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("quote_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider_reference", sa.String(120)),
        sa.Column("failure_reason", sa.Text()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("debit_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("settle_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("reverse_entry_id", UUID, sa.ForeignKey("journal_entries.id")),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("purpose", sa.String(40)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('quoted','confirmed','submitted','processing','paid','failed','returned','reversed',"
            "'expired','cancelled')", name="ck_payouts_status"),
        sa.CheckConstraint("send_amount > 0 AND receive_amount > 0 AND fee_amount >= 0 AND fx_spread_amount >= 0",
                           name="ck_payouts_amounts"),
    )
    op.create_index("ix_payouts_user", "payouts", ["user_id", "created_at"])
    op.create_index("ix_payouts_status", "payouts", ["status", "updated_at"])
    op.execute("CREATE UNIQUE INDEX uq_payouts_provider_ref ON payouts (rail, provider_reference) "
               "WHERE provider_reference IS NOT NULL")
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("payouts")
    op.drop_table("payout_recipients")
