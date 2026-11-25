"""Help desk: tickets from in-app chat, the help form, email and agents.

Channels in, one inbox out:
  * in-app chat  — every chat message joins the customer's open ticket (or
                   opens one); agent replies appear back in the chat;
  * help form    — customer opens a ticket with a subject and category;
  * email        — mail to the help line (support@) arrives on a signed
                   webhook; "[BukkaPay #T-XXXXXX]" in the subject threads it,
                   otherwise a new ticket opens and we acknowledge it;
  * agent        — an agent opens a ticket for a customer (e.g. after a call).

Agent replies go back the way the customer came: chat + push notification
for app customers, email (with the reference in the subject) for everyone
with an email address. Internal notes are never shown or sent.
"""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.logging import log
from app.models.support import (
    TICKET_CATEGORIES,
    TICKET_CHANNELS,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    SupportTicket,
    TicketMessage,
)
from app.models.user import User

ACTIVE = ("open", "waiting_customer")
REOPEN_WINDOW = timedelta(days=7)
AUTO_RESOLVE_AFTER = timedelta(days=7)   # waiting on the customer this long → resolved
AUTO_CLOSE_AFTER = timedelta(days=7)     # resolved this long → closed
REF_RE = re.compile(r"#(T-[A-Z0-9]{6})")
URGENT_WORDS = re.compile(r"\b(fraud|stolen|hack(ed)?|scam|unauthori[sz]ed|didn'?t (make|authori[sz]e))\b", re.I)


def _ref() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "T-" + "".join(secrets.choice(alphabet) for _ in range(6))


def subject_line(t: SupportTicket) -> str:
    return f"[BukkaPay #{t.reference}] {t.subject}"


def _triage(text: str, category: str | None) -> tuple[str, str]:
    """Fraud reports jump the queue."""
    if URGENT_WORDS.search(text or ""):
        return "fraud" if category in (None, "", "other") else category, "urgent"
    return (category if category in TICKET_CATEGORIES else "other"), "normal"


async def open_ticket(db: AsyncSession, *, channel: str, subject: str, body: str, user: User | None = None,
                      email: str | None = None, name: str | None = None, category: str | None = None,
                      priority: str | None = None, author: str = "customer", admin_id=None,
                      email_message_id: str | None = None) -> SupportTicket:
    if channel not in TICKET_CHANNELS:
        raise ApiError("Unknown channel")
    body = (body or "").strip()
    if not body:
        raise ApiError("Write a message")
    cat, pri = _triage(f"{subject} {body}", category)
    now = datetime.now(UTC)
    t = SupportTicket(reference=_ref(), user_id=user.id if user else None,
                      requester_email=(email or (user.email if user else None)),
                      requester_name=(name or (user.name if user else None)), channel=channel,
                      subject=(subject or body.splitlines()[0])[:200], category=cat,
                      priority=priority if priority in TICKET_PRIORITIES else pri, status="open",
                      last_customer_at=now if author == "customer" else None)
    db.add(t)
    await db.flush()
    db.add(TicketMessage(ticket_id=t.id, author=author, admin_id=admin_id, body=body, via=channel,
                         email_message_id=email_message_id))
    await db.flush()
    if author == "customer" and channel != "chat":
        await _acknowledge(db, t)
    return t


async def active_ticket_for(db: AsyncSession, user_id) -> SupportTicket | None:
    return (await db.execute(select(SupportTicket).where(
        SupportTicket.user_id == user_id, SupportTicket.status.in_(ACTIVE))
        .order_by(SupportTicket.updated_at.desc()))).scalars().first()


async def customer_message(db: AsyncSession, t: SupportTicket, body: str, *, via: str,
                           email_message_id: str | None = None) -> TicketMessage:
    body = (body or "").strip()
    if not body:
        raise ApiError("Write a message")
    if t.status == "closed":
        raise ApiError("This ticket is closed. Start a new conversation.", status_code=409)
    now = datetime.now(UTC)
    m = TicketMessage(ticket_id=t.id, author="customer", body=body, via=via, email_message_id=email_message_id)
    db.add(m)
    t.status, t.last_customer_at, t.resolved_at = "open", now, None
    if URGENT_WORDS.search(body) and t.priority != "urgent":
        t.priority = "urgent"
    await db.flush()
    return m


async def chat_message(db: AsyncSession, user: User, body: str) -> SupportTicket:
    """In-app chat: attach to the open ticket, reopen a recently resolved
    one, or open a new one."""
    t = await active_ticket_for(db, user.id)
    if t is None:
        recent = (await db.execute(select(SupportTicket).where(
            SupportTicket.user_id == user.id, SupportTicket.status == "resolved", SupportTicket.channel == "chat",
            SupportTicket.resolved_at >= datetime.now(UTC) - REOPEN_WINDOW)
            .order_by(SupportTicket.resolved_at.desc()))).scalars().first()
        t = recent
    if t is None:
        return await open_ticket(db, channel="chat", subject=body.strip().splitlines()[0][:80] or "Chat",
                                 body=body, user=user)
    await customer_message(db, t, body, via="chat")
    return t


