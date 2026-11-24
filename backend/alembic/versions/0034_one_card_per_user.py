"""One card per customer with a switchable active wallet; funding wallet + FX
on each authorization; card disputes.

Existing customers with several live cards keep one: the card on their
country's default wallet (ZA→ZAR, BW→BWP, ZW→USD), otherwise the oldest.
The others are cancelled (production only ever had sandbox cards).

Revision ID: 0034_one_card
Revises: 0033_book_rail
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0034_one_card"
down_revision = "0033_book_rail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        WITH ranked AS (
            SELECT c.id,
                   row_number() OVER (
                       PARTITION BY c.user_id
                       ORDER BY (w.currency = CASE u.residence_country WHEN 'ZA' THEN 'ZAR' WHEN 'BW' THEN 'BWP'
                                                                         WHEN 'ZW' THEN 'USD' END) DESC NULLS LAST,
                                (c.status = 'active') DESC, c.created_at
                   ) AS rn
            FROM issued_cards c
            JOIN wallet_cards w ON w.id = c.wallet_card_id
            JOIN users u ON u.id = c.user_id
            WHERE c.status NOT IN ('cancelled', 'failed')
        )
        UPDATE issued_cards SET status = 'cancelled', cancelled_at = now(),
               failure_reason = 'Merged: one card per customer'
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    """)
    op.execute("DROP INDEX IF EXISTS uq_issued_cards_one_live_per_wallet")
    op.execute("CREATE UNIQUE INDEX uq_issued_cards_one_live_per_user ON issued_cards (user_id) "
               "WHERE status NOT IN ('cancelled','failed')")

    op.add_column("card_authorizations", sa.Column("wallet_card_id", postgresql.UUID(as_uuid=True),
                                                   sa.ForeignKey("wallet_cards.id", ondelete="RESTRICT"), nullable=True))
    op.add_column("card_authorizations", sa.Column("wallet_currency", sa.String(3), nullable=True))
    op.add_column("card_authorizations", sa.Column("wallet_amount", sa.Numeric(20, 2), nullable=True))
    op.add_column("card_authorizations", sa.Column("fx_rate", sa.Numeric(18, 8), nullable=True))
    op.add_column("card_authorizations", sa.Column("fx_spread", sa.Numeric(20, 2), nullable=True))
    # Until now holds were always in the billing currency of the card's own wallet.
    op.execute("""
        UPDATE card_authorizations a SET wallet_card_id = c.wallet_card_id, wallet_currency = a.currency,
               wallet_amount = a.held_amount + a.captured_amount
        FROM issued_cards c WHERE c.id = a.issued_card_id AND a.wallet_card_id IS NULL
    """)

    op.create_table(
        "card_disputes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("issued_card_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issued_cards.id", ondelete="RESTRICT"),
                  nullable=False),
        sa.Column("clearing_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("card_clearings.id", ondelete="RESTRICT"),
                  nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="opened"),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("issuer_dispute_id", sa.String(120), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("credit_entry_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("journal_entries.id", ondelete="RESTRICT"),
                  nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('opened','submitted','won','lost','withdrawn')", name="ck_card_disputes_status"),
        sa.UniqueConstraint("clearing_id", name="uq_card_disputes_clearing"),
    )
    op.create_index("ix_card_disputes_issued_card_id", "card_disputes", ["issued_card_id"])
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_index("ix_card_disputes_issued_card_id", table_name="card_disputes")
    op.drop_table("card_disputes")
    for col in ("fx_spread", "fx_rate", "wallet_amount", "wallet_currency", "wallet_card_id"):
        op.drop_column("card_authorizations", col)
    op.execute("DROP INDEX IF EXISTS uq_issued_cards_one_live_per_user")
    op.execute("CREATE UNIQUE INDEX uq_issued_cards_one_live_per_wallet ON issued_cards (wallet_card_id) "
               "WHERE status NOT IN ('cancelled','failed')")
