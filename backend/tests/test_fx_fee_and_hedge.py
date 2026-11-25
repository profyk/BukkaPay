"""Swap fee on top (in the currency the customer pays with) and the FX hedge:
customers buy USD with ZAR → the run proposes selling ZAR for USD → once
treasury has done it and a second admin approves, the FX pool is squared."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient

from app.db.base import get_session_factory
from app.ledger import accounts, chart, posting
from app.models.platform import FeeSchedule
from app.network import settlement
from tests.conftest import TEST_PIN, fund_card
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import named_admin, signup
from tests.test_trade import _balance, _rate

pytestmark = pytest.mark.asyncio


async def test_fee_on_top_and_fx_hedge(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055000", spread_pct="1.00")
    await _rate("USD", "ZAR", "18.000000", spread_pct="1.00")
    async with get_session_factory()() as db:
        rule = FeeSchedule(product="fx_swap", currency="ZAR", percentage=Decimal("1.0"), fixed=Decimal("0"),
                           priority=50, active=True)
        db.add(rule)
        await db.commit()
        rule_id = rule.id
    try:
        u = await signup(client, "ZA", kyc_level=1)
        await fund_card(u["card_id"], "2000.00")
        q = (await client.get("/api/swap/quote", params={"from": "ZAR", "to": "USD", "amount": "1000.00"},
                              headers=u["headers"])).json()
        assert q["fee"] == "10.00" and q["total"] == "1010.00"
        assert q["receive"] == "54.45"  # 1000 × 0.055 = 55.00, less 1% spread
        fx_rev_zar = await _balance("revenue:fx:ZAR")
        r = await client.post("/api/swap", json={"fromCardId": u["card_id"], "toCurrency": "USD", "amount": "1000.00",
                                                 "expectedReceive": q["receive"], "pin": TEST_PIN},
                              headers={**u["headers"], "Idempotency-Key": uuid.uuid4().hex})
        assert r.status_code == 201, r.text
        assert r.json()["debited"] == "1010.00" and r.json()["fee"] == "10.00"
        assert await card_balance(u["card_id"]) == Decimal("990.00")
        assert await _balance("revenue:fx:ZAR") == fx_rev_zar + Decimal("10.00")
    finally:
        async with get_session_factory()() as db:
            await db.execute(__import__("sqlalchemy").update(FeeSchedule).where(FeeSchedule.id == rule_id)
                             .values(active=False))
            await db.commit()

    # The FX pool is now short USD and long ZAR: the run proposes an FX hedge.
    async with get_session_factory()() as db:  # the USD custodian has cash to receive into
        await posting.post(db, kind="test_funding", description="USD safeguarded", legs=[
            posting.debit(await chart.sys_account(db, "SYS_SAFEGUARD", "USD"), Decimal("100.00")),
            posting.credit(await accounts.provider_clearing(db, "test", "USD"), Decimal("100.00"))])
        # ...and the customer's rand deposit sits in ZAR safeguarding (as a real top-up does).
        await posting.post(db, kind="test_funding", description="ZAR safeguarded", legs=[
            posting.debit(await chart.sys_account(db, "SYS_SAFEGUARD", "ZAR"), Decimal("2000.00")),
            posting.credit(await accounts.provider_clearing(db, "test", "ZAR"), Decimal("2000.00"))])
        await db.commit()
    for run in (await client.get("/api/admin/settlements", headers=admin["headers"])).json()["runs"]:
        if run["status"] in ("proposed", "in_progress"):
            await client.post(f"/api/admin/settlements/{run['id']}/cancel", headers=admin["headers"])
    async with get_session_factory()() as db:
        batch = await settlement.generate(db, actor="test")
        await db.commit()
    runs = (await client.get("/api/admin/settlements", headers=admin["headers"])).json()
    assert any(p["pool"] == "fx" and p["currency"] == "USD" and p["action"] == "top_up" for p in runs["positions"])
    run = next(x for x in runs["runs"] if x["id"] == str(batch.id))
    hedge = next(ln for ln in run["lines"] if ln["pool"] == "fx" and ln["fromCurrency"] == "ZAR" and ln["toCurrency"] == "USD")

    usd_pool_before = await _balance("fx:position:USD")
    treasury_admin = await named_admin(client, admin, "treasury_manager")
    finance = await named_admin(client, admin, "finance_admin")
    sent = Decimal(hedge["fromAmount"])
    received = Decimal(hedge["expectedToAmount"])
    r = await client.post(f"/api/admin/settlement-lines/{hedge['id']}/sent", headers=treasury_admin["headers"],
                          json={"bankReference": "FX-DEAL-1", "sentAmount": str(sent), "receivedAmount": str(received)})
    assert r.status_code == 200, r.text
    done = await client.post(f"/api/admin/approvals/{r.json()['approvalId']}/decide", json={"approve": True},
                             headers=finance["headers"])
    assert done.json()["status"] == "executed", done.text
    assert await _balance("fx:position:USD") == usd_pool_before - received
    for run in (await client.get("/api/admin/settlements", headers=admin["headers"])).json()["runs"]:
        if run["status"] in ("proposed", "in_progress"):
            for ln in run["lines"]:
                if ln["status"] == "pending":
                    await client.post(f"/api/admin/settlement-lines/{ln['id']}/cancel", headers=admin["headers"])
    await assert_ledger_consistent()
