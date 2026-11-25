"""Admin: the help desk inbox — tickets from chat, the app, email and phone."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.admin import AdminUser
from app.models.support import TICKET_CATEGORIES, TICKET_PRIORITIES, SupportTicket, TicketMessage
from app.models.user import User
from app.schemas.base import CamelModel
from app.support import service

router = APIRouter(tags=["admin-support"])

CANNED = [
    ("Greeting", "Hi, thanks for contacting BukkaPay. I'm looking into this for you now."),
    ("Need wallet ID", "To help, please share your BukkaPay wallet ID (Profile → Wallet ID). Never share your PIN, password or codes."),
    ("Verification pending", "Your verification is being reviewed. This usually takes up to one business day; we'll notify you as soon as it's done."),
    ("Payment investigating", "We're investigating this payment with our partner and will update you within 2 business days."),
    ("Fraud steps", "We've restricted your account to protect it. Please change your password and PIN, and don't share codes with anyone. We'll contact you shortly."),
    ("Resolved", "This should now be sorted. If anything's still not right, just reply and we'll pick it up."),
]


def _row(t: SupportTicket, *, admins: dict | None = None) -> dict:
    now = datetime.now(UTC)
    waiting = (now - (t.last_customer_at or t.created_at)) if t.status == "open" else None
    return {"id": str(t.id), "reference": t.reference, "subject": t.subject, "category": t.category,
            "priority": t.priority, "status": t.status, "channel": t.channel, "requesterName": t.requester_name,
            "requesterEmail": t.requester_email, "userId": str(t.user_id) if t.user_id else None,
            "assignee": (admins or {}).get(t.assigned_admin_id) if t.assigned_admin_id else None,
            "assigneeId": str(t.assigned_admin_id) if t.assigned_admin_id else None,
            "createdAt": t.created_at.isoformat(), "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
            "firstResponseAt": t.first_response_at.isoformat() if t.first_response_at else None,
            "waitingMinutes": int(waiting.total_seconds() // 60) if waiting else None,
            "rating": t.csat_rating, "ratingComment": t.csat_comment}


async def _admins(db: AsyncSession) -> dict:
    return {a.id: a.name or a.email for a in (await db.execute(select(AdminUser))).scalars()}


async def _get(db: AsyncSession, ticket_id: str) -> SupportTicket:
    try:
        t = await db.get(SupportTicket, uuid.UUID(ticket_id), with_for_update=True)
    except ValueError:
        t = None
    if t is None:
        raise ApiError("Ticket not found", status_code=404)
    return t


@router.get("/support/tickets")
async def list_tickets(status: str | None = Query(default="active"), mine: bool = False, q: str | None = None,
                       ctx: AdminContext = Depends(require("support.view")), db: AsyncSession = Depends(get_db)):
    stmt = select(SupportTicket)
    if status == "active":
        stmt = stmt.where(SupportTicket.status.in_(("open", "waiting_customer")))
    elif status and status != "all":
        stmt = stmt.where(SupportTicket.status == status)
    if mine and ctx.admin:
        stmt = stmt.where(SupportTicket.assigned_admin_id == ctx.admin.id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(SupportTicket.reference.ilike(like), SupportTicket.subject.ilike(like),
                              SupportTicket.requester_email.ilike(like), SupportTicket.requester_name.ilike(like)))
    order = [SupportTicket.priority == "urgent", SupportTicket.priority == "high"]
    rows = (await db.execute(stmt.order_by(*(o.desc() for o in order), SupportTicket.updated_at.desc())
                             .limit(300))).scalars().all()
    admins = await _admins(db)
    return [_row(t, admins=admins) for t in rows]


@router.get("/support/stats")
async def stats(_=Depends(require("support.view")), db: AsyncSession = Depends(get_db)):
    counts = dict((await db.execute(select(SupportTicket.status, func.count()).group_by(SupportTicket.status))).all())
    since = datetime.now(UTC) - timedelta(days=30)
    frt = (await db.execute(select(func.avg(func.extract("epoch", SupportTicket.first_response_at - SupportTicket.created_at)))
                            .where(SupportTicket.created_at >= since, SupportTicket.first_response_at.is_not(None)))).scalar()
    csat, rated = (await db.execute(select(func.avg(SupportTicket.csat_rating), func.count(SupportTicket.csat_rating))
                                    .where(SupportTicket.created_at >= since))).one()
    urgent = (await db.execute(select(func.count()).select_from(SupportTicket).where(
        SupportTicket.priority == "urgent", SupportTicket.status.in_(("open", "waiting_customer"))))).scalar_one()
    return {"open": counts.get("open", 0), "waitingCustomer": counts.get("waiting_customer", 0),
            "resolved": counts.get("resolved", 0), "closed": counts.get("closed", 0), "urgentActive": urgent,
            "avgFirstResponseMinutes": round(float(frt) / 60) if frt else None,
            "csat": round(float(csat), 2) if csat else None, "rated": rated}


@router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, _=Depends(require("support.view")), db: AsyncSession = Depends(get_db)):
    t = await _get(db, ticket_id)
    admins = await _admins(db)
    msgs = (await db.execute(select(TicketMessage).where(TicketMessage.ticket_id == t.id)
                             .order_by(TicketMessage.created_at))).scalars()
    customer = None
    if t.user_id:
        u = await db.get(User, t.user_id)
        if u:
            customer = {"name": u.name, "email": u.email, "walletId": u.wallet_id, "phone": u.phone,
                        "country": u.residence_country, "kycLevel": u.kyc_level, "frozen": u.frozen,
                        "accountType": u.account_type, "since": u.created_at.isoformat() if u.created_at else None}
    history = []
    if t.user_id:
        history = [_row(x) for x in (await db.execute(select(SupportTicket).where(
            SupportTicket.user_id == t.user_id, SupportTicket.id != t.id).order_by(SupportTicket.created_at.desc())
            .limit(10))).scalars()]
    return {"ticket": _row(t, admins=admins), "customer": customer, "history": history,
            "messages": [{"id": str(m.id), "author": m.author, "agent": admins.get(m.admin_id) if m.admin_id else None,
                          "body": m.body, "internal": m.internal, "via": m.via, "createdAt": m.created_at.isoformat()}
                         for m in msgs],
            "canned": [{"title": a, "body": b} for a, b in CANNED],
            "agents": [{"id": str(k), "name": v} for k, v in admins.items()],
            "categories": list(TICKET_CATEGORIES), "priorities": list(TICKET_PRIORITIES)}


class ReplyIn(CamelModel):
    body: str = Field(min_length=1, max_length=20000)
    internal: bool = False
    status_after: Literal["open", "waiting_customer", "resolved"] | None = None


@router.post("/support/tickets/{ticket_id}/reply", status_code=201)
async def reply(ticket_id: str, body: ReplyIn, ctx: AdminContext = Depends(require("support.manage")),
                db: AsyncSession = Depends(get_db)):
    t = await _get(db, ticket_id)
    await service.agent_reply(db, t, body.body, admin_id=ctx.admin.id if ctx.admin else None, internal=body.internal,
                              status_after=body.status_after)
    return _row(t)


class TicketPatch(CamelModel):
    status: Literal["open", "waiting_customer", "resolved", "closed"] | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    category: str | None = None
    assignee_id: str | None = None


@router.patch("/support/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, body: TicketPatch, _=Depends(require("support.manage")),
                        db: AsyncSession = Depends(get_db)):
    t = await _get(db, ticket_id)
    if body.priority:
        t.priority = body.priority
    if body.category:
        if body.category not in TICKET_CATEGORIES:
            raise ApiError("Unknown category")
        t.category = body.category
    if body.assignee_id is not None:
        t.assigned_admin_id = uuid.UUID(body.assignee_id) if body.assignee_id else None
    if body.status:
        await service.set_status(db, t, body.status)
    await db.flush()
    return _row(t, admins=await _admins(db))


class AgentTicketIn(CamelModel):
    wallet_id: str | None = None
    email: str | None = Field(default=None, max_length=200)
    name: str | None = Field(default=None, max_length=120)
    channel: Literal["phone", "email", "web"] = "phone"
    subject: str = Field(min_length=3, max_length=200)
    category: str = "other"
    body: str = Field(min_length=2, max_length=20000)


@router.post("/support/tickets", status_code=201)
async def create_for_customer(body: AgentTicketIn, ctx: AdminContext = Depends(require("support.manage")),
                              db: AsyncSession = Depends(get_db)):
    """Log a call or message on the customer's behalf (by wallet ID or email)."""
    user = None
    if body.wallet_id:
        user = (await db.execute(select(User).where(func.upper(User.wallet_id) == body.wallet_id.strip().upper()))
                ).scalar_one_or_none()
        if user is None:
            raise ApiError("No customer has that wallet ID", status_code=404)
    elif not body.email:
        raise ApiError("Enter the customer's wallet ID or email")
    t = await service.open_ticket(db, channel=body.channel, subject=body.subject, body=body.body, user=user,
                                  email=body.email, name=body.name, category=body.category, author="agent",
                                  admin_id=ctx.admin.id if ctx.admin else None)
    t.assigned_admin_id = ctx.admin.id if ctx.admin else None
    await db.flush()
    return _row(t)
