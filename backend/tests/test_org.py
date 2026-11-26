"""Organisation: departments, staff profiles, reporting lines, and country
scope enforced on the server."""

import pytest
from httpx import AsyncClient

from tests.test_network import named_admin, signup

pytestmark = pytest.mark.asyncio


async def test_departments_people_and_country_scope(client: AsyncClient, admin: dict):
    people = await named_admin(client, admin, "people_manager")
    agent = await named_admin(client, admin, "customer_support")
    manager = await named_admin(client, admin, "country_manager")

    r = await client.post("/api/admin/org/departments", json={"code": "support_t", "name": "Support (test)"},
                          headers=people["headers"])
    assert r.status_code == 201, r.text
    dept = r.json()["id"]
    org = (await client.get("/api/admin/org", headers=people["headers"])).json()
    agent_id = next(p["id"] for p in org["people"] if p["email"] == agent["email"])
    mgr_id = next(p["id"] for p in org["people"] if p["email"] == manager["email"])

    # Profile, manager, and no reporting loops.
    r = await client.patch(f"/api/admin/org/people/{agent_id}", headers=people["headers"],
                           json={"departmentId": dept, "title": "Support agent", "managerId": mgr_id})
    assert r.status_code == 200 and r.json()["department"] == "Support (test)"
    loop = await client.patch(f"/api/admin/org/people/{mgr_id}", json={"managerId": agent_id}, headers=people["headers"])
    assert loop.status_code == 400 and "loop" in loop.text

    # Country scope: a KE-only agent can't see a South African customer.
    customer = await signup(client, "ZA", kyc_level=1)
    r = await client.patch(f"/api/admin/org/people/{agent_id}", json={"countries": ["ke"]}, headers=people["headers"])
    assert r.json()["countries"] == ["KE"]
    listed = (await client.get("/api/admin/users", params={"q": customer["user"]["email"]}, headers=agent["headers"])).json()
    assert listed["users"] == []
    detail = await client.get(f"/api/admin/users/{customer['user']['id']}", headers=agent["headers"])
    assert detail.status_code == 403
    bad = await client.patch(f"/api/admin/org/people/{agent_id}", json={"countries": ["XX"]}, headers=people["headers"])
    assert bad.status_code == 400

    # All countries again → visible.
    await client.patch(f"/api/admin/org/people/{agent_id}", json={"countries": []}, headers=people["headers"])
    listed = (await client.get("/api/admin/users", params={"q": customer["user"]["email"]}, headers=agent["headers"])).json()
    assert len(listed["users"]) == 1

    # Departments with people can't be deleted; a support agent can't manage the org.
    assert (await client.delete(f"/api/admin/org/departments/{dept}", headers=people["headers"])).status_code == 409
    assert (await client.post("/api/admin/org/departments", json={"code": "x_t", "name": "X"},
                              headers=agent["headers"])).status_code == 403
