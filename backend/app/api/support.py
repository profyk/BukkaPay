"""Help desk for customers and businesses, the email help line webhook and
one-click ratings.

Customer:  GET/POST /api/support/tickets, GET /api/support/tickets/{id},
           POST /api/support/tickets/{id}/messages | /resolve | /rate
Email in:  POST /api/webhooks/support-email   (HMAC-SHA256 of the raw body,
           hex, in X-Signature, with SUPPORT_INBOUND_SECRET)
           JSON: {"from": "...", "name": "...", "subject": "...", "text": "...", "messageId": "..."}
Rating:    GET /api/public/support-rating?t=<token>&r=<1-5>  (link in the resolved email)
"""

import hashlib
import hmac
import json
import uuid

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.models.support import TICKET_CATEGORIES, SupportTicket, TicketMessage
from app.models.user import User
from app.schemas.base import CamelModel
from app.support import service

router = APIRouter(tags=["support"])


def _ticket(t: SupportTicket) -> dict:
    return {"id": str(t.id), "reference": t.reference, "subject": t.subject, "category": t.category,
            "status": t.status, "channel": t.channel, "createdAt": t.created_at.isoformat(),
            "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
            "rating": t.csat_rating, "canRate": t.status in ("resolved", "closed") and t.csat_rating is None}


async def _mine(db: AsyncSession, user_id, ticket_id: str) -> SupportTicket:
    try:
        tid = uuid.UUID(ticket_id)
    except ValueError as e:
        raise ApiError("Ticket not found", status_code=404) from e
    t = await db.get(SupportTicket, tid)
    if t is None or t.user_id != user_id:
        raise ApiError("Ticket not found", status_code=404)
    return t


@router.get("/api/support/tickets")
async def my_tickets(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(SupportTicket).where(SupportTicket.user_id == user_id)
                             .order_by(SupportTicket.updated_at.desc()).limit(100))).scalars()
    return {"tickets": [_ticket(t) for t in rows], "categories": list(TICKET_CATEGORIES),
            "email": get_settings().support_email}


class NewTicketIn(CamelModel):
    subject: str = Field(min_length=3, max_length=200)
    category: str = "other"
    message: str = Field(min_length=2, max_length=10000)


@router.post("/api/support/tickets", status_code=201, dependencies=[Depends(rate_limit("support-new", 10, 3600))])
async def new_ticket(body: NewTicketIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    t = await service.open_ticket(db, channel="app", subject=body.subject, body=body.message, user=user,
                                  category=body.category)
    return _ticket(t)


@router.get("/api/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    t = await _mine(db, user_id, ticket_id)
    msgs = (await db.execute(select(TicketMessage).where(TicketMessage.ticket_id == t.id,
                                                         TicketMessage.internal.is_(False))
                             .order_by(TicketMessage.created_at))).scalars()
    return {**_ticket(t), "messages": [{"id": str(m.id), "author": m.author, "body": m.body,
                                        "createdAt": m.created_at.isoformat()} for m in msgs]}


class MessageIn(CamelModel):
    message: str = Field(min_length=1, max_length=10000)


@router.post("/api/support/tickets/{ticket_id}/messages", status_code=201,
             dependencies=[Depends(rate_limit("support-msg", 60, 3600))])
async def add_message(ticket_id: str, body: MessageIn, user_id=Depends(get_current_user_id),
                      db: AsyncSession = Depends(get_db)):
    t = await _mine(db, user_id, ticket_id)
    await service.customer_message(db, t, body.message, via="app")
    return _ticket(t)


@router.post("/api/support/tickets/{ticket_id}/resolve")
async def resolve(ticket_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    t = await _mine(db, user_id, ticket_id)
    if t.status in ("resolved", "closed"):
        return _ticket(t)
    return _ticket(await service.set_status(db, t, "resolved", by="customer"))


class RateIn(CamelModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)


@router.post("/api/support/tickets/{ticket_id}/rate")
async def rate(ticket_id: str, body: RateIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    t = await _mine(db, user_id, ticket_id)
    return _ticket(await service.rate(db, t, body.rating, body.comment))


@router.get("/api/public/support-rating", response_class=HTMLResponse,
            dependencies=[Depends(rate_limit("support-rate", 30, 3600))])
async def rate_by_link(t: str = Query(min_length=10, max_length=64), r: int = Query(ge=1, le=5),
                       db: AsyncSession = Depends(get_db)):
    ticket = (await db.execute(select(SupportTicket).where(SupportTicket.rating_token == t))).scalar_one_or_none()
    if ticket is None:
        return HTMLResponse(_page("This link has expired."), status_code=404)
    try:
        await service.rate(db, ticket, r)
    except ApiError as e:
        return HTMLResponse(_page(e.message), status_code=400)
    return HTMLResponse(_page(f"Thank you! You rated ticket {ticket.reference} {'★' * r}."))


def _page(text: str) -> str:
    from app.integrations import email_brand as eb

    return eb.layout(eb.heading("BukkaPay Support") + eb.paragraph(eb.esc(text)))


@router.post("/api/webhooks/support-email")
async def inbound_email(request: Request, x_signature: str | None = Header(default=None),
                        db: AsyncSession = Depends(get_db)):
    secret = get_settings().support_inbound_secret
    if not secret:
        raise ApiError("Support email webhook isn't configured", status_code=503)
    raw = await request.body()
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not x_signature or not hmac.compare_digest(expected, x_signature.removeprefix("sha256=")):
        raise ApiError("Bad signature", status_code=401)
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise ApiError("Invalid JSON") from e
    t = await service.inbound_email(db, sender=str(data.get("from", "")), subject=str(data.get("subject", "")),
                                    text=str(data.get("text", "")), name=data.get("name"),
                                    message_id=data.get("messageId") or data.get("message_id"))
    return {"ticket": t.reference}
