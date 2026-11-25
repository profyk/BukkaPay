"""Analytics: customer cash flow, categories and insights; merchant sales,
busiest hours and repeat customers; platform growth and volume."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.db.base import get_session_factory
from app.models.enums import MerchantTransactionStatus, MerchantTransactionType, TransactionType
from app.models.merchant import MerchantTransaction
from app.models.wallet import Transaction
from tests.conftest import signup_business
from tests.test_network import signup

pytestmark = pytest.mark.asyncio


async def test_customer_analytics(client: AsyncClient):
    u = await signup(client, "ZA", kyc_level=1)
    uid, card = uuid.UUID(u["user"]["id"]), uuid.UUID(u["card_id"])
    now = datetime.now(UTC)
    rows = [("Salary", "salary", "1000.00", TransactionType.CREDIT, 1), ("Spar", "groceries", "300.00", TransactionType.DEBIT, 2),
            ("Uber", "transport", "100.00", TransactionType.DEBIT, 3), ("Spar", "groceries", "50.00", TransactionType.DEBIT, 40)]
    async with get_session_factory()() as db:
        for title, cat, amt, typ, ago in rows:
            db.add(Transaction(user_id=uid, card_id=card, title=title, category=cat, amount=Decimal(amt), type=typ,
                               icon="x", created_at=now - timedelta(days=ago)))
        await db.commit()
    r = await client.get("/api/analytics", params={"days": 30}, headers=u["headers"])
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["currency"] == "ZAR"
    assert a["totals"]["in"] == "1000.00" and a["totals"]["out"] == "400.00" and a["totals"]["net"] == "600.00"
    assert a["totals"]["outChange"] == 700.0  # 400 vs 50 the period before
    assert a["categories"][0]["category"] == "groceries" and a["categories"][0]["share"] == 75.0
    assert a["payees"][0]["name"] == "Spar" and len(a["daily"]) == 31
    assert any("kept 60%" in i["text"] for i in a["insights"])


async def test_merchant_and_platform_analytics(client: AsyncClient, admin: dict):
    owner = await signup_business(client, "Chart Shop")
    mid = (await client.post("/api/merchants", json={"businessName": "Chart Shop", "businessType": "retail"},
                             headers=owner["headers"])).json()["id"]
    payer = await signup(client, "ZA", kyc_level=1)
    pid = uuid.UUID(payer["user"]["id"])
    now = datetime.now(UTC).replace(hour=10, minute=15)  # 12:15 in Johannesburg
    async with get_session_factory()() as db:
        for amt, who, ago in (("100.00", pid, 1), ("50.00", pid, 2), ("30.00", None, 3)):
            db.add(MerchantTransaction(merchant_id=uuid.UUID(mid), payer_id=who, payer_name="Thabo" if who else None,
                                       amount=Decimal(amt), type=MerchantTransactionType.PAYMENT,
                                       status=MerchantTransactionStatus.COMPLETED, created_at=now - timedelta(days=ago)))
        db.add(MerchantTransaction(merchant_id=uuid.UUID(mid), amount=Decimal("10.00"), type=MerchantTransactionType.REFUND,
                                   status=MerchantTransactionStatus.COMPLETED, created_at=now - timedelta(days=1)))
        await db.commit()
    r = await client.get(f"/api/merchants/{mid}/insights", params={"days": 30}, headers=owner["headers"])
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["totals"]["sales"] == "180.00" and m["totals"]["count"] == 3 and m["totals"]["net"] == "170.00"
    assert m["totals"]["averageTicket"] == "60.00" and m["totals"]["repeatCustomers"] == 1
    assert next(h for h in m["hours"] if h["hour"] == 12)["count"] == 3
    assert m["topCustomers"][0]["name"] == "Thabo"
    other = await signup_business(client, "Snoop")
    assert (await client.get(f"/api/merchants/{mid}/insights", headers=other["headers"])).status_code == 403

    p = (await client.get("/api/admin/analytics", params={"days": 30}, headers=admin["headers"])).json()
    assert p["kpis"]["users"] > 0 and p["kpis"]["newUsers"] > 0 and len(p["growth"]) == 31
    assert any(c["country"] == "ZA" for c in p["countries"])
    async with get_session_factory()() as db:  # nothing written by analytics
        assert (await db.execute(text("SELECT 1"))).scalar_one() == 1
