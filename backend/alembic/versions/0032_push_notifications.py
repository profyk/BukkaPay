"""Push notifications: devices, preferences, and a pushed_at stamp per notification.

Revision ID: 0032_push
Revises: 0031_pricing
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db import rls

revision = "0032_push"
down_revision = "0031_pricing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("token", sa.Text(), nullable=False, unique=True),
        sa.Column("keys", postgresql.JSONB(), nullable=True),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column("device_name", sa.String(120), nullable=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('expo','webpush')", name="ck_push_devices_kind"),
        sa.CheckConstraint("platform IN ('ios','android','web')", name="ck_push_devices_platform"),
    )
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"])

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("money", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("cards", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("trade", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("support", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updates", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("show_previews", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Existing notifications count as already handled: nothing old gets pushed.
    op.add_column("notifications", sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE notifications SET pushed_at = created_at")

    op.execute(rls.ENABLE)


def downgrade() -> None:
    op.drop_column("notifications", "pushed_at")
    op.drop_table("notification_preferences")
    op.drop_index("ix_push_devices_user_id", table_name="push_devices")
    op.drop_table("push_devices")
