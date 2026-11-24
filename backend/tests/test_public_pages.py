"""What the public pages (pay.bukkapay.com) can see without signing in."""

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


async def test_public_link_view_hides_payers_bank_and_customer_contact(client: AsyncClient, user: dict,
                                                                       other_user: dict):
    from tests.conftest import fund_card

    r = await client.post("/api/payment-links", json={
        "amount": "300.00", "description": "Catering", "allowPartialPayment": True, "minimumPayment": "50.00",
        "invoice": {"customerName": "Lerato M", "customerEmail": "lerato@example.com", "customerPhone": "+27820000000",
                    "items": [{"description": "Platters", "quantity": 1, "unitPrice": "300.00"}], "type": "invoice"},
    }, headers=user["headers"])
    assert r.status_code == 201, r.text
    link = r.json()
    assert link["paymentUrl"] == f"https://pay.bukkapay.com/{link['id']}"
    cards = (await client.get("/api/cards", headers=other_user["headers"])).json()
    await fund_card(cards[0]["id"], "500.00")
    paid = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN, "amount": "100.00"},
                             headers=other_user["headers"])
    assert paid.status_code == 200, paid.text

    public = (await client.get(f"/api/payment-links/{link['id']}")).json()
    assert public["payments"] is None and public["senderId"] is None and public["bankDetails"] is None
    assert public["invoice"]["customerName"] == "Lerato M"
    assert public["invoice"]["customerEmail"] is None and public["invoice"]["customerPhone"] is None
    assert public["amountPaid"] == "100.00"  # what's still to pay is public

    # A different signed-in user is still "public".
    other = (await client.get(f"/api/payment-links/{link['id']}", headers=other_user["headers"])).json()
    assert other["payments"] is None
    # The owner sees everything.
    mine = (await client.get(f"/api/payment-links/{link['id']}", headers=user["headers"])).json()
    assert len(mine["payments"]) == 1 and mine["invoice"]["customerEmail"] == "lerato@example.com"


async def test_public_claim_never_shows_the_cash_pickup_code(client: AsyncClient, funded_user: dict):
    r = await client.post("/api/claim-payments", json={"amount": "50.00", "recipientName": "Sipho", "recipientContact": "+27820000001",
                                                       "pin": "2468", "currency": "ZAR", "transactionPin": TEST_PIN},
                          headers=funded_user["headers"])
    assert r.status_code in (200, 201), r.text
    claim_id = r.json()["id"]
    assert r.json()["claimUrl"] == f"https://pay.bukkapay.com/claim/{claim_id}"
    cash = await client.post(f"/api/claim-payments/{claim_id}/claim-cash", json={"pin": "2468"})
    assert cash.status_code == 200, cash.text
    assert cash.json()["pickupCode"]
    public = (await client.get(f"/api/claim-payments/{claim_id}/public")).json()
    assert "pickupCode" not in public
