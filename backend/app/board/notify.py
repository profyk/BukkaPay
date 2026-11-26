"""Boardroom notifications: an in-app record for every recipient, plus an
email through the existing Resend integration when it's configured. Emails
never contain figures or document contents, only a pointer to sign in."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.board import permissions as perms
from app.models.board import BoardMember
from app.models.boardroom import BoardNotification


async def recipients(db: AsyncSession, permission: str, audience: list | None = None) -> list[BoardMember]:
    rows = (await db.execute(select(BoardMember).where(BoardMember.active.is_(True), BoardMember.suspended_at.is_(None),
                                                       BoardMember.accepted_at.is_not(None)))).scalars().all()
    return [m for m in rows if perms.can(m, permission) and perms.audience_ok(m, audience)]


async def notify(db: AsyncSession, members: Iterable[BoardMember], *, kind: str, title: str, body: str | None = None,
                 link: str | None = None, email: bool = True) -> int:
    from app.board.service import _email
    from app.core.config import get_settings

    base = get_settings().board_web_url.rstrip("/")
    n = 0
    for m in members:
        sent = False
        if email:
            sent = await _email(m.email, f"BukkaPay Boardroom: {title}",
                                [f"Hello {m.name},", body or title,
                                 "Sign in to BukkaPay Boardroom to see the details."],
                                button=("Open the Boardroom", f"{base}{link or '/'}"))
        db.add(BoardNotification(member_id=m.id, kind=kind, title=title, body=body, link=link, emailed=sent))
        n += 1
    await db.flush()
    return n
