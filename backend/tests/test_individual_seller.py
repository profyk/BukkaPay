"""Individual sellers (street vendors, tuck shops, individual landlords):
no business documents, verified through the owner's own ID, collections
capped by the "merchant_individual" limit (ZA seed: 5,000 per payment,
10,000 per day, 25,000 per 30 days)."""


from httpx import AsyncClient

from tests.conftest import TEST_PIN, fund_card
from tests.test_ledger import assert_ledger_consistent
from tests.test_network import signup


async def vendor(client: AsyncClient, kyc_level: int = 2, business_type: str = "street_vendor") -> tuple[dict, str]:
    owner = await signup(client, kyc_level=kyc_level)
    r = await client.post("/api/merchants", json={"businessName": "Mama's Kota", "businessType": business_type},
                          headers=owner["headers"])
    assert r.status_code in (200, 201), r.text
    return owner, r.json()["id"]


async def pay(client, payer, merchant_id, amount):
    return await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": amount, "pin": TEST_PIN},
                             headers=payer["headers"])


async def test_street_vendor_verifies_instantly_without_documents(client: AsyncClient):
    owner, merchant_id = await vendor(client)
    r = await client.post(f"/api/merchants/{merchant_id}/kyb/individual", headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json() == {"kybStatus": "approved", "verificationTier": "individual"}

    payer = await signup(client)
    await fund_card(payer["card_id"], "500.00")
    r = await pay(client, payer, merchant_id, "45.00")
    assert r.status_code in (200, 201), r.text
    await assert_ledger_consistent()


async def test_owner_without_verified_id_cannot_use_individual_tier(client: AsyncClient):
    owner, merchant_id = await vendor(client, kyc_level=1)
    r = await client.post(f"/api/merchants/{merchant_id}/kyb/individual", headers=owner["headers"])
    assert r.status_code == 403


async def test_individual_seller_caps_apply(client: AsyncClient):
    owner, merchant_id = await vendor(client)
    await client.post(f"/api/merchants/{merchant_id}/kyb/individual", headers=owner["headers"])
    payer = await signup(client, kyc_level=2)
    await fund_card(payer["card_id"], "20000.00")

    r = await pay(client, payer, merchant_id, "5000.01")
    assert r.status_code == 403 and "per payment" in r.json()["error"]

    assert (await pay(client, payer, merchant_id, "5000.00")).status_code in (200, 201)
    assert (await pay(client, payer, merchant_id, "5000.00")).status_code in (200, 201)
    # caps count what the seller receives (after the 1.5% fee): 9,850 so far
    assert (await pay(client, payer, merchant_id, "150.00")).status_code in (200, 201)
    r = await pay(client, payer, merchant_id, "10.00")
    assert r.status_code == 403 and "daily" in r.json()["error"]


async def test_vendor_can_upgrade_to_full_kyb_and_keeps_trading_meanwhile(client: AsyncClient, admin: dict):
    owner, merchant_id = await vendor(client)
    await client.post(f"/api/merchants/{merchant_id}/kyb/individual", headers=owner["headers"])
    r = await client.post(f"/api/merchants/{merchant_id}/kyb", json={
        "registrationNumber": "2024/555/07", "businessAddress": "Stall 4, Main Rd", "countryCode": "ZA",
        "businessCategory": "food", "contactEmail": "kota@example.com", "contactPhone": "+27110000001",
        "directors": [{"fullName": "Owner", "idNumber": "8001015009087"}],
        "documents": [{"type": t, "url": f"https://files.example/{t}.pdf"}
                      for t in ("registration_certificate", "proof_of_address", "director_id")],
    }, headers=owner["headers"])
    assert r.status_code == 200, r.text

    payer = await signup(client)
    await fund_card(payer["card_id"], "100.00")
    assert (await pay(client, payer, merchant_id, "20.00")).status_code in (200, 201)  # still trading

    r = await client.post(f"/api/admin/merchants/{merchant_id}/kyb", json={"approve": True}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    memberships = (await client.get("/api/merchant-memberships", headers=owner["headers"])).json()
    m = next(x for x in memberships if x["id"] == merchant_id)
    assert m["verificationTier"] == "business" and m["kybStatus"] == "approved"


async def test_unverified_merchant_still_blocked(client: AsyncClient):
    owner, merchant_id = await vendor(client)
    payer = await signup(client)
    await fund_card(payer["card_id"], "100.00")
    assert (await pay(client, payer, merchant_id, "10.00")).status_code == 403
