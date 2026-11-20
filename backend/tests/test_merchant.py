import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


async def _approve_kyb(merchant_id: str) -> None:
    from sqlalchemy import text

    from app.db.base import get_session_factory

    async with get_session_factory()() as db:
        await db.execute(text("UPDATE merchants SET kyb_status='approved' WHERE id=:id"), {"id": merchant_id})
        await db.commit()


async def test_create_merchant_and_pay(client: AsyncClient, business_user: dict, funded_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Alice's Shop", "businessType": "retail",
    }, headers=business_user["headers"])
    assert r.status_code == 201
    merchant = r.json()
    assert merchant["subscriptionPlan"] == "starter"
    await _approve_kyb(merchant["id"])

    r = await client.post(f"/api/merchant-pay/{merchant['id']}", json={
        "amount": "150.00", "payerName": "Payer", "pin": TEST_PIN,
    }, headers=funded_user["headers"])
    assert r.status_code == 201
    assert r.json()["newBalance"] == "147.75"  # 150 less the 1.5% merchant fee


async def test_merchant_forbidden_for_non_owner(client: AsyncClient, business_user: dict,
                                               other_business_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Bob's Shop", "businessType": "retail",
    }, headers=business_user["headers"])
    merchant_id = r.json()["id"]

    r = await client.get(f"/api/merchants/{merchant_id}", headers=other_business_user["headers"])
    assert r.status_code == 403


async def test_merchant_withdraw_uses_real_auth(client: AsyncClient, business_user: dict, funded_user: dict,
                                               monkeypatch):
    """Regression test: the original Node handler read req.userId, which
    nothing ever set — this endpoint was permanently 401 no matter who
    called it. Confirm the fixed version actually works for the owner."""
    from app.integrations import stitch

    owner = business_user
    r = await client.post("/api/merchants", json={
        "businessName": "Withdraw Test Co", "businessType": "services",
    }, headers=owner["headers"])
    merchant_id = r.json()["id"]

    # Merchant revenue comes from a real, ledger-backed customer payment.
    await _approve_kyb(merchant_id)
    paid = await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": "200.00", "pin": TEST_PIN},
                             headers=funded_user["headers"])
    assert paid.status_code == 201, paid.text

    r = await client.patch(f"/api/merchants/{merchant_id}/banking", json={
        "bankId": "fnb", "accountHolder": "Owner", "accountNumber": "12345", "accountType": "savings",
    }, headers=owner["headers"])
    assert r.status_code == 200, r.text

    async def fake_disbursement(**kwargs):
        return {"id": "dis_test", "status": "pending"}

    monkeypatch.setattr(stitch, "is_stitch_payments_configured", lambda: True)
    monkeypatch.setattr(stitch, "create_disbursement", fake_disbursement)
    r = await client.post(f"/api/merchants/{merchant_id}/withdraw", json={
        "pin": TEST_PIN, "amount": "100.00", "currency": "ZAR",
    }, headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["newBalance"] == "88.50"  # 200 - 1.5% fee - 100 payout - R8.50 payout fee


async def test_merchant_subscribe_invalid_plan(client: AsyncClient, business_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Sub Test", "businessType": "retail",
    }, headers=business_user["headers"])
    merchant_id = r.json()["id"]

    r = await client.post(f"/api/merchants/{merchant_id}/subscribe", json={"plan": "enterprise"},
                          headers=business_user["headers"])
    assert r.status_code == 400
