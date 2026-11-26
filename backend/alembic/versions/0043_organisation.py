"""Organisation: departments, staff profiles (department, title, manager,
phone, start date, country scope) and four new roles.

Additive only. Seeds the standard departments.

Revision ID: 0043_organisation
Revises: 0042_spending_limits
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0043_organisation"
down_revision = "0042_spending_limits"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)

DEPARTMENTS = [
    ("executive", "Executive", "Owner, CEO and leadership: strategy, approvals and accountability."),
    ("finance", "Finance & Treasury", "Fees and pricing, FX, settlement, safeguarding, reconciliation and the ledger."),
    ("compliance", "Compliance & Risk", "KYC/KYB, AML monitoring, sanctions screening, fraud and regulatory reporting."),
    ("support", "Customer Support", "The help desk: chat, email and phone for customers and businesses."),
    ("merchant_ops", "Merchant & Agent Operations", "Onboarding and supporting businesses and cash agents."),
    ("country_ops", "Country Operations", "Launching and running each country: partners, providers and local teams."),
    ("technology", "Technology", "The platform, security, integrations and incident response."),
    ("marketing", "Marketing & Growth", "Brand, website, campaigns and customer communications."),
    ("legal", "Legal", "Terms, privacy, licensing and contracts."),
    ("people", "People & Admin", "Hiring, staff records, access reviews and office operations."),
]
NEW_ROLES = ("country_manager", "people_manager", "legal_counsel", "data_analyst")


def upgrade() -> None:
    for role in NEW_ROLES:
        op.execute(f"ALTER TYPE admin_role ADD VALUE IF NOT EXISTS '{role}'")
    op.create_table(
        "departments",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(30), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("email", sa.String(120)),
        sa.Column("head_admin_id", UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL")),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
    )
    op.add_column("admin_users", sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL")))
    op.add_column("admin_users", sa.Column("title", sa.String(100)))
    op.add_column("admin_users", sa.Column("manager_id", UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL")))
    op.add_column("admin_users", sa.Column("phone", sa.String(30)))
    op.add_column("admin_users", sa.Column("started_on", sa.Date()))
    op.add_column("admin_users", sa.Column("country_scope", postgresql.JSONB(), nullable=False,
                                           server_default=sa.text("'[]'::jsonb")))
    for code, name, desc in DEPARTMENTS:
        op.execute(sa.text("INSERT INTO departments (code, name, description) VALUES (:c, :n, :d) "
                           "ON CONFLICT (code) DO NOTHING").bindparams(c=code, n=name, d=desc))
    # The owner sits in Executive.
    op.execute("UPDATE admin_users SET department_id = (SELECT id FROM departments WHERE code = 'executive') "
               "WHERE role = 'super_admin' AND department_id IS NULL")
    op.execute(rls.ENABLE)


def downgrade() -> None:
    for col in ("country_scope", "started_on", "phone", "manager_id", "title", "department_id"):
        op.drop_column("admin_users", col)
    op.drop_table("departments")
