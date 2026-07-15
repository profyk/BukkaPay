"""Redis read-through cache for opaque session tokens.

The DB (`user_sessions` / `admin_sessions`) stays the source of truth so a
freeze/logout-all can revoke instantly by deleting the DB row; Redis is
purely a latency optimization with a TTL that never outlives the DB record.
Actual issue/verify/revoke orchestration lives in app/services/auth_service.py
since it needs the DB session — this module only knows about caching.
"""

import json
from datetime import UTC, datetime

from app.core.redis import get_redis

_PREFIX_USER = "session:user:"
_PREFIX_ADMIN = "session:admin:"


async def cache_get(token: str, *, admin: bool = False) -> dict | None:
    redis = get_redis()
    raw = await redis.get((_PREFIX_ADMIN if admin else _PREFIX_USER) + token)
    return json.loads(raw) if raw else None


async def cache_set(
    token: str, payload: dict, expires_at: datetime, *, admin: bool = False
) -> None:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    ttl = max(1, int((expires_at - datetime.now(UTC)).total_seconds()))
    redis = get_redis()
    await redis.set((_PREFIX_ADMIN if admin else _PREFIX_USER) + token, json.dumps(payload), ex=ttl)


async def cache_delete(token: str, *, admin: bool = False) -> None:
    redis = get_redis()
    await redis.delete((_PREFIX_ADMIN if admin else _PREFIX_USER) + token)
