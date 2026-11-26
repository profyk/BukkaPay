"""Board / investor portal: members, sessions, access log, monthly management
accounts and investor updates. Additive only.

Revision ID: 0044_board_portal
Revises: 0043_organisation
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0044_board_portal"
down_revision = "0043_organisation"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)
AMT = sa.Numeric(16, 2)


def _id():
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _created():
    return sa.Column("created_at", TS, nullable=False, server_default=sa.func.now())


def _admin(name):
    return sa.Column(name, UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"))


def upgrade() -> None:
    op.create_table(
        "board_members", _id(),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("organisation", sa.String(160)),
        sa.Column("title", sa.String(120)),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _admin("invited_by"),
        sa.Column("invite_token_hash", sa.String(64), unique=True),
        sa.Column("invite_expires_at", TS),
        sa.Column("accepted_at", TS),
        sa.Column("login_code_hash", sa.String(64)),
        sa.Column("login_code_expires_at", TS),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", TS),
        sa.Column("last_login_at", TS),
        _created(),
    )
    op.create_table(
        "board_sessions", _id(),
        sa.Column("member_id", UUID, sa.ForeignKey("board_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("revoked_at", TS),
        sa.Column("ip", sa.String(64)),
        _created(),
    )
    op.create_table(
        "board_access_log", _id(),
        sa.Column("member_id", UUID, sa.ForeignKey("board_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("ip", sa.String(64)),
        _created(),
    )
    op.create_index("ix_board_access_log_created", "board_access_log", ["created_at"])
    op.create_table(
        "board_financials", _id(),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        *[sa.Column(c, AMT, nullable=False, server_default="0") for c in (
            "staff_costs", "technology_costs", "marketing_costs", "compliance_legal_costs", "office_admin_costs",
            "other_costs", "other_income", "funding_raised")],
        sa.Column("cash_balance", AMT),
        sa.Column("headcount", sa.Integer()),
        sa.Column("notes", sa.Text()),
        _admin("updated_by"),
        _created(),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("month", name="uq_board_financials_month"),
    )
    op.create_table(
        "board_updates", _id(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("period", sa.String(60)),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("published_at", TS),
        _admin("author_id"),
        _created(),
    )
    op.execute(rls.ENABLE)


def downgrade() -> None:
    for t in ("board_updates", "board_financials", "board_access_log", "board_sessions", "board_members"):
        op.drop_table(t)
