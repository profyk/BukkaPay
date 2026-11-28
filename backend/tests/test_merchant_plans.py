"""Merchant plans end to end: admins draft, price and publish; owners choose,
upgrade (with credit for unused days), downgrade at period end and cancel;
renewals charge the business balance through the ledger, retry and fall back
to the free default plan; limits apply only to published plans."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select

from app.db.base import get_session_factory
from app.ledger import accounts, posting
from app.models.merchant import Merchant
from app.models.plans import MerchantPlanSubscription
from app.plans import service as plans
from tests.test_network import signup

A = "/api/admin/merchant-plans"


def code(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


async def make_plan(client, admin, *, monthly="100.00", yearly="1000.00", trial=0, limits=None, publish=True,
                    currency="ZAR") -> str:
    c = code("p")
    prices = {currency: {"monthly": monthly, "yearly": yearly}} if monthly is not None else {}
    r = await client.post(A, json={"code": c, "name": f"Plan {c}", "prices": prices, "trialDays": trial,
                                   "features": ["One", " Two  "], "limits": limits or {}}, headers=admin["headers"])
    assert r.status_code == 201, r.text
    if publish:
        r = await client.post(f"{A}/{c}/publish", headers=admin["headers"])
        assert r.status_code == 200, r.text
    return c


async def business(client) -> tuple[dict, str]:
    owner = await signup(client, app="merchant")
    r = await client.post("/api/merchants", json={"businessName": "Plan Shop", "businessType": "retail"},
                          headers=owner["headers"])
    assert r.status_code == 201, r.text
    return owner, r.json()["id"]


async def fund_merchant(merchant_id: str, amount: str) -> None:
    async with get_session_factory()() as db:
        m = await db.get(Merchant, uuid.UUID(merchant_id))
        await posting.post(db, kind="test_funding", description="test sales", legs=[
            posting.debit(await accounts.provider_clearing(db, "test", m.settlement_currency), Decimal(amount)),
            posting.credit(await accounts.merchant_account(db, m), Decimal(amount))])
        await db.commit()


async def balance(merchant_id: str) -> Decimal:
    async with get_session_factory()() as db:
        return (await db.get(Merchant, uuid.UUID(merchant_id))).wallet_balance


async def test_admin_drafts_validates_and_publishes(client: AsyncClient, admin: dict):
    c = await make_plan(client, admin, monthly=None, publish=False)
    # No price yet: can't publish.
    r = await client.post(f"{A}/{c}/publish", headers=admin["headers"])
    assert r.status_code == 400 and "price" in r.json()["error"].lower()
    bad = await client.patch(f"{A}/{c}", json={"prices": {"ZAR": {"monthly": "-5"}}}, headers=admin["headers"])
    assert bad.status_code == 400
    bad = await client.patch(f"{A}/{c}", json={"limits": {"teleport": True}}, headers=admin["headers"])
    assert bad.status_code == 400
    r = await client.patch(f"{A}/{c}", json={"prices": {"zar": {"monthly": "1,299.5", "yearly": ""}},
                                            "limits": {"staff_seats": "3", "checkout_links": ""}},
                           headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["prices"] == {"ZAR": {"monthly": "1299.50"}}
    assert r.json()["limits"]["staff_seats"] == 3 and r.json()["limits"]["checkout_links"] is None
    assert (await client.post(f"{A}/{c}/publish", headers=admin["headers"])).status_code == 200
    listing = await client.get(A, headers=admin["headers"])
    assert any(p["code"] == c and p["status"] == "published" for p in listing.json()["plans"])
    # Shown to businesses and on the website.
    pub = await client.get("/api/public/merchant-plans?currency=ZAR")
    row = next(p for p in pub.json()["plans"] if p["code"] == c)
    assert row["monthly"] == "1299.50" and row["yearly"] is None and "updatedBy" not in row
    # Drafts are deletable, published plans aren't.
    assert (await client.delete(f"{A}/{c}", headers=admin["headers"])).status_code == 409


async def test_owner_chooses_paid_plan_from_balance(client: AsyncClient, admin: dict):
    c = await make_plan(client, admin, monthly="100.00")
    owner, mid = await business(client)
    # Not enough balance: refused, nothing changes.
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": c}, headers=owner["headers"])
    assert r.status_code == 402, r.text
    assert "balance" in r.json()["error"]
    await fund_merchant(mid, "250.00")
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": c}, headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["charged"] == "100.00"
    assert await balance(mid) == Decimal("150.00")
    view = await client.get(f"/api/merchants/{mid}/plan", headers=owner["headers"])
    assert view.json()["current"]["code"] == c and view.json()["charges"][0]["amount"] == "100.00"
    # Same plan again: refused.
    again = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": c}, headers=owner["headers"])
    assert again.status_code == 409
    # Unpriced cycle can't be chosen.
    c2 = await make_plan(client, admin, monthly="50.00", yearly=None)
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": c2, "billingCycle": "yearly"},
                          headers=owner["headers"])
    assert r.status_code == 409


async def test_upgrade_credits_unused_days_and_downgrade_waits(client: AsyncClient, admin: dict):
    small = await make_plan(client, admin, monthly="100.00")
    big = await make_plan(client, admin, monthly="300.00")
    owner, mid = await business(client)
    await fund_merchant(mid, "1000.00")
    assert (await client.post(f"/api/merchants/{mid}/plan", json={"planCode": small}, headers=owner["headers"])).status_code == 200
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": big}, headers=owner["headers"])
    assert r.status_code == 200, r.text
    # Upgraded straight after paying: almost all of the 100 comes back as credit.
    assert Decimal(r.json()["credit"]) >= Decimal("99.00")
    assert Decimal(r.json()["charged"]) <= Decimal("201.00")
    # Downgrade: scheduled for the end of the period, no charge now.
    before = await balance(mid)
    d = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": small}, headers=owner["headers"])
    assert d.status_code == 200 and d.json()["result"] == "scheduled"
    assert d.json()["subscription"]["nextPlanCode"] == small
    assert await balance(mid) == before
    # Changing their mind keeps the big plan.
    k = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": big}, headers=owner["headers"])
    assert k.json()["result"] == "kept" and k.json()["subscription"]["nextPlanCode"] is None


async def test_only_owner_changes_plan(client: AsyncClient, admin: dict):
    c = await make_plan(client, admin, monthly="0.00", yearly="0.00")
    _owner, mid = await business(client)
    stranger = await signup(client, app="merchant")
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": c}, headers=stranger["headers"])
    assert r.status_code in (403, 404)


async def test_trial_then_renewal_retry_and_fallback(client: AsyncClient, admin: dict):
    free = await make_plan(client, admin, monthly="0.00", yearly="0.00")
    paid = await make_plan(client, admin, monthly="80.00", trial=14)
    owner, mid = await business(client)
    r = await client.post(f"/api/merchants/{mid}/plan", json={"planCode": paid}, headers=owner["headers"])
    assert r.status_code == 200 and r.json()["result"] == "trial" and r.json()["charged"] == "0.00"
    # A second trial isn't offered.
    async with get_session_factory()() as db:
        assert await plans._had_trial(db, uuid.UUID(mid))

    # Trial ends with no balance: past due, retried, then the default plan.
    real_default = plans.default_plan

    async def fake_default(db):
        return await plans.get_plan(db, free)

    plans.default_plan = fake_default
    try:
        later = datetime.now(UTC) + timedelta(days=15)
        for day in range(plans.RENEWAL_ATTEMPTS):
            async with get_session_factory()() as db:
                await plans.renew_due(db, now=later + timedelta(days=day))
                await db.commit()
        async with get_session_factory()() as db:
            live = await plans.live_subscription(db, uuid.UUID(mid))
            assert live is not None and live.plan_code == free
            ended = (await db.execute(select(MerchantPlanSubscription).where(
                MerchantPlanSubscription.merchant_id == uuid.UUID(mid),
                MerchantPlanSubscription.plan_code == paid))).scalar_one()
            assert ended.status == "ended" and ended.end_reason == "unpaid"
    finally:
        plans.default_plan = real_default
    assert await balance(mid) == Decimal("0.00")  # never overdrawn


async def test_renewal_charges_balance(client: AsyncClient, admin: dict):
    paid = await make_plan(client, admin, monthly="60.00")
    owner, mid = await business(client)
    await fund_merchant(mid, "200.00")
    assert (await client.post(f"/api/merchants/{mid}/plan", json={"planCode": paid}, headers=owner["headers"])).status_code == 200
    async with get_session_factory()() as db:
        counts = await plans.renew_due(db, now=datetime.now(UTC) + timedelta(days=31))
        await db.commit()
    assert counts["renewed"] >= 1
    assert await balance(mid) == Decimal("80.00")  # 200 - 60 - 60


async def test_published_limits_apply_drafts_dont(client: AsyncClient, admin: dict):
    limited = await make_plan(client, admin, monthly="0.00", yearly="0.00",
                              limits={"staff_seats": 1, "api_access": False})
    owner, mid = await business(client)
    # No plan chosen and no published default: nothing enforced.
    assert (await client.post(f"/api/merchants/{mid}/staff", json={"name": "A", "role": "cashier"},
                              headers=owner["headers"])).status_code == 201
    assert (await client.post(f"/api/merchants/{mid}/plan", json={"planCode": limited},
                              headers=owner["headers"])).status_code == 200
    r = await client.post(f"/api/merchants/{mid}/staff", json={"name": "B", "role": "cashier"}, headers=owner["headers"])
    assert r.status_code == 403 and "Upgrade" in r.json()["error"]
    k = await client.post(f"/api/merchants/{mid}/api-keys", json={"label": "shop"}, headers=owner["headers"])
    assert k.status_code == 403


async def test_legacy_subscribe_no_longer_free(client: AsyncClient, admin: dict):
    paid = await make_plan(client, admin, monthly="500.00")
    owner, mid = await business(client)
    r = await client.post(f"/api/merchants/{mid}/subscribe", json={"plan": paid}, headers=owner["headers"])
    assert r.status_code == 402