async def agent_reply(db: AsyncSession, t: SupportTicket, body: str, *, admin_id, internal: bool = False,
                      status_after: str | None = None) -> TicketMessage:
    body = (body or "").strip()
    if not body:
        raise ApiError("Write a reply")
    if t.status == "closed":
        raise ApiError("This ticket is closed", status_code=409)
    now = datetime.now(UTC)
    m = TicketMessage(ticket_id=t.id, author="agent", admin_id=admin_id, body=body, internal=internal,
                      via="note" if internal else ("chat" if t.channel == "chat" else "email"))
    db.add(m)
    if not internal:
        t.last_agent_at = now
        t.first_response_at = t.first_response_at or now
        t.status = status_after if status_after in ("open", "waiting_customer", "resolved") else "waiting_customer"
        if t.assigned_admin_id is None:
            t.assigned_admin_id = admin_id
        if t.status == "resolved":
            t.resolved_at = now
    await db.flush()
    if not internal:
        await _deliver(db, t, m, resolved=t.status == "resolved")
    return m


async def set_status(db: AsyncSession, t: SupportTicket, status: str, *, by: str = "agent") -> SupportTicket:
    if status not in TICKET_STATUSES:
        raise ApiError("Unknown status")
    now = datetime.now(UTC)
    if status == "resolved" and t.status != "resolved":
        t.resolved_at = now
        db.add(TicketMessage(ticket_id=t.id, author="system", body=f"Marked resolved by the {by}.", via="note",
                             internal=False))
        await db.flush()
        await _notify_resolved(db, t)
    if status == "closed":
        t.closed_at = now
    if status in ACTIVE:
        t.resolved_at = t.closed_at = None
    t.status = status
    await db.flush()
    return t


async def rate(db: AsyncSession, t: SupportTicket, rating: int, comment: str | None = None) -> SupportTicket:
    if t.status not in ("resolved", "closed"):
        raise ApiError("You can rate the conversation once it's resolved")
    if not 1 <= int(rating) <= 5:
        raise ApiError("Rate from 1 to 5")
    t.csat_rating, t.csat_comment = int(rating), (comment or "")[:1000] or t.csat_comment
    await db.flush()
    return t


async def record_legacy_agent_chat(db: AsyncSession, user_id, text: str) -> None:
    """A reply sent from the older Support Chat page: record it on the ticket
    (the chat message and notification are sent by chat_service)."""
    t = await active_ticket_for(db, user_id)
    if t is None:
        return
    now = datetime.now(UTC)
    db.add(TicketMessage(ticket_id=t.id, author="agent", body=text, via="chat", delivered_at=now))
    t.last_agent_at, t.first_response_at, t.status = now, t.first_response_at or now, "waiting_customer"
    await db.flush()


# ─── email help line ────────────────────────────────────────────────────────


async def inbound_email(db: AsyncSession, *, sender: str, subject: str, text: str, name: str | None = None,
                        message_id: str | None = None) -> SupportTicket:
    sender = (sender or "").strip().lower()
    m = re.search(r"[\w.+-]+@[\w-]+(\.[\w-]+)+", sender)
    if not m:
        raise ApiError("No sender address")
    sender = m.group(0)
    if message_id and (await db.execute(select(TicketMessage.id).where(
            TicketMessage.email_message_id == message_id))).first():
        t = (await db.execute(select(SupportTicket).join(TicketMessage, TicketMessage.ticket_id == SupportTicket.id)
                              .where(TicketMessage.email_message_id == message_id))).scalars().first()
        return t  # already stored (provider retry)
    body = _strip_quoted(text)
    user = (await db.execute(select(User).where(func.lower(User.email) == sender,
                                                User.deleted_at.is_(None)))).scalar_one_or_none()
    ref = REF_RE.search(subject or "")
    if ref:
        t = (await db.execute(select(SupportTicket).where(SupportTicket.reference == ref.group(1)))).scalar_one_or_none()
        same_person = t is not None and ((t.requester_email or "").lower() == sender
                                         or (user is not None and t.user_id == user.id))
        if t is not None and same_person and t.status != "closed":
            await customer_message(db, t, body, via="email", email_message_id=message_id)
            return t
    clean_subject = re.sub(r"^\s*((re|fwd?|aw)\s*:\s*)+", "", subject or "", flags=re.I)
    clean_subject = re.sub(r"\[BukkaPay #T-[A-Z0-9]{6}\]\s*", "", clean_subject).strip() or "Email to support"
    return await open_ticket(db, channel="email", subject=clean_subject, body=body, user=user, email=sender, name=name,
                             email_message_id=message_id)


