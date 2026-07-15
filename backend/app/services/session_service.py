"""Opaque bearer-token sessions for end users. DB (`user_sessions`) is the
source of truth so a password reset / admin freeze can revoke instantly;
Redis is a read-through cache so most auth checks never hit Postgres.
Mirrors the old Node in-memory `sessions` Map + `user_sessions` table
persistence, just with Redis standing in for the in-process Map.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import session as session_cache
from app.core.security import generate_session_token
from app.models.user import UserSession

SESSION_TTL_DAYS = 30


async def issue_session(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, datetime]:
    token = generate_session_token()
    expires_at = datetime.now(UTC) + timedelta(days=SESSION_TTL_DAYS)

    stmt = pg_insert(UserSession).values(token=token, user_id=user_id, expires_at=expires_at)
    await db.execute(stmt)
    await db.flush()

    await session_cache.cache_set(
        token, {"user_id": str(user_id)}, expires_at, admin=False
    )
    return token, expires_at


async def verify_session(db: AsyncSession, token: str) -> uuid.UUID | None:
    cached = await session_cache.cache_get(token, admin=False)
    if cached:
        return uuid.UUID(cached["user_id"])

    result = await db.execute(select(UserSession).where(UserSession.token == token))
    row = result.scalar_one_or_none()
    if row is None:
        return None

    now = datetime.now(UTC)
    expires_at = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        await db.execute(delete(UserSession).where(UserSession.token == token))
        await db.flush()
        return None

    await session_cache.cache_set(token, {"user_id": str(row.user_id)}, expires_at, admin=False)
    return row.user_id


async def revoke_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(UserSession).where(UserSession.token == token))
    await session_cache.cache_delete(token, admin=False)


async def revoke_all_sessions_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    result = await db.execute(select(UserSession.token).where(UserSession.user_id == user_id))
    tokens = [row[0] for row in result.all()]
    await db.execute(delete(UserSession).where(UserSession.user_id == user_id))
    for token in tokens:
        await session_cache.cache_delete(token, admin=False)
