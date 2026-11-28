"""Merchant dashboard tools: customers report, business profile edits and
the PIN-protected payout bank account."""

from httpx import AsyncClient

from tests.conftest import TEST_PIN, fund_card
from tests.test_merchant import _approve_kyb
from tests.test_network import signup


async def _shop(client: AsyncClient) -> tuple[dict, str]:
    owner = await signup(client, app="merchant")
    r = await client.post("/api/merchants", json={"businessName": "Tools Shop", "businessType": "retail"},
                          headers=owner["headers"])
    assert r.status_code == 201, r.text
    await _approve_kyb(r.json()["id"])
    return owner, r.json()["id"]


async def _buyer(client: AsyncClient) -> dict:
    b = await signup(client)
    cards = await client.get("/api/cards", headers=b["headers"])
    await fund_card(cards.json()[0]["id"], "500.00")
    return b


async def test_customers_report(client: AsyncClient):
    owner, mid = await _shop(client)
    regular, once = await _buyer(client), await _buyer(client)
    for buyer, amount in ((regular, "40.00"), (regular, "60.00"), (once, "25.00")):
        r = await client.post(f"/api/merchant-pay/{mid}", json={"amount": amount, "pin": TEST_PIN}, headers=buyer["headers"])
        assert r.status_code == 201, r.text
    r = await client.get(f"/api/merchants/{mid}/customers", headers=owner["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["customers"] == 2
    assert body["summary"]["repeatCustomers"] == 1 and body["summary"]["repeatRate"] == 50
    top = body["customers"][0]
    assert top["payments"] == 2 and top["total"] == "100.00" and top["average"] == "50.00" and top["bukkapay"]
    # Another business's owner can't read it.
    stranger = await signup(client, app="merchant")
    assert (await client.get(f"/api/merchants/{mid}/customers", headers=stranger["headers"])).status_code in (403, 404)


async def test_profile_edits_are_validated(client: AsyncClient):
    owner, mid = await _shop(client)
    ok = await client.patch(f"/api/merchants/{mid}", json={
        "businessName": "  Tools   Shop Ltd ", "businessEmail": "hello@tools.example", "businessPhone": "+27 21 555 0101",
        "website": "https://tools.example"}, headers=owner["headers"])
    assert ok.status_code == 200, ok.text
    assert ok.json()["businessName"] == "Tools Shop Ltd"
    for bad in ({"businessName": " "}, {"businessEmail": "nope"}, {"businessPhone": "12"}, {"website": "tools.example"}):
        r = await client.patch(f"/api/merchants/{mid}", json=bad, headers=owner["headers"])
        assert r.status_code == 400, (bad, r.text)


async def test_payout_account_needs_pin_and_valid_number(client: AsyncClient):
    owner, mid = await _shop(client)
    body = {"bankId": "fnb", "accountHolder": "Tools Shop", "accountNumber": "6201 2345 678", "accountType": "cheque"}
    assert (await client.patch(f"/api/merchants/{mid}/banking", json=body, headers=owner["headers"])).status_code in (400, 401, 403)
    bad = await client.patch(f"/api/merchants/{mid}/banking", json={**body, "accountNumber": "12", "pin": TEST_PIN},
                             headers=owner["headers"])
    assert bad.status_code == 400
    r = await client.patch(f"/api/merchants/{mid}/banking", json={**body, "pin": TEST_PIN}, headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["accountNumber"].endswith("5678") and "62012345678" not in r.text  # masked
    notes = await client.get("/api/notifications", headers=owner["headers"])
    if notes.status_code == 200:
        items = notes.json() if isinstance(notes.json(), list) else notes.json().get("notifications", [])
        assert any("Payout bank account changed" in (n.get("title") or "") for n in items)
