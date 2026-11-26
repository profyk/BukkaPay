"""BukkaPay Boardroom: roles and deny-by-default, MFA, investor isolation,
financial integrity rules, governance (votes), documents, reports, audit."""

import re
import time
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.business.mfa import _totp
from tests.conftest import fund_card

pytestmark = pytest.mark.asyncio


async def _no_rates():
    return None


@pytest.fixture(autouse=True)
def _quiet(monkeypatch):
    sent = []

    async def fake_email(to, subject, paras, **kw):
        sent.append({"to": to, "subject": subject, "code": kw.get("code"), "button": kw.get("button")})
        return True

    monkeypatch.setattr("app.board.service._email", fake_email)
    monkeypatch.setattr("app.services.fx_feed.cached_mids", _no_rates)
    return sent


async def owner_session(client: AsyncClient, admin: dict) -> dict:
    r = await client.post("/api/admin/board/owner-pass", headers=admin["headers"])
    assert r.status_code == 200, r.text
    s = await client.post("/api/board/auth/owner", json={"code": r.json()["url"].split("#", 1)[1]})
    assert s.status_code == 200, s.text
    return {"Authorization": f"Bearer {s.json()['token']}"}


_step = {"n": 0}


def _code(secret: str) -> str:
    """A fresh TOTP code each call (codes are single-use), within the ±1 step window."""
    _step["n"] = (_step["n"] + 1) % 3
    return _totp(secret, int(time.time()) + (_step["n"] - 1) * 30)


async def member(client: AsyncClient, owner: dict, role: str, name: str | None = None) -> dict:
    from app.core.redis import get_redis

    email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
    r = await client.post("/api/board/users", headers=owner, json={"email": email, "name": name or role.title(),
                                                                   "role": role})
    assert r.status_code == 201, r.text
    token = re.search(r"token=([^&]+)", r.json()["link"]).group(1)
    st = (await client.post("/api/board/auth/accept/start", json={"token": token})).json()
    secret = st["secret"]
    a = await client.post("/api/board/auth/accept", json={"token": token, "password": "Board-pass-2026!",
                                                          "otp": _totp(secret, int(time.time()))})
    assert a.status_code == 200, a.text
    assert (await client.post("/api/board/auth/login", json={"email": email, "password": "Board-pass-2026!"})).json()["method"] == "totp"
    await get_redis().flushall()  # clear used-code markers between helpers
    v = await client.post("/api/board/auth/verify", json={"email": email, "code": _totp(secret, int(time.time()))})
    assert v.status_code == 200, v.text
    return {"headers": {"Authorization": f"Bearer {v.json()['token']}"}, "id": r.json()["user"]["id"], "email": email,
            "secret": secret, "me": v.json()["member"]}


# ─── access control ─────────────────────────────────────────────────────────

