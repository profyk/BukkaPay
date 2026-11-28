"""Legal documents pipeline: admin draft → published version → website."""

from httpx import AsyncClient

from app.legal import catalog


async def test_public_serves_every_standard_document_as_a_marked_draft(client: AsyncClient):
    listing = (await client.get("/api/v1/public/legal")).json()
    slugs = [d["slug"] for d in listing]
    for std in catalog.STANDARD:
        assert std.slug in slugs
    assert all(d["reviewStatus"] == "template" and d["version"] == 0 for d in listing)

    doc = (await client.get("/api/public/legal/privacy-policy")).json()
    assert doc["reviewStatus"] == "template" and doc["isLatest"] is True
    assert "{{" not in doc["body"]  # every placeholder filled or shown as [label]
    # Details not entered yet read as plain, truthful wording (catalog.fill), not [brackets].
    assert "in the process of registration" in doc["body"] and "[Company legal name]" not in doc["body"]
    assert (await client.get("/api/public/legal/nope")).status_code == 404


async def test_every_template_uses_only_known_placeholders():
    for std in catalog.STANDARD:
        assert catalog.unknown_tokens(catalog.template(std.slug)) == [], std.slug


async def test_draft_publish_and_history(client: AsyncClient, admin: dict):
    h = admin["headers"]
    doc = (await client.get("/api/admin/legal/terms", headers=h)).json()
    draft = doc["draft"]
    assert draft["fromTemplate"] is True and doc["versions"] == []

    data = {k: draft[k] for k in ("title", "summary", "audience", "body", "sortOrder", "listed")}
    data["body"] = draft["body"] + "\n## 22. Extra\n\nAdded clause.\n"
    r = await client.put("/api/admin/legal/terms", json={"data": data, "version": draft["draftVersion"]}, headers=h)
    assert r.status_code == 200, r.text
    saved = r.json()["draft"]
    # saving a draft does not change the website
    assert "Added clause" not in (await client.get("/api/public/legal/terms")).json()["body"]

    stale = await client.put("/api/admin/legal/terms", json={"data": data, "version": draft["draftVersion"]}, headers=h)
    assert stale.status_code == 409

    no_reviewer = await client.post("/api/admin/legal/terms/publish", headers=h, json={
        "effectiveDate": "2026-12-01", "reviewStatus": "approved", "draftVersion": saved["draftVersion"]})
    assert no_reviewer.status_code == 400

    r = await client.post("/api/admin/legal/terms/publish", headers=h, json={
        "effectiveDate": "2026-12-01", "reviewStatus": "in_review", "changeNote": "First version",
        "draftVersion": saved["draftVersion"]})
    assert r.status_code == 200, r.text
    assert r.json()["versions"][0]["version"] == 1

    public = (await client.get("/api/public/legal/terms")).json()
    assert public["version"] == 1 and public["effectiveDate"] == "2026-12-01"
    assert public["reviewStatus"] == "in_review" and "Added clause" in public["body"]

    data["body"] += "\nSecond change.\n"
    saved = (await client.put("/api/admin/legal/terms", json={"data": data, "version": saved["draftVersion"]},
                              headers=h)).json()["draft"]
    await client.post("/api/admin/legal/terms/publish", headers=h, json={
        "effectiveDate": "2027-01-01", "reviewStatus": "approved", "reviewedBy": "Example Attorneys",
        "draftVersion": saved["draftVersion"]})
    public = (await client.get("/api/public/legal/terms")).json()
    assert public["version"] == 2 and [v["version"] for v in public["history"]] == [2, 1]
    old = (await client.get("/api/public/legal/terms", params={"version": 1})).json()
    assert old["isLatest"] is False and "Second change" not in old["body"]

    audit = await client.get("/api/admin/audit", params={"action": "legal"}, headers=h)
    assert audit.status_code == 200 and any("/legal/{slug}/publish" in a["action"] for a in audit.json())


async def test_company_details_fill_placeholders(client: AsyncClient, admin: dict):
    h = admin["headers"]
    current = (await client.get("/api/admin/legal", headers=h)).json()
    details = current["details"] | {"legalName": "Example Pay (Pty) Ltd", "registrationNumber": "2026/000001/07"}
    r = await client.put("/api/admin/legal-details", json={"data": details, "version": current["detailsVersion"]},
                         headers=h)
    assert r.status_code == 200, r.text
    body = (await client.get("/api/public/legal/paia-manual")).json()["body"]
    assert "Example Pay (Pty) Ltd" in body and "2026/000001/07" in body


async def test_custom_document_is_hidden_until_published(client: AsyncClient, admin: dict):
    h = admin["headers"]
    r = await client.post("/api/admin/legal", json={"slug": "fee-schedule", "title": "Fee schedule"}, headers=h)
    assert r.status_code == 201, r.text
    assert "fee-schedule" not in [d["slug"] for d in (await client.get("/api/public/legal")).json()]
    assert (await client.get("/api/public/legal/fee-schedule")).status_code == 404

    bad = await client.put("/api/admin/legal/fee-schedule", headers=h, json={"data": {
        "title": "Fee schedule", "body": "## Fees\n\nSee {{not_a_field}} for details.", "audience": "everyone"}})
    assert bad.status_code == 422
    dup = await client.post("/api/admin/legal", json={"slug": "terms", "title": "Terms again"}, headers=h)
    assert dup.status_code == 409

    draft = r.json()["draft"]
    await client.post("/api/admin/legal/fee-schedule/publish", headers=h, json={
        "effectiveDate": "2026-12-01", "reviewStatus": "template", "draftVersion": draft["draftVersion"]})
    assert "fee-schedule" in [d["slug"] for d in (await client.get("/api/public/legal")).json()]


async def test_legal_admin_requires_permission(client: AsyncClient):
    assert (await client.get("/api/admin/legal")).status_code in (401, 403)
    r = await client.post("/api/admin/legal/terms/publish", json={"effectiveDate": "2026-12-01", "reviewStatus": "template"})
    assert r.status_code in (401, 403)
