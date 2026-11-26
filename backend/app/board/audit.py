"""Boardroom audit trail (append-only table, see app.db.board_guard)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.board import BoardMember
from app.models.boardroom import BoardroomAuditLog

# Never written to the audit trail, whatever the caller passes.
_SECRET_KEYS = {"password", "otp", "code", "token", "secret", "mfa_secret", "mfa_pending_secret", "password_hash",
                "base64", "storage_ref", "login_code_hash", "invite_token_hash", "reset_token_hash"}


def _clean(v):
    if isinstance(v, dict):
        return {k: ("[redacted]" if k.lower() in _SECRET_KEYS else _clean(x)) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_clean(x) for x in v]
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, Enum):
        return v.value
    return v


def ip_of(request: Request | None) -> str | None:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else None)


def snapshot(obj, fields: tuple[str, ...]) -> dict:
    return _clean({f: getattr(obj, f, None) for f in fields})


async def record(db: AsyncSession, action: str, *, member: BoardMember | None = None, admin=None,
                 target_type: str | None = None, target_id=None, before: dict | None = None,
                 after: dict | None = None, request: Request | None = None) -> None:
    label = None
    if member is not None:
        label = f"{member.name} <{member.email}>"
    elif admin is not None:
        label = f"admin:{getattr(admin, 'email', '')}"
    db.add(BoardroomAuditLog(
        actor_member_id=member.id if member is not None else None,
        actor_admin_id=getattr(admin, "id", None), actor_label=label, action=action,
        target_type=target_type, target_id=str(target_id) if target_id is not None else None,
        before=_clean(before) if before else None, after=_clean(after) if after else None,
        ip=ip_of(request), user_agent=(request.headers.get("user-agent", "")[:300] or None) if request else None,
    ))
    await db.flush()


def actor_label(member: BoardMember) -> str:
    return f"{member.name} <{member.email}>"