async def test_deny_by_default_and_role_boundaries(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    inv = await member(client, owner, "investor")
    ned = await member(client, owner, "non_executive_director")
    obs = await member(client, owner, "financial_observer")

    # Unauthenticated: everything refused.
    for path in ("/api/board/dashboard", "/api/board/financials?start=2026-01-01&end=2026-03-31", "/api/board/users",
                 "/api/board/documents", "/api/board/resolutions", "/api/board/investors"):
        assert (await client.get(path)).status_code == 401, path

    # Boardroom tokens never reach the operational admin or customer APIs.
    for h in (inv["headers"], ned["headers"], owner):
        assert (await client.get("/api/admin/users", headers=h)).status_code in (401, 403)
        assert (await client.get("/api/admin/board/members", headers=h)).status_code in (401, 403)
        assert (await client.get("/api/cards", headers=h)).status_code in (401, 403)

    # Investor: approved summaries yes; detailed financials, others' records, management no.
    assert (await client.get("/api/board/dashboard", headers=inv["headers"])).status_code == 200
    assert (await client.get("/api/board/adoption", headers=inv["headers"])).status_code == 200
    assert (await client.get("/api/board/investments/me", headers=inv["headers"])).status_code == 200
    for path in ("/api/board/financials?start=2026-01-01&end=2026-03-31", "/api/board/investors", "/api/board/users",
                 "/api/board/custodians", "/api/board/risks", "/api/board/meetings", "/api/board/audit",
                 "/api/board/cross-border", "/api/board/revenue"):
        assert (await client.get(path, headers=inv["headers"])).status_code == 403, path
    # Non-exec director: oversight yes, management no.
    assert (await client.get("/api/board/financials?start=2026-01-01&end=2026-03-31", headers=ned["headers"])).status_code == 200
    assert (await client.get("/api/board/custodians", headers=ned["headers"])).status_code == 200
    assert (await client.post("/api/board/meetings", headers=ned["headers"], json={
        "title": "Unauthorised", "scheduledAt": datetime.now(UTC).isoformat()})).status_code == 403
    assert (await client.get("/api/board/users", headers=ned["headers"])).status_code == 403
    # Observer: nothing until granted, then only what was granted.
    assert (await client.get("/api/board/dashboard", headers=obs["headers"])).status_code == 403
    r = await client.patch(f"/api/board/users/{obs['id']}", headers=owner,
                           json={"role": "financial_observer", "grants": ["dashboard.view", "financials.view"]})
    assert r.status_code == 200, r.text
    assert (await client.get("/api/board/dashboard", headers=obs["headers"])).status_code == 200
    assert (await client.get("/api/board/adoption", headers=obs["headers"])).status_code == 403
    # Owner-only permissions can't be granted; investors can't be given other investors' records.
    assert (await client.patch(f"/api/board/users/{obs['id']}", headers=owner,
                               json={"role": "financial_observer", "grants": ["users.manage"]})).status_code == 422
    assert (await client.patch(f"/api/board/users/{inv['id']}", headers=owner,
                               json={"role": "investor", "grants": ["investors.view"]})).status_code == 422
    # Nobody can change their own role: the member endpoint is owner-only and roles come from the DB.
    assert (await client.patch(f"/api/board/users/{inv['id']}", headers=inv["headers"],
                               json={"role": "chair"})).status_code == 403
    me = (await client.get("/api/board/auth/me", headers={**inv["headers"], "X-Role": "chair"})).json()
    assert me["role"] == "investor"


async def test_mfa_required_and_legacy_members_must_enrol(client: AsyncClient, admin: dict, _quiet):
    """A member without an authenticator (joined before it was required) gets an
    emailed code once, then can't open anything until they set one up."""
    from sqlalchemy import update

    from app.db.base import get_session_factory
    from app.models.board import BoardMember

    owner = await owner_session(client, admin)
    m = await member(client, owner, "investor")
    async with get_session_factory()() as db:
        await db.execute(update(BoardMember).where(BoardMember.email == m["email"]).values(
            mfa_secret=None, mfa_enabled_at=None))
        await db.commit()
    r = await client.post("/api/board/auth/login", json={"email": m["email"], "password": "Board-pass-2026!"})
    assert r.json()["method"] == "email"
    code = next(x["code"] for x in reversed(_quiet) if x["code"])
    v = await client.post("/api/board/auth/verify", json={"email": m["email"], "code": code})
    assert v.status_code == 200 and v.json()["member"]["mfaSetupRequired"] is True
    h = {"Authorization": f"Bearer {v.json()['token']}"}
    assert (await client.get("/api/board/dashboard", headers=h)).status_code == 403
    setup = (await client.post("/api/board/auth/mfa/setup", headers=h)).json()
    assert (await client.post("/api/board/auth/mfa/confirm", headers=h, json={"otp": "000000" if _totp(setup["secret"], int(time.time())) != "000000" else "111111"})).status_code == 400
    ok = await client.post("/api/board/auth/mfa/confirm", headers=h, json={"otp": _totp(setup["secret"], int(time.time()))})
    assert ok.status_code == 200 and ok.json()["mfaReady"] is True
    assert (await client.get("/api/board/dashboard", headers=h)).status_code == 200


async def test_totp_codes_are_single_use_and_lockout(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    m = await member(client, owner, "investor")
    code = _totp(m["secret"], int(time.time()) + 30)
    await client.post("/api/board/auth/login", json={"email": m["email"], "password": "Board-pass-2026!"})
    assert (await client.post("/api/board/auth/verify", json={"email": m["email"], "code": code})).status_code == 200
    await client.post("/api/board/auth/login", json={"email": m["email"], "password": "Board-pass-2026!"})
    assert (await client.post("/api/board/auth/verify", json={"email": m["email"], "code": code})).status_code == 401
    # Failed sign-ins are logged for the owner.
    hist = (await client.get(f"/api/board/users/{m['id']}/history", headers=owner)).json()
    assert any(a["action"] == "sign_in_failed" for a in hist["access"])


async def test_password_reset_needs_authenticator(client: AsyncClient, admin: dict, _quiet):
    owner = await owner_session(client, admin)
    m = await member(client, owner, "investor")
    assert (await client.post("/api/board/auth/forgot", json={"email": m["email"]})).status_code == 200
    assert (await client.post("/api/board/auth/forgot", json={"email": "nobody@example.com"})).status_code == 200
    link = next(x["button"][1] for x in reversed(_quiet) if x["button"] and "/reset?" in x["button"][1])
    token = link.split("token=")[1]
    assert (await client.post("/api/board/auth/reset", json={"token": token, "password": "New-board-pass-1"})).status_code == 400
    r = await client.post("/api/board/auth/reset", json={"token": token, "password": "New-board-pass-1",
                                                         "otp": _totp(m["secret"], int(time.time()) - 30)})
    assert r.status_code == 200, r.text
    # Old sessions ended; new password works.
    assert (await client.get("/api/board/dashboard", headers=m["headers"])).status_code == 401
    assert (await client.post("/api/board/auth/login", json={"email": m["email"], "password": "New-board-pass-1"})).status_code == 200


async def test_suspend_reactivate_and_session_revocation(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    m = await member(client, owner, "investor")
    assert (await client.post(f"/api/board/users/{m['id']}/suspend", headers=owner, json={"reason": "Review"})).status_code == 200
    assert (await client.get("/api/board/dashboard", headers=m["headers"])).status_code == 401
    assert (await client.post("/api/board/auth/login", json={"email": m["email"], "password": "Board-pass-2026!"})).status_code == 401
    assert (await client.post(f"/api/board/users/{m['id']}/reactivate", headers=owner)).status_code == 200
    assert (await client.post("/api/board/auth/login", json={"email": m["email"], "password": "Board-pass-2026!"})).status_code == 200
    users = (await client.get("/api/board/users", headers=owner)).json()["users"]
    me = next(u for u in users if u["id"] == m["id"])
    assert me["mfa"] == "authenticator" and "password" not in str(me).lower().replace("password_", "")


# ─── investor isolation ─────────────────────────────────────────────────────

async def test_investor_sees_only_own_records(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    a = await member(client, owner, "investor", "Investor A")
    b = await member(client, owner, "investor", "Investor B")
    rnd = await client.post("/api/board/rounds", headers=owner, json={
        "name": "Seed", "instrument": "equity", "currency": "USD", "targetAmount": "500000", "status": "open"})
    assert rnd.status_code == 201, rnd.text
    # A valuation needs its approval reference.
    assert (await client.post("/api/board/rounds", headers=owner, json={
        "name": "Bad", "instrument": "equity", "targetAmount": "1", "valuationPreMoney": "1000000"})).status_code == 422
    ids = {}
    for who, amt, shares in ((a, "100000", "1000"), (b, "250000", "3000")):
        p = await client.post("/api/board/investors", headers=owner, json={"legalName": f"Fund {who['me']['name']}",
                                                                           "entityType": "fund", "memberId": who["id"]})
        assert p.status_code == 201, p.text
        ids[who["id"]] = p.json()["id"]
        assert (await client.post(f"/api/board/investors/{p.json()['id']}/investments", headers=owner, json={
            "roundId": rnd.json()["id"], "instrument": "equity", "currency": "USD", "committedAmount": amt,
            "receivedAmount": "50000"})).status_code == 201
        assert (await client.post(f"/api/board/investors/{p.json()['id']}/shareholdings", headers=owner, json={
            "shares": shares, "effectiveDate": "2026-06-01", "legalReference": "Register entry"})).status_code == 201
    # Received can't exceed committed; currency must match the round.
    assert (await client.post(f"/api/board/investors/{ids[a['id']]}/investments", headers=owner, json={
        "instrument": "safe", "currency": "USD", "committedAmount": "10", "receivedAmount": "20"})).status_code == 422
    assert (await client.post(f"/api/board/investors/{ids[a['id']]}/investments", headers=owner, json={
        "roundId": rnd.json()["id"], "instrument": "equity", "currency": "ZAR", "committedAmount": "10"})).status_code == 422

    mine = (await client.get("/api/board/investments/me", headers=a["headers"])).json()
    assert [i["committed"] for i in mine["investments"]] == ["100000.00"]
    assert mine["totalShares"] == "1000" and mine["ownershipPercent"] == "25.0000"
    text = str(mine) + str((await client.get("/api/board/fundraising", headers=a["headers"])).json())
    assert "Investor B" not in text and "250000.00" not in text and b["email"] not in text
    # Fundraising totals are aggregates only.
    fr = (await client.get("/api/board/fundraising", headers=a["headers"])).json()["rounds"][0]
    assert fr["committed"] == "350000.00" and fr["remaining"] == "150000.00" and fr["progress"] == "70.0"
    # No id-based way to reach another investor's records.
    assert (await client.get(f"/api/board/investors?id={ids[b['id']]}", headers=a["headers"])).status_code == 403


# ─── financial integrity ────────────────────────────────────────────────────

async def test_revenue_is_not_volume_and_currencies_are_never_mixed(client: AsyncClient, admin: dict, user: dict):
    from app.db.base import get_session_factory
    from app.ledger import chart, posting

    owner = await owner_session(client, admin)
    c1 = (await client.get("/api/cards", headers=user["headers"])).json()
    card1 = c1[0]
    await fund_card(card1["id"], "1000.00")
    ccy = card1["currency"]

    async def figures():
        rev = (await client.get("/api/board/revenue", headers=owner)).json()
        r = {x["currency"]: Decimal(x["amount"]) for x in rev["revenueByCurrency"]}.get(ccy, Decimal(0))
        g = {x["currency"]: Decimal(x["amount"]) for x in rev["grossTransactionVolumeByCurrency"]}.get(ccy, Decimal(0))
        return rev, r, g

    _, rev0, gtv0 = await figures()
    # A 100.00 withdrawal with a 2.00 fee: volume grows by 100, revenue by exactly 2.
    async with get_session_factory()() as db:
        from app.ledger import accounts as la
        from app.models.wallet import WalletCard

        wc = await db.get(WalletCard, uuid.UUID(card1["id"]))
        await posting.post(db, kind="withdrawal", description="test withdrawal", legs=[
            posting.debit(await la.wallet_account(db, wc), Decimal("100.00")),
            posting.credit(await la.provider_clearing(db, "test", ccy), Decimal("98.00")),
            posting.credit(await chart.sys_account(db, "SYS_REVENUE_CASHOUT", ccy), Decimal("2.00"))],
            details={})
        await db.commit()
    rev, rev1, gtv1 = await figures()
    assert rev1 - rev0 == Decimal("2.00")
    assert gtv1 - gtv0 == Decimal("100.00")  # volume is never revenue
    # Money values are strings (decimal-safe), never floats.
    assert all(isinstance(r["amount"], str) for r in rev["revenueByCurrency"])
    # Wallet balances are liabilities, never income.
    w = (await client.get("/api/board/wallets", headers=owner)).json()
    assert "customer_liabilities" in w["financialModel"]
    assert "liability" in w["financialModelLabels"]["customer_liabilities"]
    # With no exchange rates, nothing is converted: unconverted currencies are listed, not guessed.
    assert rev["converted"]["methodology"]["unconverted"] or card1["currency"] == "USD"
    cur = (await client.get("/api/board/currencies", headers=owner)).json()
    assert "never" in cur["note"].lower() or "nothing" in cur["note"].lower()


async def test_historical_periods_use_their_own_rates(client: AsyncClient, admin: dict):
    from app.board.money import RateBook
    from app.models.boardroom import BoardFxRate

    rows = [BoardFxRate(rate_date=date(2026, 1, 31), base="USD", currency="ZAR", mid=Decimal("18"), source="t",
                        captured_at=datetime(2026, 1, 31, tzinfo=UTC)),
            BoardFxRate(rate_date=date(2026, 1, 31), base="USD", currency="USD", mid=Decimal("1"), source="t",
                        captured_at=datetime(2026, 1, 31, tzinfo=UTC)),
            BoardFxRate(rate_date=date(2026, 6, 30), base="USD", currency="ZAR", mid=Decimal("20"), source="t",
                        captured_at=datetime(2026, 6, 30, tzinfo=UTC)),
            BoardFxRate(rate_date=date(2026, 6, 30), base="USD", currency="USD", mid=Decimal("1"), source="t",
                        captured_at=datetime(2026, 6, 30, tzinfo=UTC))]
    b = RateBook("USD", rows)
    assert b.convert(Decimal("180"), "ZAR", date(2026, 2, 28)) == Decimal("10")  # January rate, not June's
    assert b.convert(Decimal("200"), "ZAR", date(2026, 7, 31)) == Decimal("10")
    assert b.convert(Decimal("100"), "ZAR", date(2025, 12, 31)) is None  # no rate yet: not guessed
    line = b.convert_line(Decimal("180"), "ZAR", date(2026, 2, 28))
    assert line["originalAmount"] == "180.00" and line["originalCurrency"] == "ZAR" and line["rateDate"] == "2026-01-31"
    assert line["convertedAmount"] == "10.00" and line["reportingCurrency"] == "USD" and line["rateSource"] == "t"
    assert b.methodology()["unconverted"] == [{"currency": "ZAR", "period": "2025-12-31"}]


async def test_statements_label_missing_accounts_and_locked_periods(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    st = (await client.get("/api/board/financials?start=2020-01-01&end=2020-03-31", headers=owner)).json()
    assert st["status"] == "unavailable" and st["balanceSheet"] is None
    r = await client.put("/api/board/settings/accounts", headers=owner, json={
        "month": "2020-02-01", "currency": "USD", "staffCosts": "1000", "cloudCosts": "200", "cashBalance": "5000",
        "accountsStatus": "management"})
    assert r.status_code == 200, r.text
    st = (await client.get("/api/board/financials?start=2020-01-01&end=2020-03-31", headers=owner)).json()
    assert st["status"] == "incomplete"
    feb = next(m for m in st["months"] if m["month"] == "2020-02-01")
    assert feb["operatingExpenses"] == "1200.00" and feb["netProfitComplete"] is False
    assert st["balanceSheet"]["complete"] is False
    # Lock the quarter: its accounts can no longer change.
    assert (await client.put("/api/board/settings/periods", headers=owner, json={
        "kind": "quarter", "startDate": "2020-01-01", "status": "locked"})).status_code == 200
    assert (await client.put("/api/board/settings/accounts", headers=owner, json={
        "month": "2020-02-01", "currency": "USD", "staffCosts": "1"})).status_code == 409
    assert (await client.put("/api/board/settings/periods", headers=owner, json={
        "kind": "quarter", "startDate": "2020-01-01", "status": "open"})).status_code == 409


async def test_reports_are_frozen_and_corrections_are_versions(client: AsyncClient, admin: dict):
    from sqlalchemy import text

    from app.db.base import get_session_factory

    owner = await owner_session(client, admin)
    inv = await member(client, owner, "investor")
    r = await client.post("/api/board/reports", headers=owner, json={
        "kind": "monthly", "title": "October 2026", "periodStart": "2026-10-01", "periodEnd": "2026-10-31",
        "summary": "Board summary."})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    # Investors can't see drafts or publish.
    assert all(x["id"] != rid for x in (await client.get("/api/board/reports", headers=inv["headers"])).json()["reports"])
    assert (await client.post(f"/api/board/reports/{rid}/approve", headers=inv["headers"])).status_code == 403
    assert (await client.post(f"/api/board/reports/{rid}/publish", headers=owner)).status_code == 409  # approve first
    assert (await client.post(f"/api/board/reports/{rid}/approve", headers=owner)).status_code == 200
    p = await client.post(f"/api/board/reports/{rid}/publish", headers=owner)
    assert p.status_code == 200 and len(p.json()["contentSha256"]) == 64
    pdf = await client.get(f"/api/board/reports/{rid}/pdf", headers=inv["headers"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    # The database refuses edits and deletes of a published report.
    async with get_session_factory()() as db:
        with pytest.raises(Exception):
            await db.execute(text("UPDATE board_report_publications SET summary='changed' WHERE id=:i"), {"i": rid})
            await db.commit()
    async with get_session_factory()() as db:
        with pytest.raises(Exception):
            await db.execute(text("DELETE FROM board_report_publications WHERE id=:i"), {"i": rid})
            await db.commit()
    assert (await client.delete(f"/api/board/reports/{rid}", headers=owner)).status_code == 409
    # A correction is a new version that supersedes the old one.
    c = await client.post(f"/api/board/reports/{rid}/correct", headers=owner, json={"note": "Restated costs"})
    assert c.status_code == 201 and c.json()["version"] == 2
    await client.post(f"/api/board/reports/{c.json()['id']}/approve", headers=owner)
    await client.post(f"/api/board/reports/{c.json()['id']}/publish", headers=owner)
    old = (await client.get(f"/api/board/reports/{rid}", headers=owner)).json()
    assert old["status"] == "superseded" and old["summary"] == "Board summary."
    # Members were notified.
    n = (await client.get("/api/board/notifications", headers=inv["headers"])).json()
    assert any(x["kind"] == "report_published" for x in n["notifications"])


# ─── governance ─────────────────────────────────────────────────────────────

async def test_resolution_voting_rules(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    chair = await member(client, owner, "chair", "Chair")
    d1 = await member(client, owner, "non_executive_director", "Director One")
    d2 = await member(client, owner, "executive_director", "Director Two")
    inv = await member(client, owner, "investor", "Investor")

    # Only the chair (or owner) creates; directors can't.
    body = {"title": "Approve the 2027 budget", "body": "The board approves the 2027 operating budget.",
            "threshold": "simple_majority", "quorum": 2,
            "closesAt": (datetime.now(UTC) + timedelta(days=3)).isoformat()}
    assert (await client.post("/api/board/resolutions", headers=d1["headers"], json=body)).status_code == 403
    # Board resolutions can't be weighted, and investors can't be made board voters.
    assert (await client.post("/api/board/resolutions", headers=chair["headers"], json=body | {"weighted": True})).status_code == 422
    assert (await client.post("/api/board/resolutions", headers=chair["headers"],
                              json=body | {"eligibleMemberIds": [inv["id"]]})).status_code == 422
    r = await client.post("/api/board/resolutions", headers=chair["headers"],
                          json=body | {"eligibleMemberIds": [chair["id"], d1["id"], d2["id"]]})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    # Can't vote on a draft.
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=d1["headers"], json={"choice": "for"})).status_code == 409
    assert (await client.post(f"/api/board/resolutions/{rid}/open", headers=chair["headers"])).status_code == 200
    # Investors have no board vote (not eligible, and board resolutions aren't theirs to see).
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=inv["headers"], json={"choice": "for"})).status_code in (403, 404)
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=d1["headers"], json={"choice": "for"})).status_code == 200
    # One vote each, final.
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=d1["headers"], json={"choice": "against"})).status_code == 409
    # Ballots are secret until the result: voters' choices aren't shown while open.
    open_view = (await client.get("/api/board/resolutions", headers=chair["headers"])).json()["resolutions"][0]
    assert all(v["choice"] is None for v in open_view["voters"])
    # Not concludable before the deadline while people still have to vote.
    assert (await client.post(f"/api/board/resolutions/{rid}/conclude", headers=chair["headers"])).status_code == 409
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=d2["headers"], json={"choice": "against"})).status_code == 200
    assert (await client.post(f"/api/board/resolutions/{rid}/vote", headers=chair["headers"], json={"choice": "abstain"})).status_code == 200
    c = await client.post(f"/api/board/resolutions/{rid}/conclude", headers=chair["headers"])
    assert c.status_code == 200, c.text
    res = c.json()["result"]
    assert res["for"]["votes"] == 1 and res["against"]["votes"] == 1 and res["abstain"]["votes"] == 1
    assert c.json()["outcome"] == "not_passed"  # 1 for vs 1 against is not a majority
    # Concluded resolutions are permanent.
    assert (await client.post(f"/api/board/resolutions/{rid}/cancel", headers=chair["headers"])).status_code == 409
    from sqlalchemy import text

    from app.db.base import get_session_factory

    async with get_session_factory()() as db:
        with pytest.raises(Exception):
            await db.execute(text("UPDATE board_resolutions SET title='x' WHERE id=:i"), {"i": rid})
            await db.commit()
    async with get_session_factory()() as db:
        with pytest.raises(Exception):
            await db.execute(text("UPDATE board_resolution_votes SET choice='for' WHERE resolution_id=:i"), {"i": rid})
            await db.commit()


