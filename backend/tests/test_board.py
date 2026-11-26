"""Board portal: owner-only invitations, two-step sign-in, read-only
aggregates, management accounts and updates."""

import re

import pytest
from httpx import AsyncClient

from tests.test_network import named_admin

pytestmark = pytest.mark.asyncio


async def _code(monkeypatch) -> list[str]:
    sent: list[str] = []

    async def fake_email(to, subject, paras, **kw):
        if kw.get("code"):
            sent.append(kw["code"])
        return True

    from app.board import service

    monkeypatch.setattr(service, "_email", fake_email)
    return sent


async def test_board_portal_end_to_end(client: AsyncClient, admin: dict, monkeypatch):
    codes = await _code(monkeypatch)
    monkeypatch.setattr("app.services.fx_feed.cached_mids", _no_rates)

    # Only the owner invites; even the CEO can't.
    ceo = await named_admin(client, admin, "ceo")
    body = {"email": "investor@example.com", "name": "Ada Investor", "organisation": "Seed Fund", "title": "Investor"}
    assert (await client.post("/api/admin/board/members", json=body, headers=ceo["headers"])).status_code == 403
    r = await client.post("/api/admin/board/members", json=body, headers=admin["headers"])
    assert r.status_code == 201, r.text
    token = re.search(r"token=([^&]+)", r.json()["link"]).group(1)

    # Accept, then sign in: password, then emailed code.
    assert (await client.post("/api/board/auth/accept", json={"token": token, "password": "short"})).status_code in (400, 422)
    assert (await client.post("/api/board/auth/accept", json={"token": token, "password": "a-long-password-1"})).status_code == 200
    assert (await client.post("/api/board/auth/accept", json={"token": token, "password": "a-long-password-1"})).status_code == 400
    bad = await client.post("/api/board/auth/login", json={"email": body["email"], "password": "wrong-password"})
    assert bad.status_code == 401
    ok = await client.post("/api/board/auth/login", json={"email": body["email"], "password": "a-long-password-1"})
    assert ok.status_code == 200 and codes
    wrong = await client.post("/api/board/auth/verify", json={"email": body["email"], "code": "000000" if codes[-1] != "000000" else "111111"})
    assert wrong.status_code == 401
    v = await client.post("/api/board/auth/verify", json={"email": body["email"], "code": codes[-1]})
    assert v.status_code == 200, v.text
    h = {"Authorization": f"Bearer {v.json()['token']}"}

    # Board token can't reach the admin API; admin data isn't in the board API.
    assert (await client.get("/api/admin/users", headers=h)).status_code in (401, 403)

    # Owner enters management accounts; the board sees P&L and runway.
    from datetime import date

    month = date.today().replace(day=1).isoformat()
    r = await client.put("/api/admin/board/financials", headers=admin["headers"], json={
        "month": month, "currency": "USD", "staffCosts": "8000", "technologyCosts": "2000", "cashBalance": "120000",
        "headcount": 6})
    assert r.status_code == 200, r.text
    o = await client.get("/api/board/overview", headers=h)
    assert o.status_code == 200, o.text
    data = o.json()
    cur = data["series"][-1]
    assert cur["operatingCosts"] == 10000.0 and cur["cash"] == 120000.0
    assert data["kpis"]["runwayMonths"] is not None and data["kpis"]["users"] >= 0
    text = o.text.lower()
    assert "@example.com" not in text  # no personal data, not even the member's own email

    # Updates: drafts are hidden, published ones show.
    await client.post("/api/admin/board/updates", headers=admin["headers"],
                      json={"title": "Draft", "body": "Not ready for the board yet."})
    await client.post("/api/admin/board/updates", headers=admin["headers"],
                      json={"title": "November update", "period": "November 2026", "body": "Growth was strong.", "publish": True})
    titles = [u["title"] for u in (await client.get("/api/board/updates", headers=h)).json()]
    assert "November update" in titles and "Draft" not in titles
    csv = await client.get("/api/board/export.csv", headers=h)
    assert csv.status_code == 200 and "month,signups" in csv.text

    # Access log, then revoke ends the session at once.
    members = (await client.get("/api/admin/board/members", headers=admin["headers"])).json()
    assert any(a["action"] == "viewed_dashboard" for a in members["access"])
    mid = members["members"][0]["id"]
    await client.post(f"/api/admin/board/members/{mid}/revoke", headers=admin["headers"])
    assert (await client.get("/api/board/overview", headers=h)).status_code == 401


async def _no_rates():
    return None


async def test_owner_opens_portal_from_admin_only(client: AsyncClient, admin: dict, monkeypatch):
    monkeypatch.setattr("app.services.fx_feed.cached_mids", _no_rates)
    ceo = await named_admin(client, admin, "ceo")
    assert (await client.post("/api/admin/board/owner-pass", headers=ceo["headers"])).status_code == 403

    r = await client.post("/api/admin/board/owner-pass", headers=admin["headers"])
    assert r.status_code == 200, r.text
    code = r.json()["url"].split("#", 1)[1]
    s = await client.post("/api/board/auth/owner", json={"code": code})
    assert s.status_code == 200, s.text
    assert s.json()["member"]["isOwner"] is True
    h = {"Authorization": f"Bearer {s.json()['token']}"}
    assert (await client.get("/api/board/overview", headers=h)).status_code == 200
    # Single use.
    assert (await client.post("/api/board/auth/owner", json={"code": code})).status_code == 401

    # The owner can't be revoked, re-invited, or signed in with a password on the board page.
    from app.governance.owner import OWNER_EMAIL

    members = (await client.get("/api/admin/board/members", headers=admin["headers"])).json()["members"]
    me = next(m for m in members if m["email"] == OWNER_EMAIL)
    assert me["status"] == "owner"
    assert (await client.post(f"/api/admin/board/members/{me['id']}/revoke", headers=admin["headers"])).status_code == 403
    assert (await client.post("/api/admin/board/members", headers=admin["headers"],
                              json={"email": OWNER_EMAIL, "name": "Owner"})).status_code == 409
    assert (await client.post("/api/board/auth/login", json={"email": OWNER_EMAIL, "password": "anything-at-all"})).status_code == 401
