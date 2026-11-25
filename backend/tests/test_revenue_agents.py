"""Revenue: the monthly account fee (charge, retry, waivers, never debt),
pricing settings and the revenue report; and the cash agent network
(cash-in, code-based cash-out, expiry/cancel refunds, wrong-code lockout)."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text, update

from app.agents import service as agents
from app.db.base import get_session_factory
from app.ledger import accounts, posting
from app.models.enums import TransactionType
from app.models.merchant import Merchant
from app.models.platform import FeeSchedule
from app.models.revenue import AccountFeeCharge, AgentTransaction
from app.models.wallet import Transaction
from app.pricing import service as pricing
from tests.conftest import TEST_PIN, fund_card, signup_business
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import signup

pytestmark = pytest.mark.asyncio


async def _rule(product: str, **kw) -> uuid.UUID:
    async with get_session_factory()() as db:
        rule = FeeSchedule(product=product, active=True, priority=10, **kw)
        db.add(rule)
        await db.commit()
        return rule.id


async def _retire(rule_id: uuid.UUID) -> None:
    async with get_session_factory()() as db:
        await db.execute(update(FeeSchedule).where(FeeSchedule.id == rule_id).values(active=False))
        await db.commit()


async def _balance(code: str) -> Decimal:
    async with get_session_factory()() as db:
        row = (await db.execute(text("SELECT balance FROM ledger_accounts WHERE code = :c"), {"c": code})).first()
        return row[0] if row else Decimal("0.00")


async def _activity(user: dict, at: datetime | None = None) -> None:
    """A recent non-fee transaction, so the month isn't waived as inactive."""
    async with get_session_factory()() as db:
        db.add(Transaction(user_id=uuid.UUID(user["user"]["id"]), card_id=uuid.UUID(user["card_id"]), title="Coffee",
                           category="payment", amount=Decimal("1.00"), type=TransactionType.DEBIT, icon="coffee",
                           **({"created_at": at} if at else {})))
        await db.commit()


async def _run_fees(now: datetime) -> dict:
    """Run the job until a pass decides nobody new (it works in batches)."""
    total = {"charged": 0, "due": 0, "waived": 0}
    for _ in range(50):
        async with get_session_factory()() as db:
            counts = await pricing.charge_account_fees(db, now=now)
            await db.commit()
        for k, v in counts.items():
            total[k] += v
        if not any(counts.values()):
            return total
    raise AssertionError("account fee job never finished")


async def _charge(user: dict, period: str) -> AccountFeeCharge | None:
    async with get_session_factory()() as db:
        return (await db.execute(select(AccountFeeCharge).where(
            AccountFeeCharge.user_id == uuid.UUID(user["user"]["id"]), AccountFeeCharge.period == period))
        ).scalar_one_or_none()


# ─── monthly account fee ────────────────────────────────────────────────────


async def test_monthly_account_fee(client: AsyncClient):
    rule = await _rule("account_monthly", country_code="ZA", currency="ZAR", customer_type="personal",
                       fixed=Decimal("25.00"))
    try:
        await _account_fee_flow(client)
    finally:  # don't leak the price into other tests
        await _retire(rule)


async def _account_fee_flow(client: AsyncClient):
    payer = await signup(client, "ZA", kyc_level=1)
    broke = await signup(client, "ZA", kyc_level=1)
    unverified = await signup(client, "ZA", kyc_level=0)
    assert payer["currency"] == "ZAR"
    await fund_card(payer["card_id"], "100.00")
    for u in (payer, broke, unverified):
        await _activity(u)

    # Sign-up month is free.
    now = datetime.now(UTC)
    await _run_fees(now)
    assert (await _charge(payer, pricing.period_of(now))).reason == "free_months"
    plan = (await client.get("/api/pricing/my-plan", headers=payer["headers"])).json()
    assert plan["monthlyFee"] == "25.00" and plan["currency"] == "ZAR" and plan["freeUntil"]

    # Next month: charged once, never twice.
    nxt = (now.replace(day=1) + timedelta(days=32)).replace(day=2, hour=9)
    period = pricing.period_of(nxt)
    # Only this test's customers: other tests' users are already decided for that month.
    async with get_session_factory()() as db:
        await db.execute(text(
            "INSERT INTO account_fee_charges (user_id, period, currency, amount, status, reason) "
            "SELECT id, :p, 'ZAR', 0, 'waived', 'test_isolation' FROM users WHERE id <> ALL(:mine) "
            "ON CONFLICT DO NOTHING"),
            {"p": period, "mine": [uuid.UUID(u["user"]["id"]) for u in (payer, broke, unverified)]})
        await db.commit()
    revenue_before = await _balance("revenue:account_fees:ZAR")
    await _run_fees(nxt)
    await _run_fees(nxt + timedelta(hours=1))
    c = await _charge(payer, period)
    assert c.status == "charged" and c.amount == Decimal("25.00") and c.journal_entry_id
    assert await card_balance(payer["card_id"]) == Decimal("75.00")
    assert await _balance("revenue:account_fees:ZAR") == revenue_before + Decimal("25.00")

    # Unverified: waived. Can't pay: due (no overdraft), retried daily, waived after the last retry day.
    assert (await _charge(unverified, period)).reason == "unverified"
    c = await _charge(broke, period)
    assert c.status == "due" and c.attempts == 1
    await _run_fees(nxt + timedelta(hours=3))  # same day: not retried
    assert (await _charge(broke, period)).attempts == 1
    await _run_fees(nxt + timedelta(days=1))
    assert (await _charge(broke, period)).attempts == 2
    await _activity(broke, at=nxt.replace(day=20))  # still active, just broke
    await _run_fees(nxt.replace(day=26))
    c = await _charge(broke, period)
    assert c.status == "waived" and c.reason == "insufficient_balance"
    assert await card_balance(broke["card_id"]) == Decimal("0.00")
    await assert_ledger_consistent()