async def test_shareholder_resolutions_weighted_by_register(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    s1 = await member(client, owner, "shareholder", "Holder One")
    s2 = await member(client, owner, "shareholder", "Holder Two")
    for who, n in ((s1, "700"), (s2, "300")):
        p = (await client.post("/api/board/investors", headers=owner, json={"legalName": who["me"]["name"],
                                                                            "memberId": who["id"]})).json()["id"]
        await client.post(f"/api/board/investors/{p}/shareholdings", headers=owner, json={
            "shares": n, "effectiveDate": "2026-01-01", "legalReference": "Share certificate"})
    body = {"title": "Special resolution", "body": "Adopt new articles of association.", "bodyType": "shareholders",
            "threshold": "three_quarters", "weighted": True}
    assert (await client.post("/api/board/resolutions", headers=owner, json=body)).status_code == 422  # basis required
    r = await client.post("/api/board/resolutions", headers=owner,
                          json=body | {"weightingBasis": "Articles, clause 12: one vote per share",
                                       "eligibleMemberIds": [s1["id"], s2["id"]]})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    await client.post(f"/api/board/resolutions/{rid}/open", headers=owner)
    await client.post(f"/api/board/resolutions/{rid}/vote", headers=s1["headers"], json={"choice": "for"})
    await client.post(f"/api/board/resolutions/{rid}/vote", headers=s2["headers"], json={"choice": "against"})
    c = (await client.post(f"/api/board/resolutions/{rid}/conclude", headers=owner)).json()
    assert c["result"]["for"]["weight"] == "700.0000" and c["outcome"] == "not_passed"  # 70% < 75%


async def test_documents_audience_and_signed_links(client: AsyncClient, admin: dict):
    import base64

    owner = await owner_session(client, admin)
    inv = await member(client, owner, "investor")
    ned = await member(client, owner, "non_executive_director")
    pdf = base64.b64encode(b"%PDF-1.4 test board pack").decode()
    up = await client.post("/api/board/documents", headers=owner, json={
        "title": "Board pack Q4", "category": "meeting_pack", "audience": ["non_executive_director", "chair"],
        "filename": "pack.pdf", "mimeType": "application/pdf", "base64": pdf})
    assert up.status_code == 201, up.text
    did = up.json()["id"]
    # Content must match the declared type.
    assert (await client.post("/api/board/documents", headers=owner, json={
        "title": "Fake", "category": "other", "filename": "x.pdf", "mimeType": "application/pdf",
        "base64": base64.b64encode(b"MZ executable").decode()})).status_code == 422
    # Investor: not in the audience, so it doesn't exist for them.
    docs = (await client.get("/api/board/documents", headers=inv["headers"])).json()["documents"]
    assert all(d["id"] != did for d in docs)
    assert (await client.post(f"/api/board/documents/{did}/download", headers=inv["headers"])).status_code == 404
    assert (await client.post("/api/board/documents", headers=inv["headers"], json={
        "title": "x", "category": "other", "filename": "x.pdf", "mimeType": "application/pdf", "base64": pdf})).status_code == 403
    dl = await client.post(f"/api/board/documents/{did}/download", headers=ned["headers"])
    assert dl.status_code == 200 and dl.json()["expiresIn"] <= 300
    # Storage paths never leak in listings.
    assert "storage" not in str((await client.get("/api/board/documents", headers=ned["headers"])).json())
    # New version keeps history.
    v2 = await client.post("/api/board/documents", headers=owner, json={
        "title": "Board pack Q4", "category": "meeting_pack", "audience": ["non_executive_director"],
        "filename": "pack-v2.pdf", "mimeType": "application/pdf", "base64": pdf, "familyId": up.json()["familyId"]})
    assert v2.status_code == 201 and v2.json()["version"] == 2


async def test_meetings_minutes_and_notifications(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    chair = await member(client, owner, "chair")
    ned = await member(client, owner, "non_executive_director")
    mt = await client.post("/api/board/meetings", headers=chair["headers"], json={
        "title": "Q4 board meeting", "scheduledAt": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        "attendeeIds": [chair["id"], ned["id"]]})
    assert mt.status_code == 201, mt.text
    mid = mt.json()["id"]
    n = (await client.get("/api/board/notifications", headers=ned["headers"])).json()
    assert any(x["kind"] == "meeting_scheduled" for x in n["notifications"])
    assert (await client.put(f"/api/board/meetings/{mid}/agenda", headers=chair["headers"], json={
        "items": [{"title": "Financial results"}, {"title": "Country expansion", "presenter": "CEO"}]})).status_code == 200
    assert (await client.put(f"/api/board/meetings/{mid}/attendance", headers=chair["headers"], json={
        "attendance": {chair["id"]: "present", ned["id"]: "apologies"}})).status_code == 200
    await client.put(f"/api/board/meetings/{mid}/minutes", headers=chair["headers"], json={"body": "Draft minutes text."})
    seen = (await client.get("/api/board/meetings", headers=ned["headers"])).json()["meetings"][0]
    assert seen["minutes"] is None  # drafts aren't shown to members
    assert (await client.put(f"/api/board/meetings/{mid}/minutes", headers=chair["headers"], json={
        "body": "Final minutes text.", "status": "published"})).status_code == 200
    seen = (await client.get("/api/board/meetings", headers=ned["headers"])).json()["meetings"][0]
    assert seen["minutes"]["body"] == "Final minutes text."
    assert (await client.put(f"/api/board/meetings/{mid}/minutes", headers=chair["headers"], json={
        "body": "Rewritten history.", "status": "draft"})).status_code == 409


async def test_use_of_funds_needs_a_second_approver(client: AsyncClient, admin: dict):
    owner = await owner_session(client, admin)
    ed = await member(client, owner, "executive_director")
    chair = await member(client, owner, "chair")
    r = await client.post("/api/board/use-of-funds/changes", headers=ed["headers"], json={
        "category": "cybersecurity", "currency": "USD", "approvedBudget": "50000", "allocated": "40000",
        "responsible": "CTO", "reason": "Penetration testing and SOC monitoring"})
    assert r.status_code == 201, r.text
    assert (await client.post("/api/board/use-of-funds/changes", headers=ed["headers"], json={
        "category": "marketing", "approvedBudget": "10", "allocated": "20", "reason": "Over-allocation"})).status_code == 422
    # Proposer can't approve; ED doesn't even hold the approval permission.
    assert (await client.post(f"/api/board/use-of-funds/changes/{r.json()['id']}/decide", headers=ed["headers"],
                              json={"approve": True})).status_code == 403
    assert (await client.post(f"/api/board/use-of-funds/changes/{r.json()['id']}/decide", headers=chair["headers"],
                              json={"approve": True})).status_code == 200
    uof = (await client.get("/api/board/use-of-funds", headers=ed["headers"])).json()
    cat = next(c for c in uof["categories"] if c["category"] == "cybersecurity")
    assert cat["approvedBudget"] == "50000.00" and cat["spent"] == "0.00"
    e = await client.post("/api/board/use-of-funds/expenditures", headers=ed["headers"], json={
        "allocationId": cat["id"], "spentOn": "2026-11-01", "amount": "10000", "currency": "USD",
        "description": "Annual penetration test"})
    assert e.status_code == 201
    cat = next(c for c in (await client.get("/api/board/use-of-funds", headers=ed["headers"])).json()["categories"]
               if c["category"] == "cybersecurity")
    assert cat["spent"] == "10000.00" and cat["remaining"] == "30000.00" and cat["utilisation"] == "25.0"


async def test_custodian_balance_is_not_verified_without_evidence(client: AsyncClient, admin: dict):
    from app.db.base import get_session_factory
    from app.models.platform import Custodian

    owner = await owner_session(client, admin)
    async with get_session_factory()() as db:
        c = Custodian(name="Test Bank", country_code="ZA", institution_type="bank", status="active")
        db.add(c)
        await db.commit()
        cid = str(c.id)
    liab = "0"
    r = await client.post("/api/board/custodians/reconciliations", headers=owner, json={
        "custodianId": cid, "currency": "ZAR", "statementDate": "2026-11-25", "reportedBalance": liab,
        "source": "management_reported"})
    assert r.status_code == 201, r.text
    assert r.json()["status"] != "reconciled"  # management-reported is never "reconciled"
    assert (await client.post("/api/board/custodians/reconciliations", headers=owner, json={
        "custodianId": cid, "currency": "ZAR", "statementDate": "2026-11-25", "reportedBalance": "1",
        "source": "live_integration"})).status_code == 422  # no live integration with this custodian
    inv = await member(client, owner, "investor")
    assert (await client.post("/api/board/custodians/reconciliations", headers=inv["headers"], json={
        "custodianId": cid, "currency": "ZAR", "statementDate": "2026-11-25", "reportedBalance": "1",
        "source": "manual_statement"})).status_code == 403


async def test_audit_trail_is_append_only_and_has_no_secrets(client: AsyncClient, admin: dict):
    from sqlalchemy import text

    from app.db.base import get_session_factory

    owner = await owner_session(client, admin)
    await member(client, owner, "investor")
    log = (await client.get("/api/board/audit", headers=owner)).json()["entries"]
    assert any(e["action"] == "user.invited" for e in log)
    blob = str(log).lower()
    assert "board-pass-2026" not in blob and "otpauth" not in blob
    async with get_session_factory()() as db:
        with pytest.raises(Exception):
            await db.execute(text("DELETE FROM boardroom_audit_logs"))
            await db.commit()


async def test_analytics_endpoints_return_aggregates_only(client: AsyncClient, admin: dict, funded_user: dict):
    owner = await owner_session(client, admin)
    u = {"email": funded_user["user"]["email"]}
    for path in ("/api/board/dashboard", "/api/board/adoption", "/api/board/currencies", "/api/board/wallets",
                 "/api/board/revenue", "/api/board/cross-border", "/api/board/pos", "/api/board/fx",
                 "/api/board/custodians", "/api/board/countries", "/api/board/health", "/api/board/insights",
                 "/api/board/dashboard?kind=quarter", "/api/board/dashboard?kind=custom&start=2026-01-01&end=2026-06-30",
                 "/api/board/milestones", "/api/board/risks", "/api/board/use-of-funds", "/api/board/announcements"):
        r = await client.get(path, headers=owner)
        assert r.status_code == 200, (path, r.text[:300])
        assert u["email"] not in r.text, path  # never a customer's personal data
    assert (await client.get("/api/board/dashboard?kind=custom", headers=owner)).status_code == 422
    ai = (await client.get("/api/board/insights?ai=true", headers=owner)).json()
    assert ai["ai"]["enabled"] is False  # off until configured
