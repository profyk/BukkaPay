"""Africa rollout: reference data for every AU member, provider coverage,
the readiness checklist, and the country lock on sign-up and sign-in
(closed → ready → unlocked by a second admin → suspended → closed)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text, update

from app.db.base import get_session_factory
from app.models.platform import (
    Country,
    CountryCustodian,
    Custodian,
    PaymentProvider,
    TransactionLimit,
)
from app.models.reference import Currency
from app.reference import africa
from tests.conftest import unique_email, unique_username
from tests.test_network import approve, named_admin

pytestmark = pytest.mark.asyncio

CODE = "RW"


async def test_every_african_union_member_is_known(client: AsyncClient):
    countries = {c["code"]: c for c in (await client.get("/api/public/countries")).json()}
    missing = [c for c in africa.AFRICA if c not in countries]
    assert missing == [] and len(africa.AFRICA) == 55
    assert countries["ZA"]["open"] is True and countries["NG"]["open"] is False
    assert countries["EH"]["name"] == "Western Sahara" and countries["NG"]["phoneLengths"] == [10]
    async with get_session_factory()() as db:
        ng = await db.get(Country, "NG")
        assert ng.iso3 == "NGA" and ng.capital == "Abuja" and "ECOWAS" in ng.regional_blocs
        zw = await db.get(Country, "ZW")
        assert "SADC" in zw.regional_blocs and zw.secondary_currencies == ["USD"]


async def test_rollout_catalogue_and_coverage(client: AsyncClient, admin: dict):
    r = await client.get("/api/admin/network/rollout", headers=admin["headers"])
    assert r.status_code == 200
    by_code = {p["code"]: p for p in r.json()["catalogue"]}
    assert by_code["onafriq"]["countries"] >= 40 and by_code["smile_id"]["countries"] == 55
    assert by_code["pawapay"]["coverageByStatus"].get("planned", 0) >= 19

    detail = (await client.get(f"/api/admin/network/countries/{CODE}", headers=admin["headers"])).json()
    assert detail["readiness"]["ready"] is False and detail["country"]["open"] is False
    seeded = {c["provider"]["code"] for c in detail["coverage"]}
    assert {"onafriq", "pawapay", "smile_id"} <= seeded and all(c["status"] == "planned" for c in detail["coverage"])

    # Coverage CRUD
    papss = next(p for p in (await client.get("/api/admin/network/providers", headers=admin["headers"])).json()
                 if p["code"] == "papss")
    bad = await client.post("/api/admin/network/provider-coverage", headers=admin["headers"],
                            json={"providerId": papss["id"], "countryCode": "EH", "capabilities": ["teleport"]})
    assert bad.status_code == 400
    r = await client.post("/api/admin/network/provider-coverage", headers=admin["headers"],
                          json={"providerId": papss["id"], "countryCode": "EH", "capabilities": ["cross_border"]})
    assert r.status_code == 201 and r.json()["currencies"] == ["MAD"]
    dup = await client.post("/api/admin/network/provider-coverage", headers=admin["headers"],
                            json={"providerId": papss["id"], "countryCode": "EH", "capabilities": ["cross_border"]})
    assert dup.status_code == 409
    cov_id = r.json()["id"]
    r = await client.patch(f"/api/admin/network/provider-coverage/{cov_id}", json={"status": "contracting"},
                           headers=admin["headers"])
    assert r.json()["status"] == "contracting"
    assert (await client.delete(f"/api/admin/network/provider-coverage/{cov_id}",
                                headers=admin["headers"])).json()["deleted"] is True


async def _signup(client, app=None):
    return await client.post("/api/auth/signup", json={
        "name": "Rw User", "email": (email := unique_email()), "username": unique_username(), "password": "password123",
        "residenceCountry": CODE, "acceptTerms": True, **({"app": app} if app else {})}), email


async def _set_live(provider_code: str, caps: list[str]) -> None:
    async with get_session_factory()() as db:
        pid = (await db.execute(select(PaymentProvider.id).where(PaymentProvider.code == provider_code))).scalar_one()
        await db.execute(update(PaymentProvider).where(PaymentProvider.id == pid)
                         .values(status="active", mode="production"))
        await db.execute(text("UPDATE provider_countries SET status='live', capabilities=CAST(:c AS jsonb) "
                              "WHERE provider_id=:p AND country_code=:cc"),
                         {"c": __import__("json").dumps(caps), "p": pid, "cc": CODE})
        await db.commit()


async def test_country_unlock_lifecycle(client: AsyncClient, admin: dict):
    ops = await named_admin(client, admin, "operations_admin")
    compliance = await named_admin(client, admin, "compliance_officer")

    # Closed: no sign-up.
    r, _ = await _signup(client)
    assert r.status_code == 403 and "not available in Rwanda" in r.text
    result = await approve(client, ops, admin, "country.set_status", {"country": CODE, "status": "pilot"})
    assert result["status"] == "failed" and "Missing: Compliance sign-off" in result["result"]["error"]

    # Compliance sign-off: compliance role only, needs regulator + licence model.
    r = await client.post(f"/api/admin/network/countries/{CODE}/compliance", json={"approved": True},
                          headers=compliance["headers"])
    assert r.status_code == 400
    r = await client.post(f"/api/admin/network/countries/{CODE}/compliance",
                          json={"approved": True, "regulator": "National Bank of Rwanda", "licenceModel": "partner_bank"},
                          headers=ops["headers"])
    assert r.status_code == 403
    r = await client.post(f"/api/admin/network/countries/{CODE}/compliance",
                          json={"approved": True, "regulator": "National Bank of Rwanda", "licenceModel": "partner_bank"},
                          headers=compliance["headers"])
    assert r.status_code == 200 and r.json()["complianceSignedBy"]

    # Custodian, wallets, rails, KYC, limits (what the admin screens set up).
    async with get_session_factory()() as db:
        cust = Custodian(name="Ecobank Rwanda", country_code=CODE, institution_type="bank", status="active",
                         integration_status="production", regulatory_status="licensed", contact={})
        db.add(cust)
        await db.flush()
        db.add(CountryCustodian(country_code=CODE, currency_code="RWF", custodian_id=cust.id, role="primary",
                                status="active", collection_methods=[], withdrawal_methods=[],
                                reconciliation_settings={}))
        await db.execute(update(Currency).where(Currency.code == "RWF").values(wallet_enabled=True))
        await db.execute(text("UPDATE country_currencies SET wallet_enabled=true WHERE country_code=:c "
                              "AND currency_code='RWF'"), {"c": CODE})
        db.add(TransactionLimit(product="p2p", country_code=CODE, currency="RWF", kyc_level=1, active=True))
        await db.commit()
    await _set_live("pawapay", ["collect_mobile_money", "payout_mobile_money"])
    detail = (await client.get(f"/api/admin/network/countries/{CODE}", headers=admin["headers"])).json()
    missing = [i["key"] for i in detail["readiness"]["items"] if i["required"] and not i["ok"]]
    assert missing == ["kyc"]
    await _set_live("smile_id", ["kyc"])
    detail = (await client.get(f"/api/admin/network/countries/{CODE}", headers=admin["headers"])).json()
    assert detail["readiness"]["ready"] is True

    # Unlock: maker-checker.
    result = await approve(client, ops, admin, "country.set_status", {"country": CODE, "status": "pilot"})
    assert result["status"] == "executed", result
    r, email = await _signup(client)
    assert r.status_code == 201, r.text
    login = await client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    # Can't withdraw sign-off while open.
    r = await client.post(f"/api/admin/network/countries/{CODE}/compliance", json={"approved": False},
                          headers=compliance["headers"])
    assert r.status_code == 409

    # Suspended: no new sign-ups, existing customers can still sign in.
    assert (await approve(client, ops, admin, "country.set_status",
                          {"country": CODE, "status": "suspended"}))["status"] == "executed"
    r, _ = await _signup(client)
    assert r.status_code == 403
    assert (await client.post("/api/auth/login", json={"email": email, "password": "password123"})).status_code == 200

    # Closed again: sign-in refused too.
    assert (await approve(client, ops, admin, "country.set_status",
                          {"country": CODE, "status": "planned"}))["status"] == "executed"
    r = await client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 403 and "not available in Rwanda" in r.text

    # Leave the shared catalogue providers as seeded.
    async with get_session_factory()() as db:
        await db.execute(update(PaymentProvider).where(PaymentProvider.code.in_(("pawapay", "smile_id")))
                         .values(status="inactive", mode="sandbox"))
        await db.commit()
    assert uuid  # (module import kept for helpers)