def _strip_quoted(text: str) -> str:
    """Keep the new part of an email reply, not the quoted history."""
    lines = []
    for line in (text or "").splitlines():
        if re.match(r"^\s*>", line) or re.match(r"^\s*On .+wrote:\s*$", line) or line.strip() == "--":
            break
        lines.append(line)
    out = "\n".join(lines).strip()
    return (out or (text or "").strip())[:20000]


# ─── delivery ───────────────────────────────────────────────────────────────


async def _deliver(db: AsyncSession, t: SupportTicket, m: TicketMessage, *, resolved: bool) -> None:
    if t.user_id and t.channel in ("chat", "app"):
        from app.models.chat import ChatMessage
        from app.models.enums import NotificationType
        from app.services import notification_service

        if t.channel == "chat":
            db.add(ChatMessage(user_id=t.user_id, message=m.body, is_user_message=False, read=False))
        await notification_service.create_notification(
            db, t.user_id, NotificationType.INFO, f"Support replied ({t.reference})",
            m.body if len(m.body) <= 120 else m.body[:117] + "...", related_id=str(t.id), related_type="support_ticket")
    if t.requester_email and (t.channel in ("email", "phone", "web") or resolved):
        await _email(t, m.body + ("\n\nWe've marked this as resolved. Just reply if you need anything else." if resolved else ""),
                     rate_links=resolved)
    m.delivered_at = datetime.now(UTC)
    await db.flush()


async def _acknowledge(db: AsyncSession, t: SupportTicket) -> None:
    if t.requester_email:
        await _email(t, f"Thanks for contacting BukkaPay. We've received your message and opened ticket {t.reference}. "
                        "A member of our team will reply as soon as possible, usually within one business day.\n\n"
                        "Never share your PIN, password or one-time codes with anyone, including us.")


async def _notify_resolved(db: AsyncSession, t: SupportTicket) -> None:
    if t.user_id:
        from app.models.enums import NotificationType
        from app.services import notification_service

        await notification_service.create_notification(
            db, t.user_id, NotificationType.SUCCESS, f"Resolved: {t.subject[:60]}",
            "We've marked your support request as resolved. Tell us how we did.", related_id=str(t.id),
            related_type="support_ticket")
    if t.requester_email:
        await _email(t, "We've marked your request as resolved. Just reply to this email if you need anything else.",
                     rate_links=True)


async def _email(t: SupportTicket, text: str, *, rate_links: bool = False) -> None:
    from app.integrations import email_brand as eb
    from app.integrations.resend_client import send_resend_email

    settings = get_settings()
    html = eb.heading(t.subject) + "".join(eb.paragraph(eb.esc(p).replace("\n", "<br>")) for p in text.split("\n\n"))
    if rate_links:
        if not t.rating_token:
            t.rating_token = secrets.token_urlsafe(24)
        base = f"{settings.api_base_url.rstrip('/')}/api/public/support-rating?t={t.rating_token}&r="
        html += eb.paragraph("How did we do? " + " ".join(
            f'<a href="{base}{n}" style="font-size:20px;text-decoration:none;">{"★" * n}</a>' for n in range(5, 0, -1)))
    html += eb.note(f"Ticket {t.reference}. Reply to this email to add to it.")
    try:
        await send_resend_email(to=t.requester_email, subject=subject_line(t), html=html, text=text,
                                from_name="BukkaPay Support", from_email=settings.support_email,
                                reply_to=settings.support_email)
    except Exception as e:  # noqa: BLE001 - email down must not lose the reply (it's stored)
        log.warning("support_email_failed", ticket=t.reference, error=str(e)[:200])


# ─── housekeeping ───────────────────────────────────────────────────────────


async def sweep(db: AsyncSession, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    resolved = (await db.execute(select(SupportTicket).where(
        SupportTicket.status == "waiting_customer", SupportTicket.last_agent_at < now - AUTO_RESOLVE_AFTER)
        .limit(500))).scalars().all()
    for t in resolved:
        db.add(TicketMessage(ticket_id=t.id, author="system", body="No reply for 7 days, so we've marked this resolved.",
                             via="note"))
        t.status, t.resolved_at = "resolved", now
        await _notify_resolved(db, t)
    closed = (await db.execute(select(SupportTicket).where(
        SupportTicket.status == "resolved", SupportTicket.resolved_at < now - AUTO_CLOSE_AFTER).limit(500))).scalars().all()
    for t in closed:
        t.status, t.closed_at = "closed", now
    await db.flush()
    return {"resolved": len(resolved), "closed": len(closed)}
