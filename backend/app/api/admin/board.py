"""Admin → Board & Investors. Owner only: invite and revoke board members,
enter the monthly management accounts, publish investor updates and see
who opened what."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, admin_auth
from app.board import service as svc
from app.board.permissions import ROLES
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.board import BoardAccessLog, BoardFinancial, BoardMember, BoardUpdate
from app.schemas.base import CamelModel

router = APIRouter(prefix="/board", tags=["admin-board"])


async def owner(ctx: AdminContext = Depends(admin_auth)) -> AdminContext:
    if ctx.is_master_key or ctx.role != "super_admin":
        raise ApiError("Only the owner manages the board portal", status_code=403)
    return ctx


def _uuid(v: str) -> uuid.UUID:
    try:
        return uuid.UUID(v)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e


def _member(m: BoardMember) -> dict:
    return {"id": str(m.id), "email": m.email, "name": m.name, "organisation": m.organisation, "title": m.title,
            "status": "owner" if svc.is_owner(m) else svc.member_status(m), "role": m.role,
            "mfa": bool(m.mfa_secret), "lastLoginAt": m.last_login_at.isoformat() if m.last_login_at else None,
            "inviteExpiresAt": m.invite_expires_at.isoformat() if m.invite_expires_at else None,
            "createdAt": m.created_at.isoformat() if m.created_at else None}


@router.get("/members")
async def members(_=Depends(owner), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardMember).order_by(BoardMember.created_at.desc()))).scalars().all()
    names = {m.id: m.name for m in rows}
    log = (await db.execute(select(BoardAccessLog).order_by(BoardAccessLog.created_at.desc()).limit(200))).scalars()
    return {"members": [_member(m) for m in rows],
            "access": [{"member": names.get(a.member_id, "—"), "action": a.action, "ip": a.ip,
                        "at": a.created_at.isoformat()} for a in log]}


class InviteIn(CamelModel):
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=2, max_length=120)
    organisation: str | None = Field(default=None, max_length=160)
    title: str | None = Field(default=None, max_length=120)
    role: str = "investor"


@router.post("/members", status_code=201)
async def invite(body: InviteIn, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    m, link, sent = await svc.invite(db, email=body.email, name=body.name, organisation=body.organisation,
                                     title=body.title, by=ctx.admin, role=body.role)
    await ctx.audit(db, "board.member_invited", target_type="board_member", target_id=m.id, details={"email": m.email})
    return {"member": _member(m), "link": link, "emailSent": sent}


@router.post("/members/{member_id}/resend")
async def resend(member_id: str, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    m = await db.get(BoardMember, _uuid(member_id))
    if m is None:
        raise ApiError("Not found", status_code=404)
    m, link, sent = await svc.invite(db, email=m.email, name=m.name, organisation=m.organisation, title=m.title,
                                     by=ctx.admin, role=m.role if m.role in ROLES else "investor")
    await ctx.audit(db, "board.invite_resent", target_type="board_member", target_id=m.id)
    return {"member": _member(m), "link": link, "emailSent": sent}


@router.post("/members/{member_id}/revoke")
async def revoke(member_id: str, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    m = await db.get(BoardMember, _uuid(member_id))
    if m is None:
        raise ApiError("Not found", status_code=404)
    if svc.is_owner(m):
        raise ApiError("The owner always has access to the board portal", status_code=403)
    m.active, m.invite_token_hash = False, None
    await svc.end_sessions(db, m.id)
    await ctx.audit(db, "board.member_revoked", target_type="board_member", target_id=m.id, details={"email": m.email})
    return _member(m)


# ─── management accounts ────────────────────────────────────────────────────

class FinancialIn(CamelModel):
    month: date
    currency: str = Field(default="USD", min_length=3, max_length=3)
    staff_costs: Decimal = Field(default=Decimal(0), ge=0)
    technology_costs: Decimal = Field(default=Decimal(0), ge=0)
    marketing_costs: Decimal = Field(default=Decimal(0), ge=0)
    compliance_legal_costs: Decimal = Field(default=Decimal(0), ge=0)
    office_admin_costs: Decimal = Field(default=Decimal(0), ge=0)
    other_costs: Decimal = Field(default=Decimal(0), ge=0)
    other_income: Decimal = Field(default=Decimal(0), ge=0)
    cash_balance: Decimal | None = Field(default=None, ge=0)
    funding_raised: Decimal = Field(default=Decimal(0), ge=0)
    headcount: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)


FIELDS = ("currency", "staff_costs", "technology_costs", "marketing_costs", "compliance_legal_costs",
          "office_admin_costs", "other_costs", "other_income", "cash_balance", "funding_raised", "headcount", "notes")


def _fin(f: BoardFinancial) -> dict:
    out = {"id": str(f.id), "month": f.month.isoformat()}
    for k in FIELDS:
        v = getattr(f, k)
        out["".join(w.capitalize() if i else w for i, w in enumerate(k.split("_")))] = str(v) if isinstance(v, Decimal) else v
    return out


@router.get("/financials")
async def financials(_=Depends(owner), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(BoardFinancial).order_by(BoardFinancial.month.desc()))).scalars()
    return [_fin(f) for f in rows]


@router.put("/financials")
async def save_financial(body: FinancialIn, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    month = date(body.month.year, body.month.month, 1)
    f = (await db.execute(select(BoardFinancial).where(BoardFinancial.month == month))).scalar_one_or_none()
    if f is None:
        f = BoardFinancial(month=month)
        db.add(f)
    data = body.model_dump()
    data["currency"] = data["currency"].upper()
    for k in FIELDS:
        setattr(f, k, data[k])
    f.updated_by = ctx.admin.id
    await db.flush()
    await ctx.audit(db, "board.financials_saved", target_type="board_financial", target_id=f.id,
                    details={"month": month.isoformat()})
    return _fin(f)


# ─── investor updates ───────────────────────────────────────────────────────

class UpdateIn(CamelModel):
    title: str = Field(min_length=3, max_length=200)
    period: str | None = Field(default=None, max_length=60)
    body: str = Field(min_length=10, max_length=50_000)
    publish: bool = False


@router.get("/updates")
async def list_updates(_=Depends(owner), db: AsyncSession = Depends(get_db)):
    return await svc.updates(db, published_only=False)


@router.post("/updates", status_code=201)
async def create_update(body: UpdateIn, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    u = BoardUpdate(title=body.title, period=body.period, body=body.body, author_id=ctx.admin.id,
                    published_at=datetime.now(UTC) if body.publish else None)
    db.add(u)
    await db.flush()
    await ctx.audit(db, "board.update_created", target_type="board_update", target_id=u.id, details={"title": u.title})
    return {"id": str(u.id)}


@router.patch("/updates/{update_id}")
async def edit_update(update_id: str, body: UpdateIn, ctx: AdminContext = Depends(owner),
                      db: AsyncSession = Depends(get_db)):
    u = await db.get(BoardUpdate, _uuid(update_id))
    if u is None:
        raise ApiError("Not found", status_code=404)
    u.title, u.period, u.body = body.title, body.period, body.body
    if body.publish and not u.published_at:
        u.published_at = datetime.now(UTC)
    if not body.publish:
        u.published_at = None
    await ctx.audit(db, "board.update_edited", target_type="board_update", target_id=u.id)
    return {"id": str(u.id)}


@router.delete("/updates/{update_id}")
async def delete_update(update_id: str, ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    u = await db.get(BoardUpdate, _uuid(update_id))
    if u is None:
        raise ApiError("Not found", status_code=404)
    await db.delete(u)
    await ctx.audit(db, "board.update_deleted", target_type="board_update", target_id=update_id)
    return {"deleted": True}


@router.post("/owner-pass")
async def owner_pass(ctx: AdminContext = Depends(owner), db: AsyncSession = Depends(get_db)):
    """Single-use, 60-second pass that signs the owner in to the board portal."""
    from app.core.config import get_settings

    code = await svc.owner_pass(db, ctx.admin)
    await ctx.audit(db, "board.owner_opened_portal", target_type="board_portal")
    # In the URL fragment: never sent to a server or written to access logs.
    return {"url": f"{get_settings().board_web_url.rstrip('/')}/owner#{code}", "expiresIn": svc.OWNER_PASS_TTL}


@router.get("/preview")
async def preview(months: int = 12, _=Depends(owner), db: AsyncSession = Depends(get_db)):
    """What board members see, for the owner to check before sharing."""
    return await svc.overview(db, months=max(3, min(36, months)))
