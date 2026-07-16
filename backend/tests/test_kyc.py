import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_kyc_status_starts_not_submitted(client: AsyncClient, user: dict):
    r = await client.get("/api/kyc/status", headers=user["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["kycStatus"] == "not_submitted"


async def test_kyc_submit_happy_path(client: AsyncClient, user: dict):
    r = await client.post("/api/kyc/submit", json={
        "fullName": "Test User", "documentType": "national_id", "documentNumber": "8001015800086",
    }, headers=user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kycStatus"] == "pending"
    assert body["kycDocumentType"] == "national_id"
    assert body["kycDocumentNumber"] == "8001015800086"

    r = await client.get("/api/kyc/status", headers=user["headers"])
    assert r.json()["kycStatus"] == "pending"


async def test_kyc_submit_rejects_unknown_document_type(client: AsyncClient, user: dict):
    r = await client.post("/api/kyc/submit", json={
        "fullName": "Test User", "documentType": "made_up", "documentNumber": "123",
    }, headers=user["headers"])
    assert r.status_code == 400


async def test_new_user_does_not_appear_in_admin_kyc_queue(client: AsyncClient, admin: dict, user: dict):
    r = await client.get("/api/admin/kyc", headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert not any(row["userId"] == user["user"]["id"] for row in r.json()["kyc"])


async def test_admin_kyc_approve_flow(client: AsyncClient, admin: dict, user: dict):
    await client.post("/api/kyc/submit", json={
        "fullName": "Real Name", "documentType": "passport", "documentNumber": "P1234567",
    }, headers=user["headers"])

    r = await client.get("/api/admin/kyc", headers=admin["headers"])
    row = next(row for row in r.json()["kyc"] if row["userId"] == user["user"]["id"])
    assert row["status"] == "pending"
    assert row["fullName"] == "Real Name"
    assert row["documentType"] == "passport"

    r = await client.post(f"/api/admin/kyc/{user['user']['id']}/approve", headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["user"]["verified"] is True

    r = await client.get("/api/kyc/status", headers=user["headers"])
    assert r.json()["kycStatus"] == "approved"


async def test_admin_kyc_reject_then_resubmit(client: AsyncClient, admin: dict, user: dict):
    await client.post("/api/kyc/submit", json={
        "fullName": "Blurry Doc", "documentType": "driver_license", "documentNumber": "DL999",
    }, headers=user["headers"])

    r = await client.get("/api/admin/kyc", headers=admin["headers"])
    row = next(row for row in r.json()["kyc"] if row["userId"] == user["user"]["id"])

    r = await client.post(
        f"/api/admin/kyc/{user['user']['id']}/reject", json={"reason": "Document is blurry"},
        headers=admin["headers"],
    )
    assert r.status_code == 200, r.text

    r = await client.get("/api/kyc/status", headers=user["headers"])
    body = r.json()
    assert body["kycStatus"] == "rejected"
    assert body["kycRejectionReason"] == "Document is blurry"

    # Resubmission clears the rejection and goes back to pending.
    r = await client.post("/api/kyc/submit", json={
        "fullName": "Clear Doc", "documentType": "driver_license", "documentNumber": "DL999",
    }, headers=user["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kycStatus"] == "pending"
    assert body["kycRejectionReason"] is None


async def test_cannot_resubmit_after_approval(client: AsyncClient, admin: dict, user: dict):
    await client.post("/api/kyc/submit", json={
        "fullName": "Approved User", "documentType": "national_id", "documentNumber": "111",
    }, headers=user["headers"])
    await client.post(f"/api/admin/kyc/{user['user']['id']}/approve", headers=admin["headers"])

    r = await client.post("/api/kyc/submit", json={
        "fullName": "Approved User", "documentType": "national_id", "documentNumber": "111",
    }, headers=user["headers"])
    assert r.status_code == 400
    assert "already verified" in r.json()["error"].lower()
