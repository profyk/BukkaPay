import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_create_merchant_and_pay(client: AsyncClient, user: dict, funded_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Alice's Shop", "businessType": "retail",
    }, headers=user["headers"])
    assert r.status_code == 201
    merchant = r.json()
    assert merchant["subscriptionPlan"] == "starter"

    r = await client.post(f"/api/merchant-pay/{merchant['id']}", json={
        "amount": "150.00", "payerName": "Payer",
    }, headers=funded_user["headers"])
    assert r.status_code == 201
    assert r.json()["newBalance"] == "150.00"


async def test_merchant_forbidden_for_non_owner(client: AsyncClient, user: dict, other_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Bob's Shop", "businessType": "retail",
    }, headers=user["headers"])
    merchant_id = r.json()["id"]

    r = await client.get(f"/api/merchants/{merchant_id}", headers=other_user["headers"])
    assert r.status_code == 403


async def test_merchant_withdraw_uses_real_auth(client: AsyncClient, user: dict):
    """Regression test: the original Node handler read req.userId, which
    nothing ever set — this endpoint was permanently 401 no matter who
    called it. Confirm the fixed version actually works for the owner."""
    r = await client.post("/api/merchants", json={
        "businessName": "Withdraw Test Co", "businessType": "services",
    }, headers=user["headers"])
    merchant_id = r.json()["id"]

    await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": "200.00"}, headers=user["headers"])

    r = await client.post(f"/api/merchants/{merchant_id}/withdraw", json={
        "amount": "100.00", "currency": "ZAR",
        "bankingDetails": {"accountHolder": "Owner", "accountNumber": "12345"},
    }, headers=user["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["newBalance"] == "100.00"


async def test_merchant_subscribe_invalid_plan(client: AsyncClient, user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Sub Test", "businessType": "retail",
    }, headers=user["headers"])
    merchant_id = r.json()["id"]

    r = await client.post(f"/api/merchants/{merchant_id}/subscribe", json={"plan": "enterprise"}, headers=user["headers"])
    assert r.status_code == 400
