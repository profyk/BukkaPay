"""Opaque bearer-token sessions for admin users — mirrors session_service.py
but with a 12-hour TTL (matching the Node admin panel's session lifetime,
shorter than the 30-day mobile-app session) and the AdminSession table.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import session as session_cache
from app.core.security import generate_session_token
from app.models.admin import AdminSession

ADMIN_SESSION_TTL_HOURS = 12


async def issue_session(db: AsyncSession, admin_id: uuid.UUID) -> tuple[str, datetime]:
    token = generate_session_token()
    expires_at = datetime.now(UTC) + timedelta(hours=ADMIN_SESSION_TTL_HOURS)

    stmt = pg_insert(AdminSession).values(token=token, admin_id=admin_id, expires_at=expires_at)
    await db.execute(stmt)
    await db.flush()

    await session_cache.cache_set(token, {"admin_id": str(admin_id)}, expires_at, admin=True)
    return token, expires_at


async def verify_session(db: AsyncSession, token: str) -> uuid.UUID | None:
    cached = await session_cache.cache_get(token, admin=True)
    if cached:
        return uuid.UUID(cached["admin_id"])

    result = await db.execute(select(AdminSession).where(AdminSession.token == token))
    row = result.scalar_one_or_none()
    if row is None:
        return None

    now = datetime.now(UTC)
    expires_at = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        await db.execute(delete(AdminSession).where(AdminSession.token == token))
        await db.flush()
        return None

    await session_cache.cache_set(token, {"admin_id": str(row.admin_id)}, expires_at, admin=True)
    return row.admin_id


async def revoke_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(AdminSession).where(AdminSession.token == token))
    await session_cache.cache_delete(token, admin=True)
