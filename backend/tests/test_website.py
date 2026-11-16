"""Admin-edited website content and the waitlist."""

from httpx import AsyncClient


async def test_public_site_serves_honest_defaults(client: AsyncClient):
    r = await client.get("/api/v1/public/site")
    assert r.status_code == 200
    site = r.json()
    assert site["settings"]["launchMode"] in ("waitlist", "live")
    assert site["faq"]["items"] and site["home"]["features"]
    assert site["pricing"]["enabled"] is False  # no prices published until the business sets them


async def test_admin_edits_section_with_validation_and_versioning(client: AsyncClient, admin: dict):
    site = (await client.get("/api/admin/website", headers=admin["headers"])).json()["site"]
    home = site["home"]
    version = site["versions"].get("home", 0)
    home["title"] = "Get paid across Africa"
    r = await client.put("/api/admin/website/home", json={"data": home, "version": version}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    assert (await client.get("/api/public/site")).json()["home"]["title"] == "Get paid across Africa"

    stale = await client.put("/api/admin/website/home", json={"data": home, "version": version}, headers=admin["headers"])
    assert stale.status_code == 409  # someone saved in between

    bad = await client.put("/api/admin/website/settings", json={"data": {"launchMode": "everywhere"}},
                           headers=admin["headers"])
    assert bad.status_code == 422
    unknown = await client.put("/api/admin/website/nope", json={"data": {}}, headers=admin["headers"])
    assert unknown.status_code == 404

    audit = (await client.get("/api/admin/audit", params={"action": "website"}, headers=admin["headers"]))
    assert audit.status_code == 200 and any("/website/" in a["action"] for a in audit.json())


async def test_website_edit_requires_permission(client: AsyncClient):
    r = await client.put("/api/admin/website/home", json={"data": {}})
    assert r.status_code in (401, 403)


async def test_waitlist_join_is_idempotent_and_listed(client: AsyncClient, admin: dict):
    email = "vendor-waitlist@example.com"
    for _ in range(2):
        r = await client.post("/api/v1/public/waitlist", json={"email": email, "kind": "business", "countryCode": "za"})
        assert r.status_code == 201
    bot = await client.post("/api/public/waitlist", json={"email": "bot@example.com", "website": "spam"})
    assert bot.status_code == 201
    listing = (await client.get("/api/admin/waitlist", headers=admin["headers"])).json()
    emails = [s["email"] for s in listing["signups"]]
    assert emails.count(email) == 1 and "bot@example.com" not in emails
    csv = await client.get("/api/admin/waitlist.csv", headers=admin["headers"])
    assert csv.status_code == 200 and email in csv.text
    bad = await client.post("/api/public/waitlist", json={"email": "not-an-email"})
    assert bad.status_code == 400