# ─── admin: settings, simulator, report ─────────────────────────────────────


async def test_admin_pricing_settings_and_simulator(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/pricing/settings", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["agents"]["cash_out_agent_share_pct"] == 60
    bad = await client.patch("/api/admin/pricing/settings/agents", json={"cash_out_agent_share_pct": 120},
                             headers=admin["headers"])
    assert bad.status_code == 400
    unknown = await client.patch("/api/admin/pricing/settings/agents", json={"nope": 1}, headers=admin["headers"])
    assert unknown.status_code == 400
    r = await client.patch("/api/admin/pricing/settings/agents", json={"code_ttl_minutes": 45},
                           headers=admin["headers"])
    assert r.status_code == 200 and r.json()["code_ttl_minutes"] == 45
    await client.patch("/api/admin/pricing/settings/agents", json={"code_ttl_minutes": 30}, headers=admin["headers"])

    rule = await _rule("card_atm_withdrawal", currency="ZAR", country_code="ZA", fixed=Decimal("15.00"))
    r = await client.post("/api/admin/pricing/simulate", json={"product": "card_atm_withdrawal", "amount": "500",
                                                               "currency": "ZAR", "country": "ZA"},
                          headers=admin["headers"])
    assert r.status_code == 200 and r.json()["fee"] == "15.00"
    await _retire(rule)
    assert (await client.post("/api/admin/pricing/simulate", json={"product": "bogus", "currency": "ZAR"},
                              headers=admin["headers"])).status_code == 400
    r = await client.get("/api/admin/revenue?days=7", headers=admin["headers"])
    assert r.status_code == 200 and isinstance(r.json()["streams"], list)


# ─── cash agents ────────────────────────────────────────────────────────────


async def _agent(client: AsyncClient, admin: dict, float_amount: str = "1000.00") -> tuple[dict, str, str]:
    owner = await signup_business(client, "Spaza Agent")
    r = await client.post("/api/merchants", json={"businessName": "Mma Spaza", "businessType": "retail"},
                          headers=owner["headers"])
    mid = r.json()["id"]
    # Unverified businesses can't apply.
    r = await client.post(f"/api/merchants/{mid}/agent", json={"displayName": "Mma Spaza",
                                                               "address": "12 Main Rd, Soweto", "city": "Soweto"},
                          headers=owner["headers"])
    assert r.status_code == 403
    async with get_session_factory()() as db:
        await db.execute(text("UPDATE merchants SET kyb_status='approved' WHERE id=:id"), {"id": mid})
        merchant = await db.get(Merchant, uuid.UUID(mid))
        await posting.post(db, kind="test_funding", description="agent float", legs=[
            posting.debit(await accounts.provider_clearing(db, "test", "ZAR"), Decimal(float_amount)),
            posting.credit(await accounts.merchant_account(db, merchant, "ZAR"), Decimal(float_amount))])
        await db.commit()
    r = await client.post(f"/api/merchants/{mid}/agent", json={"displayName": "Mma Spaza",
                                                               "address": "12 Main Rd, Soweto", "city": "Soweto"},
                          headers=owner["headers"])
    assert r.status_code == 201 and r.json()["status"] == "pending"
    agent_id = r.json()["id"]
    # Not active yet: can't serve customers.
    r = await client.post(f"/api/merchants/{mid}/agent/cash-in", json={"customer": "x" * 8, "amount": "10",
                                                                       "pin": TEST_PIN}, headers=owner["headers"])
    assert r.status_code in (403, 404)
    r = await client.patch(f"/api/admin/agents/{agent_id}", json={"status": "active"}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    return owner, mid, agent_id


async def _code(client, user, amount="100.00"):
    r = await client.post("/api/agents/cash-out", json={"walletId": user["card_id"], "amount": amount, "pin": TEST_PIN},
                          headers=user["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def test_agent_cash_in_and_cash_out(client: AsyncClient, admin: dict):
    owner, mid, agent_id = await _agent(client, admin)
    await _rule("cash_out", country_code="ZA", currency="ZAR", fixed=Decimal("10.00"))
    customer = await signup(client, "ZA", kyc_level=1)

    agents_list = (await client.get("/api/agents?city=Soweto", headers=customer["headers"])).json()
    assert any(a["id"] == agent_id for a in agents_list)

    # Cash-in: customer pays nothing, agent float down, agent earns 0.5% commission.
    username = customer["user"]["username"]
    r = await client.post(f"/api/merchants/{mid}/agent/cash-in", json={"customer": username, "amount": "200.00",
                                                                       "pin": TEST_PIN}, headers=owner["headers"])
    assert r.status_code == 201, r.text
    assert r.json()["commission"] == "1.00"
    assert await card_balance(customer["card_id"]) == Decimal("200.00")
    assert await _balance(f"merchant:{mid}:ZAR") == Decimal("801.00")
    # Not enough float.
    r = await client.post(f"/api/merchants/{mid}/agent/cash-in", json={"customer": username, "amount": "5000.00",
                                                                       "pin": TEST_PIN}, headers=owner["headers"])
    assert r.status_code in (402, 409)

    # Cash-out: quote, code, money held.
    q = (await client.get(f"/api/agents/cash-out/quote?walletId={customer['card_id']}&amount=100",
                          headers=customer["headers"])).json()
    assert q["fee"] == "10.00" and q["total"] == "110.00"
    issued = await _code(client, customer)
    assert len(issued["code"]) == 8
    assert await card_balance(customer["card_id"]) == Decimal("90.00")
    assert await _balance("agent:cashout_hold:ZAR") >= Decimal("110.00")

    wrong = "00000000" if issued["code"] != "00000000" else "11111111"
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": wrong}, headers=owner["headers"])
    assert r.status_code == 404
    revenue_before = await _balance("revenue:cashout:ZAR")
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": issued["code"]},
                          headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed" and r.json()["commission"] == "6.00"
    assert await _balance(f"merchant:{mid}:ZAR") == Decimal("907.00")  # 801 + 100 + 6
    assert await _balance("revenue:cashout:ZAR") == revenue_before + Decimal("4.00")
    # Single use.
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": issued["code"]},
                          headers=owner["headers"])
    assert r.status_code == 404

    history = (await client.get("/api/agents/transactions", headers=customer["headers"])).json()
    assert {t["kind"] for t in history} == {"cash_in", "cash_out"} and "code" not in history[0]
    await assert_ledger_consistent()


async def test_cash_out_cancel_expire_and_lockout(client: AsyncClient, admin: dict):
    owner, mid, agent_id = await _agent(client, admin)
    customer = await signup(client, "ZA", kyc_level=1)
    await fund_card(customer["card_id"], "500.00")
    unverified = await signup(client, "ZA", kyc_level=0)
    await fund_card(unverified["card_id"], "50.00")
    r = await client.post("/api/agents/cash-out", json={"walletId": unverified["card_id"], "amount": "10",
                                                        "pin": TEST_PIN}, headers=unverified["headers"])
    assert r.status_code == 403

    # Cancel: money back.
    issued = await _code(client, customer)
    r = await client.post(f"/api/agents/cash-out/{issued['id']}/cancel", headers=customer["headers"])
    assert r.json()["status"] == "cancelled"
    assert await card_balance(customer["card_id"]) == Decimal("500.00")
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": issued["code"]},
                          headers=owner["headers"])
    assert r.status_code == 404

    # Expire: the job returns the money.
    issued = await _code(client, customer)
    async with get_session_factory()() as db:
        await db.execute(update(AgentTransaction).where(AgentTransaction.id == uuid.UUID(issued["id"]))
                         .values(expires_at=datetime.now(UTC) - timedelta(minutes=1)))
        await db.commit()
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": issued["code"]},
                          headers=owner["headers"])
    assert r.status_code == 410
    async with get_session_factory()() as db:
        assert await agents.expire_codes(db) >= 1
        await db.commit()
    assert await card_balance(customer["card_id"]) == Decimal("500.00")

    # Too many wrong codes lock the agent out, even for a right code.
    from app.core.redis import get_redis

    await get_redis().delete(f"agent:wrong_codes:{agent_id}")
    issued = await _code(client, customer)
    wrong = "00000000" if issued["code"] != "00000000" else "11111111"
    for _ in range(5):
        r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": wrong}, headers=owner["headers"])
        assert r.status_code == 404
    r = await client.post(f"/api/merchants/{mid}/agent/cash-out", json={"code": issued["code"]},
                          headers=owner["headers"])
    assert r.status_code == 429

    # The hold account equals the open codes (reconciliation check).
    async with get_session_factory()() as db:
        pending = (await db.execute(text(
            "SELECT COALESCE(sum(amount + fee), 0) FROM agent_transactions "
            "WHERE kind='cash_out' AND status='pending' AND currency='ZAR'"))).scalar_one()
    assert await _balance("agent:cashout_hold:ZAR") == pending
    await assert_ledger_consistent()
