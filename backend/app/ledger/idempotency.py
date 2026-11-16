"""Idempotency keys for money-moving endpoints.

Usage in a route::

    async with idempotency.guard(db, scope=f"transfer:{user_id}", key=key, payload=body) as g:
        if g.replay is not None:
            return g.replay
        result = await do_the_payment(...)
        g.store(result)
    return result

The record is inserted inside the request's own database transaction. A
concurrent duplicate blocks on the unique index until the first request
commits, then sees the stored response (or, if the first rolled back, runs
normally). The same key reused with a different payload is rejected.
"""

import hashlib
import json
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.ledger import IdempotencyRecord

MAX_KEY_LENGTH = 200


def request_hash(payload) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass
class _Guard:
    record: IdempotencyRecord | None
    replay: dict | None = None
    _stored: dict | None = field(default=None, repr=False)

    def store(self, response: dict) -> None:
        self._stored = response


@asynccontextmanager
async def guard(db: AsyncSession, *, scope: str, key: str | None, payload):
    if not key:
        yield _Guard(record=None)
        return
    key = key.strip()
    if not key or len(key) > MAX_KEY_LENGTH:
        raise ApiError("Invalid Idempotency-Key header")

    digest = request_hash(payload)
    inserted_id = (
        await db.execute(
            insert(IdempotencyRecord)
            .values(scope=scope, key=key, request_hash=digest)
            .on_conflict_do_nothing(constraint="uq_idempotency_scope_key")
            .returning(IdempotencyRecord.id)
        )
    ).scalar_one_or_none()
    record = (
        await db.execute(
            select(IdempotencyRecord)
            .where(IdempotencyRecord.scope == scope, IdempotencyRecord.key == key)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()

    if inserted_id is None:
        if record.request_hash != digest:
            raise ApiError("Idempotency-Key was already used with a different request", status_code=422)
        if record.response is None:
            raise ApiError("A request with this Idempotency-Key is still being processed", status_code=409)
        yield _Guard(record=record, replay=record.response)
        return

    g = _Guard(record=record)
    yield g
    if g._stored is not None:
        record.response = json.loads(json.dumps(g._stored, default=str))
        record.status_code = 200
        await db.flush()
