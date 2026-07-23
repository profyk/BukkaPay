"""Support chat. The chat_messages table already existed (user_id, message,
is_user_message) but had zero API routes anywhere -- this activates it as a
real two-way chat between a user and BukkaPay support, adding a read flag
so the admin inbox can show which conversations have unread user messages.

Revision ID: 0015_chat_read_tracking
Revises: 0014_merchant_staff_banking
Create Date: 2026-07-23
"""

from alembic import op

revision = "0015_chat_read_tracking"
down_revision = "0014_merchant_staff_banking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE chat_messages DROP COLUMN IF EXISTS read")
