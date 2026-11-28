"""Business registration end to end: create the business, submit verification
(KYB) with every field checked server-side, and the review decision."""

from httpx import AsyncClient

from tests.test_network import signup

DOCS = [{"type": t, "url": f"https://files.example/{t}.pdf"}
        for t in ("registration_certificate", "proof_of_address", "director_id")]


def kyb(**over) -> dict:
    body = {
        "registrationNumber": " 2024/555/07 ", "businessAddress": "12 Long St, Cape Town", "countryCode": "za",
        "businessCategory": "grocery retail", "contactEmail": " Shop@Example.com ", "contactPhone": "+27 82 555 0101",
        "directors": [{"fullName": "  Ama   Mensah ", "idNumber": "8001015009087"}, {"fullName": "", "idNumber": ""}],
        "documents": DOCS,
    }
    body.update(over)
    return body


async def _business(client: AsyncClient, **json) -> tuple[dict, str]:
    owner = await signup(client, app="merchant")
    r = await client.post("/api/merchants", json={"businessName": "Mama's Kota", "businessType": "restaurant", **json},
                          headers=owner["headers"])
    assert r.status_code == 201, r.text
    return owner, r.json()["id"]


async def test_new_business_always_starts_on_starter(client: AsyncClient):
    owner, mid = await _business(client, subscriptionPlan="enterprise", businessName="  Mama's   Kota  ")
    r = await client.get(f"/api/merchants/{mid}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["subscriptionPlan"] == "starter"
    assert r.json()["businessName"] == "Mama's Kota"
    bad = await client.post("/api/merchants", json={"businessName": "   ", "businessType": "retail"}, headers=owner["headers"])
    assert bad.status_code == 400


async def test_kyb_submission_is_cleaned_and_goes_to_review(client: AsyncClient, admin: dict):
    owner, mid = await _business(client)
    r = await client.post(f"/api/merchants/{mid}/kyb", json=kyb(), headers=owner["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["kybStatus"] == "pending"
    # Can't submit twice while it's under review.
    again = await client.post(f"/api/merchants/{mid}/kyb", json=kyb(), headers=owner["headers"])
    assert again.status_code == 409
    # The reviewer sees the cleaned details.
    q = await client.get("/api/admin/merchants/kyb", headers=admin["headers"])
    assert q.status_code == 200, q.text
    row = next(m for m in q.json() if str(m.get("id")) == mid)
    details = row.get("kybDetails") or row.get("kyb_details")
    assert details["directors"] == [{"full_name": "Ama Mensah", "id_number": "8001015009087", "role": "director"}]
    assert (row.get("businessEmail") or row.get("business_email")) == "shop@example.com"
    ok = await client.post(f"/api/admin/merchants/{mid}/kyb", json={"approve": True}, headers=admin["headers"])
    assert ok.status_code == 200, ok.text
    mine = await client.get("/api/merchant-memberships", headers=owner["headers"])
    assert next(m for m in mine.json() if m["id"] == mid)["kybStatus"] == "approved"


async def test_kyb_refuses_bad_fields_with_a_clear_message(client: AsyncClient):
    owner, mid = await _business(client)
    cases = {
        "registration number": kyb(registrationNumber=" "),
        "address": kyb(businessAddress="x"),
        "category": kyb(businessCategory=""),
        "email": kyb(contactEmail="not-an-email"),
        "phone": kyb(contactPhone="12"),
        "director": kyb(directors=[{"fullName": "", "idNumber": ""}]),
        "ID or passport": kyb(directors=[{"fullName": "Ama Mensah", "idNumber": "1"}]),
        "twice": kyb(directors=[{"fullName": "A One", "idNumber": "800101"}, {"fullName": "B Two", "idNumber": "800101"}]),
        "document type": kyb(documents=DOCS + [{"type": "selfie", "url": "https://files.example/x.png"}]),
        "Missing documents": kyb(documents=DOCS[:2]),
    }
    for word, body in cases.items():
        r = await client.post(f"/api/merchants/{mid}/kyb", json=body, headers=owner["headers"])
        assert r.status_code == 400, (word, r.status_code, r.text)
        assert word.lower() in r.json()["error"].lower(), (word, r.json())


async def test_only_the_owner_submits_verification(client: AsyncClient):
    _owner, mid = await _business(client)
    stranger = await signup(client, app="merchant")
    r = await client.post(f"/api/merchants/{mid}/kyb", json=kyb(), headers=stranger["headers"])
    assert r.status_code in (403, 404)
