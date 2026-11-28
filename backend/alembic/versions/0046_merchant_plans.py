"""Merchant plans: a catalogue admins draft, price and publish, each
business's subscription periods, and every plan charge. Seeds the draft
catalogue (Starter free; Growth, Pro and Enterprise unpriced) as drafts, so
nothing changes for any business until an admin publishes. Additive only.

Revision ID: 0046_merchant_plans
Revises: 0045_boardroom
Create Date: 2026-11-28
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision: str = '0046_merchant_plans'
down_revision: Union[str, None] = '0045_boardroom'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text('now()')
UUID_DEFAULT = sa.text('gen_random_uuid()')


def upgrade() -> None:
    op.create_table(
        'merchant_plans',
        sa.Column('id', sa.UUID(), server_default=UUID_DEFAULT, nullable=False),
        sa.Column('code', sa.String(length=40), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('tagline', sa.String(length=160), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=12), server_default='draft', nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('highlighted', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('is_default', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('trial_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('prices', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('features', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('limits', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('updated_by', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint("status IN ('draft','published','retired')", name='ck_merchant_plans_status'),
        sa.CheckConstraint('trial_days >= 0 AND trial_days <= 365', name='ck_merchant_plans_trial_days'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_table(
        'merchant_plan_subscriptions',
        sa.Column('id', sa.UUID(), server_default=UUID_DEFAULT, nullable=False),
        sa.Column('merchant_id', sa.UUID(), nullable=False),
        sa.Column('plan_code', sa.String(length=40), nullable=False),
        sa.Column('billing_cycle', sa.String(length=10), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('price', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_plan_code', sa.String(length=40), nullable=True),
        sa.Column('next_billing_cycle', sa.String(length=10), nullable=True),
        sa.Column('renewal_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_reason', sa.String(length=40), nullable=True),
        sa.Column('chosen_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint("status IN ('active','past_due','ended')", name='ck_mps_status'),
        sa.CheckConstraint("billing_cycle IN ('monthly','yearly')", name='ck_mps_cycle'),
        sa.ForeignKeyConstraint(['merchant_id'], ['merchants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_merchant_plan_subscriptions_merchant_id', 'merchant_plan_subscriptions', ['merchant_id'])
    op.create_index('ix_merchant_plan_subscriptions_plan_code', 'merchant_plan_subscriptions', ['plan_code'])
    op.create_index('ix_merchant_plan_subscriptions_status', 'merchant_plan_subscriptions', ['status'])
    # At most one live period per business.
    op.create_index('uq_mps_one_live_per_merchant', 'merchant_plan_subscriptions', ['merchant_id'], unique=True,
                    postgresql_where=sa.text("status IN ('active','past_due')"))
    op.create_table(
        'merchant_plan_charges',
        sa.Column('id', sa.UUID(), server_default=UUID_DEFAULT, nullable=False),
        sa.Column('merchant_id', sa.UUID(), nullable=False),
        sa.Column('subscription_id', sa.UUID(), nullable=True),
        sa.Column('plan_code', sa.String(length=40), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('credit', sa.Numeric(precision=14, scale=2), server_default='0', nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('journal_entry_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint("status IN ('charged','failed','credited')", name='ck_mpc_status'),
        sa.ForeignKeyConstraint(['merchant_id'], ['merchants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subscription_id'], ['merchant_plan_subscriptions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_merchant_plan_charges_merchant_id', 'merchant_plan_charges', ['merchant_id'])

    from app.plans.catalogue import DRAFT_PLANS

    plans = sa.table('merchant_plans', sa.column('code', sa.String), sa.column('name', sa.String),
                     sa.column('tagline', sa.String), sa.column('description', sa.Text),
                     sa.column('status', sa.String), sa.column('sort_order', sa.Integer),
                     sa.column('highlighted', sa.Boolean), sa.column('is_default', sa.Boolean),
                     sa.column('trial_days', sa.Integer), sa.column('prices', postgresql.JSONB),
                     sa.column('features', postgresql.JSONB), sa.column('limits', postgresql.JSONB),
                     sa.column('updated_by', sa.Text))
    op.bulk_insert(plans, [{
        "code": p["code"], "name": p["name"], "tagline": p.get("tagline"), "description": p.get("description"),
        "status": "draft", "sort_order": p.get("sort_order", 0), "highlighted": p.get("highlighted", False),
        "is_default": p.get("is_default", False), "trial_days": p.get("trial_days", 0),
        "prices": json.loads(json.dumps(p.get("prices", {}))), "features": p.get("features", []),
        "limits": p.get("limits", {}), "updated_by": "migration 0046",
    } for p in DRAFT_PLANS])

    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_table('merchant_plan_charges')
    op.drop_index('uq_mps_one_live_per_merchant', table_name='merchant_plan_subscriptions')
    op.drop_table('merchant_plan_subscriptions')
    op.drop_table('merchant_plans')
