import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


async def test_create_and_pay_full_amount(client: AsyncClient, user: dict, funded_user: dict):
    r = await client.post("/api/payment-links", json={
        "amount": "200.00", "description": "Invoice for services",
    }, headers=user["headers"])
    assert r.status_code == 201
    link = r.json()
    assert link["status"] == "pending"
    assert link["destination"] == "wallet"

    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, }, headers=funded_user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "paid"
    assert body["amountPaid"] == "200.00"
    assert body["remaining"] == "0.00"


async def test_partial_payment_leaves_link_open(client: AsyncClient, user: dict, funded_user: dict):
    r = await client.post("/api/payment-links", json={
        "amount": "500.00", "allowPartialPayment": True, "minimumPayment": "50.00",
    }, headers=user["headers"])
    link = r.json()

    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, "amount": "100.00"}, headers=funded_user["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "partial"
    assert body["remaining"] == "400.00"


async def test_pay_already_paid_link_rejected(client: AsyncClient, user: dict, funded_user: dict):
    r = await client.post("/api/payment-links", json={"amount": "50.00"}, headers=user["headers"])
    link = r.json()
    await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, }, headers=funded_user["headers"])

    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, }, headers=funded_user["headers"])
    assert r.status_code == 400
    assert "already been fully paid" in r.json()["error"].lower()


async def test_pay_insufficient_balance(client: AsyncClient, user: dict):
    r = await client.post("/api/payment-links", json={"amount": "50.00"}, headers=user["headers"])
    link = r.json()

    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, }, headers=user["headers"])
    assert r.status_code == 402  # refused up front, before any payout is attempted
    assert r.json()["code"] in ("no_funds", "insufficient_funds") and "Top up" in r.json()["error"]


async def test_delete_only_by_owner(client: AsyncClient, user: dict, other_user: dict):
    r = await client.post("/api/payment-links", json={"amount": "10.00"}, headers=user["headers"])
    link_id = r.json()["id"]

    r = await client.delete(f"/api/payment-links/{link_id}", headers=other_user["headers"])
    assert r.status_code == 403

    r = await client.delete(f"/api/payment-links/{link_id}", headers=user["headers"])
    assert r.status_code == 200


async def test_invoice_created_with_link(client: AsyncClient, user: dict):
    r = await client.post("/api/payment-links", json={
        "amount": "300.00",
        "invoice": {
            "customerName": "Jane Doe",
            "items": [{"name": "Widget", "quantity": 2, "unitPrice": 75}],
        },
    }, headers=user["headers"])
    assert r.status_code == 201
    body = r.json()
    assert body["invoice"]["customerName"] == "Jane Doe"
    assert body["invoice"]["totalAmount"] == "150.00"


async def test_get_link_public_no_auth_required(client: AsyncClient, user: dict):
    r = await client.post("/api/payment-links", json={"amount": "20.00"}, headers=user["headers"])
    link_id = r.json()["id"]

    r = await client.get(f"/api/payment-links/{link_id}")
    assert r.status_code == 200
    assert r.json()["senderName"]


async def test_paid_link_cannot_be_deleted_only_cancelled(client: AsyncClient, user: dict, funded_user: dict, other_user: dict):
    r = await client.post("/api/payment-links", json={"amount": "200.00", "allowPartialPayment": True}, headers=user["headers"])
    link = r.json()
    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, "amount": "50.00"},
                          headers=funded_user["headers"])
    assert r.status_code == 200, r.text
    # Money has moved: deleting would erase financial records.
    r = await client.delete(f"/api/payment-links/{link['id']}", headers=user["headers"])
    assert r.status_code == 409
    r = await client.post(f"/api/payment-links/{link['id']}/cancel", headers=other_user["headers"])
    assert r.status_code == 403
    r = await client.post(f"/api/payment-links/{link['id']}/cancel", headers=user["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert r.json()["amountPaid"] in ("50.00", "50")
    # A cancelled link takes no more money.
    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, "amount": "10.00"},
                          headers=funded_user["headers"])
    assert r.status_code >= 400
