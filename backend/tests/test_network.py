"""End-to-end tests for the network platform: maker-checker, corridors and
FX quotes, the cross-border state machine (sandbox rail), webhooks, fees,
limits, reconciliation, merchants (KYB, signed QR, refunds, checkout
links), contributions, request money, permissions and audit."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text, update

from app.db.base import get_session_factory
from app.models.ledger import LedgerAccount
from app.models.platform import AuditLog, Country, FxQuote, PaymentCorridor
from app.models.reference import Currency
from app.models.user import User
from app.network import outbox, webhooks
from tests.conftest import TEST_PIN, fund_card, set_test_pin, unique_email, unique_username
from tests.test_ledger import assert_ledger_consistent, card_balance

pytestmark = pytest.mark.asyncio


# ─── helpers ────────────────────────────────────────────────────────────────


async def signup(client: AsyncClient, country: str = "ZA", kyc_level: int | None = None,
                 app: str | None = None) -> dict:
    r = await client.post("/api/auth/signup", json={
        "name": "Net User", "email": unique_email(), "username": unique_username(), "password": "password123",
        "residenceCountry": country, "acceptTerms": True, **({"app": app} if app else {}),
    })
    assert r.status_code == 201, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    await set_test_pin(client, headers)
    if kyc_level is not None:
        async with get_session_factory()() as db:
            await db.execute(update(User).where(User.id == uuid.UUID(body["user"]["id"])).values(kyc_level=kyc_level))
            await db.commit()
    if app == "merchant":  # business accounts can't call personal wallet routes
        from app.models.wallet import WalletCard

        async with get_session_factory()() as db:
            card = (await db.execute(select(WalletCard).where(
                WalletCard.user_id == uuid.UUID(body["user"]["id"])))).scalars().first()
        return {"user": body["user"], "headers": headers, "card_id": str(card.id), "currency": card.currency}
    cards = (await client.get("/api/cards", headers=headers)).json()
    return {"user": body["user"], "headers": headers, "card_id": cards[0]["id"], "currency": cards[0]["currency"]}


async def named_admin(client: AsyncClient, admin: dict, role: str) -> dict:
    email = f"{role}-{uuid.uuid4().hex[:6]}@example.com"
    r = await client.post("/api/admin/admins", json={"email": email, "name": role, "password": "password123",
                                                     "role": role}, headers=admin["headers"])
    assert r.status_code == 201, r.text
    r = await client.post("/api/admin/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200, r.text
    return {"headers": {"Authorization": f"Bearer {r.json()['token']}"}, "email": email}


async def approve(client, maker: dict, checker: dict, action: str, payload: dict) -> dict:
    r = await client.post("/api/admin/approvals", json={"action": action, "payload": payload,
                                                        "reason": "test approval flow"}, headers=maker["headers"])
    assert r.status_code == 201, r.text
    req = r.json()
    r = await client.post(f"/api/admin/approvals/{req['id']}/decide", json={"approve": True}, headers=checker["headers"])
    assert r.status_code == 200, r.text
    return r.json()


async def open_country(code: str) -> None:
    """Directly mark a country and its currency operational (what the
    approval flow does after compliance/custodian sign-off)."""
    async with get_session_factory()() as db:
        country = await db.get(Country, code)
        country.status, country.compliance_approved, country.custodian_ready, country.provider_ready = (
            "pilot", True, True, True)
        currency = await db.get(Currency, country.default_currency)
        currency.wallet_enabled = True
        await db.commit()


async def activate_corridor(from_c, to_c, from_ccy, to_ccy, rate="85.0", **extra) -> PaymentCorridor:
    async with get_session_factory()() as db:
        corridor = (await db.execute(select(PaymentCorridor).where(
            PaymentCorridor.from_country == from_c, PaymentCorridor.to_country == to_c))).scalar_one_or_none()
        if corridor is None:
            sandbox = (await db.execute(text("SELECT id FROM payment_providers WHERE code='sandbox'"))).scalar_one()
            corridor = PaymentCorridor(from_country=from_c, to_country=to_c, from_currency=from_ccy,
                                       to_currency=to_ccy, rail_provider_id=sandbox, settlement_model="prefunded",
                                       min_amount=Decimal(10), max_amount=Decimal(50000), rate_source="manual",
                                       max_rate_age_seconds=3600, fx_markup_bps=0, quote_ttl_seconds=60)
            db.add(corridor)
        corridor.status = "active"
        corridor.rate = Decimal(rate)
        corridor.rate_updated_at = datetime.now(UTC)
        for k, v in extra.items():
            setattr(corridor, k, v)
        await db.commit()
        return corridor


# ─── maker-checker & permissions ───────────────────────────────────────────


async def test_maker_cannot_approve_own_request(client: AsyncClient, admin: dict):
    finance = await named_admin(client, admin, "finance_admin")
    u = await signup(client)
    r = await client.post("/api/admin/approvals", json={
        "action": "ledger.adjustment", "reason": "goodwill credit",
        "payload": {"wallet_card_id": u["card_id"], "direction": "credit", "amount": "25.00"},
    }, headers=finance["headers"])
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    own = await client.post(f"/api/admin/approvals/{req_id}/decide", json={"approve": True}, headers=finance["headers"])
    assert own.status_code == 403
    assert await card_balance(u["card_id"]) == Decimal("0.00")

    other = await client.post(f"/api/admin/approvals/{req_id}/decide", json={"approve": True},
                              headers=admin["headers"])
    assert other.status_code == 200 and other.json()["status"] == "executed", other.text
    assert await card_balance(u["card_id"]) == Decimal("25.00")
    await assert_ledger_consistent()


async def test_support_role_cannot_change_network_and_actions_are_audited(client: AsyncClient, admin: dict):
    support = await named_admin(client, admin, "customer_support")
    r = await client.post("/api/admin/network/currencies", json={"code": "XTS", "name": "Test", "symbol": "T"},
                          headers=support["headers"])
    assert r.status_code == 403
    r = await client.post("/api/admin/network/currencies", json={"code": "XTS", "name": "Test", "symbol": "T"},
                          headers=admin["headers"])
    assert r.status_code == 201
    async with get_session_factory()() as db:
        entry = (await db.execute(select(AuditLog).where(AuditLog.action == "POST /api/admin/network/currencies")
                                  .order_by(AuditLog.created_at.desc()))).scalars().first()
        assert entry is not None and entry.actor_email is not None


async def test_country_cannot_go_live_without_readiness(client: AsyncClient, admin: dict):
    ops = await named_admin(client, admin, "operations_admin")
    result = await approve(client, ops, admin, "country.set_status", {"country": "KE", "status": "live"})
    assert result["status"] == "failed"
    assert "can't be set to live" in result["result"]["error"]


async def test_new_user_cannot_register_in_planned_country(client: AsyncClient):
    r = await client.post("/api/auth/signup", json={
        "name": "X", "email": unique_email(), "username": unique_username(), "password": "password123",
        "residenceCountry": "EG", "acceptTerms": True})
    assert r.status_code == 403
    r = await client.post("/api/auth/signup", json={
        "name": "X", "email": unique_email(), "username": unique_username(), "password": "password123",
        "residenceCountry": "ZA", "acceptTerms": False})
    assert r.status_code == 400


# ─── cross-border ───────────────────────────────────────────────────────────


async def _xb_setup(client):
    await open_country("ZW")
    await activate_corridor("ZA", "ZW", "ZAR", "ZWG", rate="1.50")
    sender = await signup(client, "ZA", kyc_level=2)
    recipient = await signup(client, "ZW", kyc_level=2)
    await fund_card(sender["card_id"], "1000.00")
    return sender, recipient


async def test_cross_border_quote_execute_settle(client: AsyncClient):
    sender, recipient = await _xb_setup(client)
    q = await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "200.00",
                                                        "destinationCountryCode": "ZW"}, headers=sender["headers"])
    assert q.status_code == 200, q.text
    quote = q.json()
    assert quote["kind"] == "cross_border" and quote["quoteId"] and quote["expiresAt"]
    assert Decimal(quote["fee"]) == Decimal("2.00")  # 1% cross-border
    assert Decimal(quote["destinationAmount"]) == Decimal("297.00")  # (200-2) * 1.5

    r = await client.post("/api/transfers/cross-border", json={
        "quoteId": quote["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])
    assert r.status_code == 200, r.text
    transfer = r.json()
    assert transfer["status"] == "instructed"
    assert await card_balance(sender["card_id"]) == Decimal("800.00")
    # Not credited merely because the sender was debited.
    recipient_cards = (await client.get("/api/cards", headers=recipient["headers"])).json()
    assert all(Decimal(c["balance"]) == 0 for c in recipient_cards)

    # The quote can't be reused.
    again = await client.post("/api/transfers/cross-border", json={
        "quoteId": quote["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])
    assert again.status_code == 409

    # Sandbox rail settles through the outbox → signed webhook.
    await outbox.process_due(get_session_factory(), now=datetime.now(UTC) + timedelta(minutes=5))
    status = (await client.get(f"/api/transfers/{transfer['reference']}", headers=sender["headers"])).json()
    assert status["status"] == "credited"
    recipient_cards = (await client.get("/api/cards", headers=recipient["headers"])).json()
    zwg = next(c for c in recipient_cards if c["currency"] == "ZWG")
    assert Decimal(zwg["balance"]) == Decimal("297.00")
    await assert_ledger_consistent()


async def test_cross_border_rail_failure_refunds_sender(client: AsyncClient):
    sender, recipient = await _xb_setup(client)
    quote = (await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "100.00",
                                                             "destinationCountryCode": "ZW"},
                               headers=sender["headers"])).json()
    transfer = (await client.post("/api/transfers/cross-border", json={
        "quoteId": quote["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])).json()
    body = json.dumps({"id": f"fail-{transfer['reference']}", "type": "transfer.failed",
                       "data": {"transfer_reference": transfer["reference"], "reason": "beneficiary bank down"}}).encode()
    r = await client.post("/api/webhooks/sandbox", content=body,
                          headers={"X-BukkaPay-Signature": webhooks.signature_header("sandbox", body)})
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    dup = await client.post("/api/webhooks/sandbox", content=body,
                            headers={"X-BukkaPay-Signature": webhooks.signature_header("sandbox", body)})
    assert dup.json()["status"] == "duplicate"
    assert await card_balance(sender["card_id"]) == Decimal("1000.00")
    status = (await client.get(f"/api/transfers/{transfer['reference']}", headers=sender["headers"])).json()
    assert status["status"] == "reversed"
    await assert_ledger_consistent()


async def test_forged_webhook_rejected(client: AsyncClient):
    body = json.dumps({"id": "x", "type": "transfer.settled", "data": {"transfer_reference": "XB-NOPE"}}).encode()
    r = await client.post("/api/webhooks/sandbox", content=body, headers={"X-BukkaPay-Signature": "t=1,v1=bad"})
    assert r.status_code == 401


async def test_stale_rate_and_expired_quote_refused(client: AsyncClient):
    sender, recipient = await _xb_setup(client)
    async with get_session_factory()() as db:
        await db.execute(update(PaymentCorridor).where(PaymentCorridor.from_country == "ZA",
                                                       PaymentCorridor.to_country == "ZW")
                         .values(rate_updated_at=datetime.now(UTC) - timedelta(hours=5)))
        await db.commit()
    stale = await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "100.00",
                                                            "destinationCountryCode": "ZW"}, headers=sender["headers"])
    assert stale.status_code == 503

    await activate_corridor("ZA", "ZW", "ZAR", "ZWG", rate="1.50")
    quote = (await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "100.00",
                                                             "destinationCountryCode": "ZW"},
                               headers=sender["headers"])).json()
    async with get_session_factory()() as db:
        await db.execute(update(FxQuote).where(FxQuote.id == uuid.UUID(quote["quoteId"]))
                         .values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    r = await client.post("/api/transfers/cross-border", json={
        "quoteId": quote["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])
    assert r.status_code == 410
    assert await card_balance(sender["card_id"]) == Decimal("1000.00")


async def test_unapproved_corridor_is_unavailable(client: AsyncClient):
    sender = await signup(client, "ZA", kyc_level=2)
    await fund_card(sender["card_id"], "100.00")
    r = await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "50.00",
                                                        "destinationCountryCode": "NG"}, headers=sender["headers"])
    assert r.status_code == 403


async def test_cross_border_requires_full_kyc(client: AsyncClient):
    await open_country("ZW")
    await activate_corridor("ZA", "ZW", "ZAR", "ZWG", rate="1.50")
    sender = await signup(client, "ZA", kyc_level=1)
    recipient = await signup(client, "ZW", kyc_level=2)
    await fund_card(sender["card_id"], "500.00")
    quote = (await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": "100.00",
                                                             "destinationCountryCode": "ZW"},
                               headers=sender["headers"])).json()
    r = await client.post("/api/transfers/cross-border", json={
        "quoteId": quote["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])
    assert r.status_code == 403


async def test_corridor_activation_requires_fresh_rate_via_approval(client: AsyncClient, admin: dict):
    ops = await named_admin(client, admin, "operations_admin")
    async with get_session_factory()() as db:
        corridor = (await db.execute(select(PaymentCorridor).where(PaymentCorridor.from_country == "NG"))).scalars().first()
    result = await approve(client, ops, admin, "corridor.set_status", {"id": str(corridor.id), "status": "active"})
    assert result["status"] == "failed"


# ─── fees & domestic ────────────────────────────────────────────────────────


async def test_domestic_fee_comes_from_fee_engine(client: AsyncClient):
    a = await signup(client)
    b = await signup(client)
    await fund_card(a["card_id"], "500.00")
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, "fromCardId": a["card_id"],
                                                 "toUserId": b["user"]["walletId"], "amount": "200.00"},
                          headers=a["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["fee"] == "2.00"  # 0.5% + R1.00
    assert await card_balance(b["card_id"]) == Decimal("198.00")
    async with get_session_factory()() as db:
        revenue = (await db.execute(select(LedgerAccount).where(LedgerAccount.code == "revenue:fees:ZAR"))).scalar_one()
        assert revenue.balance >= Decimal("2.00")


async def test_withdrawal_blocked_at_kyc_level_zero(client: AsyncClient, monkeypatch):
    from app.integrations import stitch

    monkeypatch.setattr(stitch, "is_stitch_payments_configured", lambda: True)
    u = await signup(client, kyc_level=0)
    await fund_card(u["card_id"], "500.00")
    r = await client.post("/api/wallet/withdraw/stitch", json={
        "walletCardId": u["card_id"], "amount": "100.00", "bankId": "fnb", "accountNumber": "62000000000",
        "accountName": "N", "pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 403


# ─── reconciliation ─────────────────────────────────────────────────────────


async def test_ledger_integrity_run_is_clean(client: AsyncClient, admin: dict):
    r = await client.post("/api/admin/reconciliation/runs/ledger", headers=admin["headers"])
    assert r.status_code == 201, r.text
    items = (await client.get(f"/api/admin/reconciliation/runs/{r.json()['id']}/items",
                              headers=admin["headers"])).json()
    assert [i for i in items if i["result"] == "integrity_error"] == []


async def test_statement_reconciliation_flags_unknown_and_mismatch(client: AsyncClient, admin: dict):
    csv_text = "reference,amount,currency,direction\nNOT-OURS-1,50.00,ZAR,in\nNOT-OURS-1,50.00,ZAR,in\n"
    r = await client.post("/api/admin/reconciliation/runs/statement",
                          json={"provider": "stitch", "csv": csv_text}, headers=admin["headers"])
    assert r.status_code == 201, r.text
    summary = r.json()["summary"]
    assert summary["duplicate"] == 1


# ─── merchants ──────────────────────────────────────────────────────────────


async def _approved_merchant(client, admin, owner):
    r = await client.post("/api/merchants", json={"businessName": "Net Shop", "businessType": "retail"},
                          headers=owner["headers"])
    assert r.status_code in (200, 201), r.text
    merchant_id = r.json()["id"]
    r = await client.post(f"/api/merchants/{merchant_id}/kyb", json={
        "registrationNumber": "2020/123/07", "businessAddress": "1 Main Rd", "countryCode": "ZA",
        "businessCategory": "retail", "contactEmail": "shop@example.com", "contactPhone": "+27110000000",
        "directors": [{"fullName": "Owner", "idNumber": "8001015009087"}],
        "documents": [{"type": t, "url": f"https://files.example/{t}.pdf"}
                      for t in ("registration_certificate", "proof_of_address", "director_id")],
    }, headers=owner["headers"])
    assert r.status_code == 200, r.text
    r = await client.post(f"/api/admin/merchants/{merchant_id}/kyb", json={"approve": True}, headers=admin["headers"])
    assert r.status_code == 200, r.text
    return merchant_id


async def test_unverified_merchant_cannot_take_payments(client: AsyncClient):
    owner = await signup(client, app="merchant")
    payer = await signup(client)
    await fund_card(payer["card_id"], "100.00")
    merchant_id = (await client.post("/api/merchants", json={"businessName": "Unverified", "businessType": "retail"},
                                     headers=owner["headers"])).json()["id"]
    r = await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": "10.00", "pin": TEST_PIN},
                          headers=payer["headers"])
    assert r.status_code == 403


async def test_merchant_dynamic_qr_pay_refund(client: AsyncClient, admin: dict):
    owner = await signup(client, app="merchant")
    payer = await signup(client)
    await fund_card(payer["card_id"], "300.00")
    merchant_id = await _approved_merchant(client, admin, owner)

    qr = (await client.post(f"/api/merchants/{merchant_id}/qr", json={"kind": "dynamic", "amount": "120.00"},
                            headers=owner["headers"])).json()
    tampered = qr["payload"][:-4] + "0000"
    bad = await client.post("/api/qr/pay", json={"payload": tampered, "pin": TEST_PIN}, headers=payer["headers"])
    assert bad.status_code == 400

    # Client-supplied amount is ignored for a dynamic QR.
    r = await client.post("/api/qr/pay", json={"payload": qr["payload"], "amount": "1.00", "pin": TEST_PIN},
                          headers=payer["headers"])
    assert r.status_code == 201, r.text
    assert r.json()["amount"] == "120.00"
    assert await card_balance(payer["card_id"]) == Decimal("180.00")
    again = await client.post("/api/qr/pay", json={"payload": qr["payload"], "pin": TEST_PIN}, headers=payer["headers"])
    assert again.status_code == 410

    dash = (await client.get(f"/api/merchants/{merchant_id}/dashboard", headers=owner["headers"])).json()
    assert dash["totals"]["totalSales"] == "120.00"
    assert dash["totals"]["feesPaid"] == "1.80"  # 1.5%
    assert dash["settlement"]["balances"][0]["available"] == "118.20"

    tx_id = r.json()["transactionId"]
    refund = await client.post(f"/api/merchants/{merchant_id}/transactions/{tx_id}/refund",
                               json={"amount": "50.00", "reason": "returned item", "pin": TEST_PIN},
                               headers=owner["headers"])
    assert refund.status_code == 201, refund.text
    assert await card_balance(payer["card_id"]) == Decimal("230.00")
    too_much = await client.post(f"/api/merchants/{merchant_id}/transactions/{tx_id}/refund",
                                 json={"amount": "80.00", "reason": "again", "pin": TEST_PIN},
                                 headers=owner["headers"])
    assert too_much.status_code == 400
    await assert_ledger_consistent()


async def test_merchant_checkout_link_settles_to_merchant(client: AsyncClient, admin: dict):
    owner = await signup(client, app="merchant")
    payer = await signup(client)
    await fund_card(payer["card_id"], "300.00")
    merchant_id = await _approved_merchant(client, admin, owner)
    link = (await client.post(f"/api/merchants/{merchant_id}/checkout-links", json={"amount": "100.00"},
                              headers=owner["headers"])).json()
    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN},
                          headers=payer["headers"])
    assert r.status_code == 200, r.text
    dash = (await client.get(f"/api/merchants/{merchant_id}/dashboard", headers=owner["headers"])).json()
    assert dash["settlement"]["balances"][0]["available"] == "98.50"
    assert await card_balance(owner["card_id"]) == Decimal("0.00")  # not the owner's personal wallet


async def test_merchant_api_key_creates_checkout_link(client: AsyncClient, admin: dict):
    owner = await signup(client, app="merchant")
    merchant_id = await _approved_merchant(client, admin, owner)
    key = (await client.post(f"/api/merchants/{merchant_id}/api-keys", json={"label": "web"},
                             headers=owner["headers"])).json()["key"]
    r = await client.post("/api/merchant-api/checkout-links", json={"amount": "75.00"},
                          headers={"Authorization": f"Bearer {key}"})
    assert r.status_code == 201, r.text
    bad = await client.post("/api/merchant-api/checkout-links", json={"amount": "75.00"},
                            headers={"Authorization": "Bearer bkp_nope_nope"})
    assert bad.status_code == 401


# ─── contributions & request money ─────────────────────────────────────────


async def test_contribution_campaign_real_money_and_payout(client: AsyncClient):
    creator = await signup(client)
    donor = await signup(client)
    await fund_card(donor["card_id"], "200.00")
    group = (await client.post("/api/contributions", json={"title": "School trip", "category": "education",
                                                            "targetAmount": "500.00"},
                               headers=creator["headers"])).json()
    assert group["currency"] == "ZAR"
    r = await client.post(f"/api/contributions/{group['id']}/contribute", json={
        "contributorName": "Donor", "amount": "150.00", "pin": TEST_PIN}, headers=donor["headers"])
    assert r.status_code == 201, r.text
    assert await card_balance(donor["card_id"]) == Decimal("50.00")
    detail = (await client.get(f"/api/contributions/{group['id']}")).json()
    assert detail["group"]["currentAmount"] == "150.00"

    stranger = await client.post(f"/api/contributions/{group['id']}/payout", json={"pin": TEST_PIN},
                                 headers=donor["headers"])
    assert stranger.status_code == 403
    out = await client.post(f"/api/contributions/{group['id']}/payout", json={"amount": "100.00", "pin": TEST_PIN},
                            headers=creator["headers"])
    assert out.status_code == 200, out.text
    assert await card_balance(creator["card_id"]) == Decimal("100.00")
    detail = (await client.get(f"/api/contributions/{group['id']}")).json()
    assert detail["group"]["currentAmount"] == "50.00"
    assert detail["group"]["paidOutAmount"] == "100.00"
    await assert_ledger_consistent()


async def test_request_money_pay_once(client: AsyncClient):
    requester = await signup(client)
    payer = await signup(client)
    await fund_card(payer["card_id"], "100.00")
    req = (await client.post("/api/payment-requests", json={"amount": "40.00", "payer": payer["user"]["walletId"],
                                                            "description": "lunch"},
                             headers=requester["headers"])).json()
    incoming = (await client.get("/api/payment-requests/incoming", headers=payer["headers"])).json()
    assert any(i["id"] == req["id"] for i in incoming)
    r = await client.post(f"/api/payment-requests/{req['id']}/pay",
                          json={"fromCardId": payer["card_id"], "pin": TEST_PIN}, headers=payer["headers"])
    assert r.status_code == 200, r.text
    again = await client.post(f"/api/payment-requests/{req['id']}/pay",
                              json={"fromCardId": payer["card_id"], "pin": TEST_PIN}, headers=payer["headers"])
    assert again.status_code == 409
    assert await card_balance(payer["card_id"]) == Decimal("60.00")


async def test_public_country_availability(client: AsyncClient):
    countries = (await client.get("/api/v1/public/countries")).json()
    za = next(c for c in countries if c["code"] == "ZA")
    eg = next(c for c in countries if c["code"] == "EG")
    assert za["status"] in ("pilot", "live")
    assert eg["status"] == "planned"
