"""Africa rollout: reference data for every African Union member, compliance
sign-off fields, and provider coverage per country (what each provider can
do where). Seeds the recommended provider stack as inactive/planned.

Additive only. No country changes status: availability still needs the
readiness checklist and a second admin's approval.

Revision ID: 0037_africa_rollout
Revises: 0036_revenue_agents
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0037_africa_rollout"
down_revision = "0036_revenue_agents"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
TS = sa.DateTime(timezone=True)

COUNTRY_JSON = ("languages", "regional_blocs", "phone_nsn_lengths", "secondary_currencies", "mobile_money_operators")


def upgrade() -> None:
    op.add_column("countries", sa.Column("iso3", sa.String(3)))
    op.add_column("countries", sa.Column("numeric_code", sa.String(3)))
    op.add_column("countries", sa.Column("capital", sa.Text()))
    for col in COUNTRY_JSON:
        op.add_column("countries", sa.Column(col, JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("countries", sa.Column("regulator", sa.Text()))
    op.add_column("countries", sa.Column("licence_model", sa.String(40)))
    op.add_column("countries", sa.Column("compliance_signed_by", sa.Text()))
    op.add_column("countries", sa.Column("compliance_signed_at", TS))

    op.drop_constraint("ck_payment_providers_type", "payment_providers", type_="check")
    op.create_check_constraint(
        "ck_payment_providers_type", "payment_providers",
        "provider_type IN ('bank','psp','card','mobile_money','network','settlement','fx','kyc')")

    op.create_table(
        "provider_countries",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider_id", UUID, sa.ForeignKey("payment_providers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("country_code", sa.String(2), sa.ForeignKey("countries.code"), nullable=False),
        sa.Column("capabilities", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("currencies", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(12), nullable=False, server_default="planned"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("provider_id", "country_code", name="uq_provider_countries"),
        sa.CheckConstraint("status IN ('planned','contracting','sandbox','live','suspended')",
                           name="ck_provider_countries_status"),
    )
    op.create_index("ix_provider_countries_provider_id", "provider_countries", ["provider_id"])
    op.create_index("ix_provider_countries_country_code", "provider_countries", ["country_code"])

    from app.reference import africa_seed

    bind = op.get_bind()
    for stmt, params in africa_seed.statements():
        bind.execute(stmt, params)
    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table("provider_countries")
    op.drop_constraint("ck_payment_providers_type", "payment_providers", type_="check")
    op.create_check_constraint(
        "ck_payment_providers_type", "payment_providers",
        "provider_type IN ('bank','psp','card','mobile_money','network','settlement','fx')")
    for col in ("iso3", "numeric_code", "capital", *COUNTRY_JSON, "regulator", "licence_model",
                "compliance_signed_by", "compliance_signed_at"):
        op.drop_column("countries", col)
