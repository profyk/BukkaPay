"""One card per customer, active wallet + FX, fraud rules, the processor's
timeout budget, disputes, and the Paymentology stub failing closed."""

import asyncio
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.cards import issuers
from app.cards import service as card_service
from app.db.base import get_session_factory
from app.models.cards import CardAuthorization, IssuedCard
from tests.conftest import TEST_PIN, fund_card
from tests.test_cards import authorize, card_holder, clear
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_trade import _rate

pytestmark = pytest.mark.asyncio


async def _usd_wallet(client, u, amount="100.00") -> str:
    r = await client.post("/api/cards", json={"title": "Dollars", "currency": "USD", "pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 201, r.text
    await fund_card(r.json()["id"], amount)
    return r.json()["id"]


async def test_one_card_per_customer_even_with_more_wallets(client: AsyncClient):
    u = await card_holder(client, fund="500.00")
    usd = await _usd_wallet(client, u)
    async with get_session_factory()() as db:
        again = await card_service.issue_for_wallet(db, uuid.UUID(usd))
        await db.commit()
    assert again.id == u["card"].id
    cards = (await client.get("/api/issued-cards", headers=u["headers"])).json()
    assert len(cards) == 1 and cards[0]["walletCardId"] == u["card_id"]


async def test_switch_active_wallet_pays_through_fx_and_settles_at_locked_rate(client: AsyncClient):
    await _rate("USD", "ZAR", "18.000000", "2.00")
    u = await card_holder(client, fund="500.00")
    card = u["card"]  # billed in ZAR
    usd = await _usd_wallet(client, u, "100.00")
    zar = await card_balance(u["card_id"])  # after the new-wallet fee

    r = await client.post(f"/api/issued-cards/{card.id}/active-wallet", json={"walletId": usd, "pin": "0000"},
                          headers=u["headers"])
    assert r.status_code in (400, 401, 403)
    r = await client.post(f"/api/issued-cards/{card.id}/active-wallet", json={"walletId": usd, "pin": TEST_PIN},
                          headers=u["headers"])
    assert r.status_code == 200 and r.json()["walletCardId"] == usd, r.text

    a = await authorize(client, card, "176.40")  # R176.40 → $10.00 at 18 with a 2% spread
    assert a["approved"] is True, a
    assert await card_balance(usd) == Decimal("90.00")
    assert await card_balance(u["card_id"]) == zar  # ZAR wallet untouched
    async with get_session_factory()() as db:
        auth = (await db.execute(select(CardAuthorization).where(
            CardAuthorization.issuer_authorization_id == a["authorizationId"]))).scalar_one()
        assert auth.wallet_currency == "USD" and auth.wallet_amount == Decimal("10.00") and auth.fx_rate

    # Switch back before the merchant clears: settlement still uses the USD hold.
    r = await client.post(f"/api/issued-cards/{card.id}/active-wallet", json={"walletId": u["card_id"], "pin": TEST_PIN},
                          headers=u["headers"])
    assert r.status_code == 200
    await clear(client, card, a["authorizationId"], "176.40")
    assert await card_balance(usd) == Decimal("90.00")
    assert await card_balance(u["card_id"]) == zar
    await assert_ledger_consistent()


async def test_velocity_and_high_risk_merchant_rules(client: AsyncClient):
    u = await card_holder(client, fund="500.00")
    results = [await authorize(client, u["card"], "1.00") for _ in range(6)]
    assert [r["approved"] for r in results[:5]] == [True] * 5
    assert results[5]["approved"] is False and results[5]["declineReason"] == "suspected_fraud"

    v = await card_holder(client, fund="500.00")  # KYC level 2: gambling not allowed
    g = await authorize(client, v["card"], "20.00", merchantMcc="7995")
    assert g["approved"] is False and g["declineReason"] == "merchant_category_blocked"


async def test_slow_decision_declines_within_budget_and_leaves_no_hold(client: AsyncClient, monkeypatch):
    from app.cards import processing
    from app.core.config import get_settings

    u = await card_holder(client, fund="100.00")
    real = processing.authorize

    async def slow(db, req):
        auth = await real(db, req)
        await asyncio.sleep(0.5)
        return auth

    monkeypatch.setattr(processing, "authorize", slow)
    monkeypatch.setattr(get_settings(), "paymentology_auth_budget_ms", 100)
    a = await authorize(client, u["card"], "40.00")
    assert a["approved"] is False and a["declineReason"] == "issuer_timeout"
    assert await card_balance(u["card_id"]) == Decimal("100.00")  # nothing held
    monkeypatch.setattr(processing, "authorize", real)
    retry = await authorize(client, u["card"], "40.00", auth_id=a["authorizationId"])  # processor retries
    assert retry["approved"] is True, retry
    assert await card_balance(u["card_id"]) == Decimal("60.00")


async def test_dispute_won_credits_once(client: AsyncClient, admin: dict):
    u = await card_holder(client, fund="200.00")
    a = await authorize(client, u["card"], "50.00")
    await clear(client, u["card"], a["authorizationId"], "50.00")
    assert await card_balance(u["card_id"]) == Decimal("150.00")
    async with get_session_factory()() as db:
        from app.models.cards import CardClearing

        clearing = (await db.execute(select(CardClearing).where(CardClearing.issued_card_id == u["card"].id))).scalar_one()
    r = await client.post(f"/api/issued-cards/{u['card'].id}/disputes",
                          json={"clearingId": str(clearing.id), "reason": "not_received"}, headers=u["headers"])
    assert r.status_code == 201, r.text
    dispute_id = r.json()["id"]
    dup = await client.post(f"/api/issued-cards/{u['card'].id}/disputes",
                            json={"clearingId": str(clearing.id), "reason": "duplicate"}, headers=u["headers"])
    assert dup.status_code == 409

    for outcome in ("submitted", "won", "won"):
        r = await client.post(f"/api/admin/cards/disputes/{dispute_id}", json={"outcome": outcome}, headers=admin["headers"])
        assert r.status_code == 200, r.text
    assert await card_balance(u["card_id"]) == Decimal("200.00")  # credited once
    r = await client.post(f"/api/admin/cards/disputes/{dispute_id}", json={"outcome": "lost"}, headers=admin["headers"])
    assert r.status_code == 409  # won is final
    await assert_ledger_consistent()


async def test_terminate_needs_pin(client: AsyncClient):
    u = await card_holder(client, fund=None)
    r = await client.post(f"/api/issued-cards/{u['card'].id}/terminate", json={"pin": "0000"}, headers=u["headers"])
    assert r.status_code in (400, 401, 403)
    r = await client.post(f"/api/issued-cards/{u['card'].id}/terminate", json={"pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    async with get_session_factory()() as db:
        assert (await db.get(IssuedCard, u["card"].id)).status == "cancelled"


async def test_paymentology_is_off_and_fails_closed(client: AsyncClient):
    from app.cards.paymentology import PaymentologyConfig

    with pytest.raises(issuers.IssuerUnavailable):
        PaymentologyConfig.load()  # PAYMENTOLOGY_ENABLED is false by default
    r = await client.post("/api/card-issuer/paymentology/authorize", content=b'{"authorizationId":"x"}',
                          headers={"X-Card-Issuer-Signature": "t=1,v1=abc"})
    assert r.status_code == 401  # no verified scheme yet → every call rejected
    r = await client.post("/api/card-issuer/paymentology/events", content=b'{"id":"e1","type":"x"}')
    assert r.status_code == 401
