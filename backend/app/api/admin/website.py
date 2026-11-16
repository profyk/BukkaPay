"""Admin: edit the public website's content and see the waitlist. Saves are
validated, versioned (optimistic locking), audited by `require`, and push a
refresh to the website."""

import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.db.deps import get_db
from app.models.website import WaitlistSignup
from app.schemas.base import CamelModel
from app.website import content
from app.website import service as website_service

router = APIRouter(tags=["admin-website"])


class SectionIn(CamelModel):
    data: dict
    version: int | None = None


@router.get("/website")
async def get_website(_=Depends(require("website.view")), db: AsyncSession = Depends(get_db)):
    site = await website_service.get_site(db)
    return {"sections": list(content.SECTIONS), "site": site, "defaults": content.defaults()}


@router.put("/website/{key}")
async def save_section(key: str, body: SectionIn, ctx: AdminContext = Depends(require("website.manage")),
                       db: AsyncSession = Depends(get_db)):
    actor = ctx.admin.email if ctx.admin else "master-key"
    return await website_service.save(db, key, body.data, actor=actor, expected_version=body.version)


def _row(w: WaitlistSignup) -> dict:
    return {"id": str(w.id), "email": w.email, "name": w.name, "countryCode": w.country_code, "kind": w.kind,
            "source": w.source, "createdAt": w.created_at.isoformat()}


@router.get("/waitlist")
async def waitlist(kind: str | None = None, limit: int = Query(default=100, le=500), offset: int = 0,
                   _=Depends(require("website.view")), db: AsyncSession = Depends(get_db)):
    stmt = select(WaitlistSignup)
    if kind:
        stmt = stmt.where(WaitlistSignup.kind == kind)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    by_country = dict((await db.execute(
        select(func.coalesce(WaitlistSignup.country_code, "—"), func.count()).group_by(WaitlistSignup.country_code)
    )).all())
    rows = (await db.execute(stmt.order_by(WaitlistSignup.created_at.desc()).limit(limit).offset(offset))).scalars()
    return {"total": total, "byCountry": by_country, "signups": [_row(w) for w in rows]}


@router.get("/waitlist.csv")
async def waitlist_csv(_=Depends(require("website.manage")), db: AsyncSession = Depends(get_db)):
    """Personal data: export is limited to website.manage."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["email", "name", "country", "kind", "source", "joined_at"])
    for w in (await db.execute(select(WaitlistSignup).order_by(WaitlistSignup.created_at))).scalars():
        writer.writerow([w.email, w.name or "", w.country_code or "", w.kind, w.source or "", w.created_at.isoformat()])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="bukkapay-waitlist.csv"'})
