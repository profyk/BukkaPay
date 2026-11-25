"""Admin money controls: wallet-ID-only adjustments with a named source of
funds, balanced books, one-time bank references and reversals, conflict of
interest, company-cost limits needing the owner, and the monitoring report."""

from decimal import Decimal

import pytest
from httpx import AsyncClient

from tests.conftest import fund_card
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import named_admin, signup
from tests.test_trade import _balance, _rate

pytestmark = pytest.mark.asyncio


async def _file(client, maker, payload, reason="customer support case 123"):
    return await client.post("/api/admin/approvals", json={"action": "ledger.adjustment", "payload": payload,
                                                           "reason": reason}, headers=maker["headers"])


async def _decide(client, checker, req_id, approve=True):
    return await client.post(f"/api/admin/approvals/{req_id}/decide", json={"approve": approve},
                             headers=checker["headers"])


async def test_adjustments_need_wallet_id_and_a_source(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055")
    finance = await named_admin(client, admin, "finance_admin")
    u = await signup(client, "ZA", kyc_level=1)
    wid = u["user"]["walletId"]

    r = await _file(client, finance, {"wallet_card_id": u["card_id"], "direction": "credit", "amount": "10"})
    assert r.status_code == 400 and "wallet ID" in r.text
    r = await _file(client, finance, {"wallet_id": "NOPE-0000", "currency": "ZAR", "source": "goodwill",
                                      "direction": "credit", "amount": "10"})
    assert r.status_code == 404
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "direction": "credit", "amount": "10"})
    assert r.status_code == 400 and "source of funds" in r.text
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "source": "goodwill",
                                      "direction": "debit", "amount": "10"})
    assert r.status_code == 400

    look = await client.get("/api/admin/wallet-lookup", params={"walletId": wid}, headers=finance["headers"])
    assert look.status_code == 200 and look.json()["name"] == u["user"]["name"]


async def test_goodwill_limits_and_owner_signoff(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055")
    finance = await named_admin(client, admin, "finance_admin")
    compliance = await named_admin(client, admin, "compliance_officer")
    u = await signup(client, "ZA", kyc_level=1)
    wid = u["user"]["walletId"]
    goodwill_before = await _balance("expense:goodwill:ZAR")

    # Small goodwill credit: maker-checker is enough. Funded by the company (expense), books balance.
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "source": "goodwill",
                                      "direction": "credit", "amount": "25.00", "holder_name": "spoofed",
                                      "controls": {"requires_owner": False}})
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["payload"]["holderName" if "holderName" in req["payload"] else "holder_name"] == u["user"]["name"]
    assert (await _decide(client, compliance, req["id"])).json()["status"] == "executed"
    assert await card_balance(u["card_id"]) == Decimal("25.00")
    assert await _balance("expense:goodwill:ZAR") == goodwill_before + Decimal("25.00")

    # Large goodwill credit: the owner must be maker or checker.
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "source": "goodwill",
                                      "direction": "credit", "amount": "2000.00"})
    big = r.json()
    payload = big["payload"]
    assert payload["controls"]["requires_owner"] is True
    refused = await _decide(client, compliance, big["id"])
    assert refused.status_code == 403 and "owner must approve" in refused.text
    assert await card_balance(u["card_id"]) == Decimal("25.00")
    assert (await _decide(client, admin, big["id"])).json()["status"] == "executed"
    assert await card_balance(u["card_id"]) == Decimal("2025.00")

    # Recovery takes a goodwill credit back; never below zero.
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "source": "recovery",
                                      "direction": "debit", "amount": "5000.00"})
    res = (await _decide(client, admin, r.json()["id"])).json()
    assert res["status"] == "failed" and await card_balance(u["card_id"]) == Decimal("2025.00")

    report = (await client.get("/api/admin/adjustments/report", headers=finance["headers"])).json()
    assert any(i["walletId"] == wid and i["ownerRequired"] for i in report["items"])
    await assert_ledger_consistent()


async def test_bank_deposits_once_and_reversals_once(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055")
    finance = await named_admin(client, admin, "finance_admin")
    compliance = await named_admin(client, admin, "compliance_officer")
    u = await signup(client, "ZA", kyc_level=1)
    wid = u["user"]["walletId"]
    ref = f"FNB-STMT-{wid}"

    dep = {"wallet_id": wid, "currency": "ZAR", "source": "bank_deposit", "direction": "credit", "amount": "100.00"}
    assert (await _file(client, finance, dep)).status_code == 400  # needs the statement reference
    r = await _file(client, finance, {**dep, "evidence_reference": ref})
    assert r.status_code == 201
    dup = await _file(client, finance, {**dep, "evidence_reference": ref})
    assert dup.status_code == 409  # pending already
    result = (await _decide(client, compliance, r.json()["id"])).json()
    assert result["status"] == "executed"
    journal = result["result"]["journal_reference"]
    assert await card_balance(u["card_id"]) == Decimal("100.00")
    assert (await _file(client, finance, {**dep, "evidence_reference": ref})).status_code == 409  # credited already

    # Reverse it (exact mirror), once only.
    rev = {"wallet_id": wid, "currency": "ZAR", "source": "reversal", "direction": "debit", "journal_reference": journal}
    r = await _file(client, finance, rev)
    assert r.status_code == 201, r.text
    assert (await _decide(client, compliance, r.json()["id"])).json()["status"] == "executed"
    assert await card_balance(u["card_id"]) == Decimal("0.00")
    assert (await _file(client, finance, rev)).status_code == 409

    # A reversal must touch this customer.
    other = await signup(client, "ZA", kyc_level=1)
    await fund_card(other["card_id"], "10.00")
    r = await _file(client, finance, {**rev, "wallet_id": other["user"]["walletId"]})
    assert r.status_code in (404, 409)
    await assert_ledger_consistent()


async def test_conflict_of_interest_and_owner_only_limits(client: AsyncClient, admin: dict):
    await _rate("ZAR", "USD", "0.055")
    finance = await named_admin(client, admin, "finance_admin")
    # A customer account with the same name as the finance admin ("finance_admin").
    from tests.conftest import set_test_pin, unique_email, unique_username

    r = await client.post("/api/auth/signup", json={
        "name": "finance_admin", "email": unique_email(), "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": True})
    wid = r.json()["user"]["walletId"]
    await set_test_pin(client, {"Authorization": f"Bearer {r.json()['token']}"})
    r = await _file(client, finance, {"wallet_id": wid, "currency": "ZAR", "source": "goodwill",
                                      "direction": "credit", "amount": "5.00"})
    assert r.status_code == 403 and "belong to you" in r.text

    r = await client.patch("/api/admin/adjustments/controls", json={"goodwill_max_usd": 5000}, headers=finance["headers"])
    assert r.status_code == 403
    r = await client.patch("/api/admin/adjustments/controls", json={"goodwill_max_usd": 60}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["goodwill_max_usd"] == 60
    await client.patch("/api/admin/adjustments/controls", json={"goodwill_max_usd": 50}, headers=admin["headers"])
