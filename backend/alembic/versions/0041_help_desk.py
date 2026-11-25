"""Help desk: support tickets and their messages.

Additive only: two new tables.

Revision ID: 0041_help_desk
Revises: 0040_settlement_pool
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0041_help_desk"
down_revision = "0040_settlement_pool"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("reference", sa.String(12), nullable=False, unique=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("requester_email", sa.Text()),
        sa.Column("requester_name", sa.Text()),
        sa.Column("channel", sa.String(8), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        sa.Column("priority", sa.String(8), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(18), nullable=False, server_default="open"),
        sa.Column("assigned_admin_id", UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("first_response_at", TS),
        sa.Column("last_customer_at", TS),
        sa.Column("last_agent_at", TS),
        sa.Column("resolved_at", TS),
        sa.Column("closed_at", TS),
        sa.Column("csat_rating", sa.Integer()),
        sa.Column("csat_comment", sa.Text()),
        sa.Column("rating_token", sa.String(64), unique=True),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('open','waiting_customer','resolved','closed')", name="ck_support_tickets_status"),
        sa.CheckConstraint("priority IN ('low','normal','high','urgent')", name="ck_support_tickets_priority"),
        sa.CheckConstraint("csat_rating IS NULL OR csat_rating BETWEEN 1 AND 5", name="ck_support_tickets_csat"),
    )
    op.create_index("ix_support_tickets_status", "support_tickets", ["status", "updated_at"])
    op.create_index("ix_support_tickets_user", "support_tickets", ["user_id", "created_at"])
    op.create_table(
        "support_ticket_messages",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ticket_id", UUID, sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author", sa.String(10), nullable=False),
        sa.Column("admin_id", UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("internal", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("via", sa.String(8), nullable=False),
        sa.Column("email_message_id", sa.Text()),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("delivered_at", TS),
    )
    op.create_index("ix_support_ticket_messages_ticket_id", "support_ticket_messages", ["ticket_id"])
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("support_ticket_messages")
    op.drop_table("support_tickets")
