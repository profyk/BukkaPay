"""Help desk: chat and app tickets, the email help line (signed webhook,
threading by reference), agent replies and internal notes, resolve → rate,
reopen, and the auto-resolve / auto-close sweep."""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.base import get_session_factory
from app.models.support import SupportTicket
from app.support import service
from tests.test_network import named_admin, signup

pytestmark = pytest.mark.asyncio
SECRET = "test-inbound-secret"


async def test_chat_and_app_tickets_end_to_end(client: AsyncClient, admin: dict):
    agent = await named_admin(client, admin, "customer_support")
    u = await signup(client, "ZA", kyc_level=1)

    # In-app chat opens a ticket; further chat joins it.
    r = await client.post("/api/support-chat", json={"message": "My top-up hasn't arrived"}, headers=u["headers"])
    assert r.status_code == 201, r.text
    await client.post("/api/support-chat", json={"message": "It was R200 this morning"}, headers=u["headers"])
    mine = (await client.get("/api/support/tickets", headers=u["headers"])).json()
    assert len(mine["tickets"]) == 1 and mine["tickets"][0]["channel"] == "chat"
    tid = mine["tickets"][0]["id"]

    # Agent sees it, adds an internal note (hidden from the customer) and replies.
    inbox = (await client.get("/api/admin/support/tickets", headers=agent["headers"])).json()
    assert any(t["id"] == tid for t in inbox)
    await client.post(f"/api/admin/support/tickets/{tid}/reply", json={"body": "Check Stitch ref", "internal": True},
                      headers=agent["headers"])
    r = await client.post(f"/api/admin/support/tickets/{tid}/reply", json={"body": "Found it, crediting now."},
                          headers=agent["headers"])
    assert r.status_code == 201 and r.json()["status"] == "waiting_customer" and r.json()["firstResponseAt"]
    chat = (await client.get("/api/support-chat", headers=u["headers"])).json()
    assert any(not m.get("isUserMessage", True) and "crediting" in m["message"] for m in chat)
    view = (await client.get(f"/api/support/tickets/{tid}", headers=u["headers"])).json()
    assert all("Stitch" not in m["body"] for m in view["messages"])

    # Customer replies → open again; agent resolves → customer rates.
    await client.post(f"/api/support/tickets/{tid}/messages", json={"message": "Got it, thanks!"}, headers=u["headers"])
    assert (await client.get(f"/api/support/tickets/{tid}", headers=u["headers"])).json()["status"] == "open"
    r = await client.patch(f"/api/admin/support/tickets/{tid}", json={"status": "resolved"}, headers=agent["headers"])
    assert r.json()["status"] == "resolved"
    r = await client.post(f"/api/support/tickets/{tid}/rate", json={"rating": 5, "comment": "Fast"}, headers=u["headers"])
    assert r.json()["rating"] == 5
    stats = (await client.get("/api/admin/support/stats", headers=agent["headers"])).json()
    assert stats["csat"] is not None

    # Help form ticket; fraud words are urgent.
    r = await client.post("/api/support/tickets", json={"subject": "Payment I didn't make", "category": "payments",
                                                        "message": "Someone used my account, unauthorized payment"},
                          headers=u["headers"])
    assert r.status_code == 201
    async with get_session_factory()() as db:
        t = (await db.execute(select(SupportTicket).where(SupportTicket.id == uuid.UUID(r.json()["id"])))).scalar_one()
        assert t.priority == "urgent"


def _sign(body: bytes) -> str:
    return hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


async def test_email_help_line_and_sweep(client: AsyncClient, admin: dict, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "support_inbound_secret", SECRET)
    agent = await named_admin(client, admin, "customer_support")
    payload = {"from": "Thandi <thandi@example.com>", "subject": "Can't sign in", "text": "Help please",
               "messageId": f"<{uuid.uuid4()}@mail>"}
    raw = json.dumps(payload).encode()
    assert (await client.post("/api/webhooks/support-email", content=raw,
                              headers={"X-Signature": "bad", "Content-Type": "application/json"})).status_code == 401
    r = await client.post("/api/webhooks/support-email", content=raw,
                          headers={"X-Signature": _sign(raw), "Content-Type": "application/json"})
    assert r.status_code == 200, r.text
    ref = r.json()["ticket"]
    # Same message again (provider retry) doesn't duplicate.
    r2 = await client.post("/api/webhooks/support-email", content=raw,
                           headers={"X-Signature": _sign(raw), "Content-Type": "application/json"})
    assert r2.json()["ticket"] == ref
    # A reply with the reference threads onto the ticket; quoted history is dropped.
    reply = {"from": "thandi@example.com", "subject": f"Re: [BukkaPay #{ref}] Can't sign in",
             "text": "Still stuck\n\nOn Tue, Support wrote:\n> old text", "messageId": f"<{uuid.uuid4()}@mail>"}
    raw = json.dumps(reply).encode()
    await client.post("/api/webhooks/support-email", content=raw,
                      headers={"X-Signature": _sign(raw), "Content-Type": "application/json"})
    inbox = (await client.get("/api/admin/support/tickets", params={"q": ref}, headers=agent["headers"])).json()
    assert len(inbox) == 1 and inbox[0]["channel"] == "email"
    detail = (await client.get(f"/api/admin/support/tickets/{inbox[0]['id']}", headers=agent["headers"])).json()
    bodies = [m["body"] for m in detail["messages"]]
    assert bodies == ["Help please", "Still stuck"]

    # Agent replies; no answer for 7 days → resolved; 7 more → closed.
    await client.post(f"/api/admin/support/tickets/{inbox[0]['id']}/reply", json={"body": "Try resetting your password"},
                      headers=agent["headers"])
    async with get_session_factory()() as db:
        t = (await db.execute(select(SupportTicket).where(SupportTicket.reference == ref))).scalar_one()
        await service.sweep(db, now=datetime.now(UTC) + timedelta(days=8))
        assert t.status == "resolved" and t.rating_token
        await service.sweep(db, now=datetime.now(UTC) + timedelta(days=16))
        assert t.status == "closed"
        token = t.rating_token
        await db.commit()
    page = await client.get("/api/public/support-rating", params={"t": token, "r": 4})
    assert page.status_code == 200 and "Thank you" in page.text
