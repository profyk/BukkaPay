"""Append-only audit trail of privileged actions. Written in the same
transaction as the action, so an action without its audit row can't commit."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import AuditLog


async def record(
    db: AsyncSession, *, actor_type: str, actor_id: str | None, actor_email: str | None, action: str,
    target_type: str | None = None, target_id: str | None = None, details: dict | None = None,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_type=actor_type, actor_id=actor_id, actor_email=actor_email, action=action,
        target_type=target_type, target_id=str(target_id) if target_id is not None else None,
        details=_jsonable(details or {}), ip=ip,
    )
    db.add(entry)
    await db.flush()
    return entry


def _jsonable(value):
    import json

    return json.loads(json.dumps(value, default=str))
