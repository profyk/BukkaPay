"""Every public table has RLS on, and Supabase's anon role can read nothing."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db.base import get_engine


async def test_every_public_table_has_rls_enabled():
    async with get_engine().connect() as conn:
        rows = (await conn.execute(text(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
        ))).scalars().all()
    assert rows == [], f"tables without RLS: {rows}"


@pytest.mark.parametrize("table", ["users", "wallet_cards", "journal_lines", "issued_cards"])
async def test_anon_role_cannot_read(table):
    async with get_engine().connect() as conn:
        await conn.execute(text("SET ROLE anon"))
        with pytest.raises(DBAPIError):
            await conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1"))
        await conn.rollback()
