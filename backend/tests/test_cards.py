"""Visa cards on every wallet: issuance, real-time authorization holds,
clearing, reversals, refunds, overdrafts, controls, tap-to-pay tokens."""

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select, text, update

from app.cards import issuers, processing
from app.cards import service as card_service
from app.db.base import get_session_factory
from app.models.cards import CardAuthorization, IssuedCard
from app.models.platform import FeeSchedule, OutboxEvent
from app.models.user import User
from tests.conftest import TEST_PIN, fund_card
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import signup

SANDBOX = issuers.by_code("sandbox")


async def set_kyc(user_id: str, level: int) -> None:
    async with get_session_factory()() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(user_id)).values(kyc_level=level))
        await db.commit()


async def issue(wallet_id: str) -> IssuedCard:
    async with get_session_factory()() as db:
        card = await card_service.issue_for_wallet(db, uuid.UUID(wallet_id))
        await db.commit()
        return card


async def card_holder(client: AsyncClient, fund: str | None = "500.00") -> dict:
    u = await signup(client, kyc_level=2)
    card = await issue(u["card_id"])
    assert card.status == "active"
    if fund:
        await fund_card(u["card_id"], fund)
    u["card"] = card
    return u


async def authorize(client: AsyncClient, card: IssuedCard, amount: str, **extra) -> dict:
    payload = {"authorizationId": extra.pop("auth_id", "auth_" + uuid.uuid4().hex[:12]),
               "cardId": card.issuer_card_id, "amount": amount, "currency": card.billing_currency,
               "merchantName": "Corner Shop", "merchantMcc": "5411", "merchantCountry": "ZA",
               "channel": "contactless", **extra}
    body = json.dumps(payload).encode()
    r = await client.post("/api/card-issuer/sandbox/authorize", content=body,
                          headers={"X-Card-Issuer-Signature": issuers.sign(SANDBOX, body)})
    assert r.status_code == 200, r.text
    return {**r.json(), "authorizationId": payload["authorizationId"]}


async def event(client: AsyncClient, type_: str, data: dict) -> dict:
    body = json.dumps({"id": "evt_" + uuid.uuid4().hex, "type": type_, "data": data}).encode()
    r = await client.post("/api/card-issuer/sandbox/events", content=body,
                          headers={"X-Card-Issuer-Signature": issuers.sign(SANDBOX, body)})
    assert r.status_code == 200, r.text
    return r.json()


async def clear(client, card: IssuedCard, auth_id: str | None, amount: str, **extra) -> dict:
    return await event(client, "transaction.cleared", {
        "transactionId": "txn_" + uuid.uuid4().hex[:12], "cardId": card.issuer_card_id, "amount": amount,
        "currency": card.billing_currency, "authorizationId": auth_id, "merchantName": "Corner Shop", **extra,
    })


# ─── issuance ───────────────────────────────────────────────────────────────


async def test_every_wallet_requests_a_card_and_issues_after_kyc(client: AsyncClient):
    u = await signup(client)
    async with get_session_factory()() as db:
        queued = (await db.execute(
            select(OutboxEvent).where(OutboxEvent.topic == "card.issue",
                                      OutboxEvent.payload["wallet_card_id"].astext == u["card_id"])
        )).scalars().all()
    assert len(queued) == 1

    pending = await issue(u["card_id"])
    assert pending.status == "pending_kyc" and pending.issuer_card_id is None

    await set_kyc(u["user"]["id"], 2)
    async with get_session_factory()() as db:
        await card_service.sweep_unissued(db)
        await db.commit()
    cards = (await client.get("/api/issued-cards", headers=u["headers"])).json()
    assert len(cards) == 1
    card = cards[0]
    assert card["status"] == "active" and card["network"] == "visa" and len(card["last4"]) == 4
    assert card["walletCardId"] == u["card_id"]

    wallet = (await client.get(f"/api/cards/{u['card_id']}", headers=u["headers"])).json()
    assert wallet["cardNumber"] == f"•••• •••• •••• {card['last4']}"
    assert wallet["issuedCard"]["id"] == card["id"]
    assert "cvv" not in wallet


async def test_new_wallet_has_no_locally_generated_card_number(client: AsyncClient):
    u = await signup(client, kyc_level=2)
    await fund_card(u["card_id"], "100.00")
    r = await client.post("/api/cards", json={"title": "Travel", "currency": "USD"}, headers=u["headers"])
    assert r.status_code == 201, r.text
    assert await card_balance(u["card_id"]) == Decimal("50.00")  # issuance fee from the default wallet
    async with get_session_factory()() as db:
        row = (await db.execute(text("SELECT card_number, cvv FROM wallet_cards WHERE id = :id"),
                                {"id": r.json()["id"]})).one()
    assert row.card_number is None and row.cvv is None
    # the old endpoint that returned the fake PAN/CVV is gone
    r = await client.post(f"/api/cards/{u['card_id']}/reveal", json={"pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code in (404, 405)


async def test_issuing_is_idempotent_one_live_card_per_wallet(client: AsyncClient):
    u = await card_holder(client, fund=None)
    again = await issue(u["card_id"])
    assert again.id == u["card"].id


# ─── authorization & clearing ───────────────────────────────────────────────


async def test_tap_to_pay_hold_then_capture(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "120.00")
    assert a["approved"] is True
    assert await card_balance(u["card_id"]) == Decimal("380.00")

    assert (await clear(client, u["card"], a["authorizationId"], "120.00"))["status"] == "processed"
    assert await card_balance(u["card_id"]) == Decimal("380.00")
    async with get_session_factory()() as db:
        auth = (await db.execute(select(CardAuthorization).where(
            CardAuthorization.issuer_authorization_id == a["authorizationId"]))).scalar_one()
        assert auth.status == "captured" and auth.held_amount == 0
    txns = (await client.get("/api/transactions", headers=u["headers"])).json()
    assert any(t["category"] == "card_payment" for t in txns)
    await assert_ledger_consistent()


async def test_capture_below_hold_releases_the_rest(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "200.00", merchantMcc="5542")  # fuel pre-auth
    await clear(client, u["card"], a["authorizationId"], "150.00")
    assert await card_balance(u["card_id"]) == Decimal("350.00")
    await assert_ledger_consistent()


async def test_retried_authorization_does_not_hold_twice(client: AsyncClient):
    u = await card_holder(client)
    a1 = await authorize(client, u["card"], "100.00", auth_id="auth_retry_" + uuid.uuid4().hex[:6])
    a2 = await authorize(client, u["card"], "100.00", auth_id=a1["authorizationId"])
    assert a1["approved"] and a2["approved"]
    assert await card_balance(u["card_id"]) == Decimal("400.00")


async def test_insufficient_funds_and_frozen_card_decline(client: AsyncClient):
    u = await card_holder(client, fund="50.00")
    a = await authorize(client, u["card"], "80.00")
    assert a["approved"] is False and a["declineReason"] == "insufficient_funds"
    assert await card_balance(u["card_id"]) == Decimal("50.00")

    r = await client.post(f"/api/issued-cards/{u['card'].id}/freeze", headers=u["headers"])
    assert r.status_code == 200 and r.json()["status"] == "frozen"
    a = await authorize(client, u["card"], "10.00")
    assert a["approved"] is False and a["declineReason"] == "card_frozen"

    r = await client.post(f"/api/issued-cards/{u['card'].id}/unfreeze", json={"pin": "0000"},
                          headers=u["headers"])
    assert r.status_code != 200
    r = await client.post(f"/api/issued-cards/{u['card'].id}/unfreeze", json={"pin": TEST_PIN},
                          headers=u["headers"])
    assert r.status_code == 200 and r.json()["status"] == "active"
    assert (await authorize(client, u["card"], "10.00"))["approved"] is True


async def test_reversal_full_and_partial(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "100.00")
    await event(client, "authorization.reversed", {"authorizationId": a["authorizationId"], "amount": "30.00"})
    assert await card_balance(u["card_id"]) == Decimal("430.00")
    await event(client, "authorization.reversed", {"authorizationId": a["authorizationId"]})
    assert await card_balance(u["card_id"]) == Decimal("500.00")
    await assert_ledger_consistent()


async def test_refund_credits_wallet(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "100.00")
    await clear(client, u["card"], a["authorizationId"], "100.00")
    await event(client, "transaction.refunded", {
        "transactionId": "rfd_" + uuid.uuid4().hex[:10], "cardId": u["card"].issuer_card_id,
        "amount": "40.00", "currency": "ZAR", "merchantName": "Corner Shop",
    })
    assert await card_balance(u["card_id"]) == Decimal("440.00")
    await assert_ledger_consistent()


async def test_duplicate_clearing_event_applies_once(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "50.00")
    body = json.dumps({"id": "evt_dup_" + uuid.uuid4().hex, "type": "transaction.cleared", "data": {
        "transactionId": "txn_dup_" + uuid.uuid4().hex, "cardId": u["card"].issuer_card_id, "amount": "50.00",
        "currency": "ZAR", "authorizationId": a["authorizationId"]}}).encode()
    for expected in ("processed", "duplicate"):
        r = await client.post("/api/card-issuer/sandbox/events", content=body,
                              headers={"X-Card-Issuer-Signature": issuers.sign(SANDBOX, body)})
        assert r.json()["status"] == expected
    assert await card_balance(u["card_id"]) == Decimal("450.00")


async def test_forged_issuer_calls_rejected(client: AsyncClient):
    u = await card_holder(client)
    body = json.dumps({"authorizationId": "forged", "cardId": u["card"].issuer_card_id, "amount": "10.00",
                       "currency": "ZAR"}).encode()
    r = await client.post("/api/card-issuer/sandbox/authorize", content=body,
                          headers={"X-Card-Issuer-Signature": "t=1,v1=deadbeef"})
    assert r.status_code == 401
    r = await client.post("/api/card-issuer/sandbox/events", content=body)
    assert r.status_code == 401
    assert await card_balance(u["card_id"]) == Decimal("500.00")


async def test_clearing_above_balance_becomes_overdraft_and_pauses_card(client: AsyncClient):
    u = await card_holder(client, fund="100.00")
    # force-post with no authorization (e.g. offline transit tap)
    await clear(client, u["card"], None, "130.00")
    assert await card_balance(u["card_id"]) == Decimal("0.00")
    card = (await client.get(f"/api/issued-cards/{u['card'].id}", headers=u["headers"])).json()
    assert card["status"] == "frozen" and card["frozenReason"] == "overdraft"
    assert card["overdraftOutstanding"] == "30.00"
    r = await client.post(f"/api/issued-cards/{u['card'].id}/unfreeze", json={"pin": TEST_PIN},
                          headers=u["headers"])
    assert r.status_code == 409

    await fund_card(u["card_id"], "50.00")
    async with get_session_factory()() as db:
        await processing.collect_overdrafts(db)
        await db.commit()
    assert await card_balance(u["card_id"]) == Decimal("20.00")
    card = (await client.get(f"/api/issued-cards/{u['card'].id}", headers=u["headers"])).json()
    assert card["status"] == "active" and card["overdraftOutstanding"] == "0.00"
    await assert_ledger_consistent()


async def test_stale_hold_expires_back_to_wallet(client: AsyncClient):
    u = await card_holder(client)
    a = await authorize(client, u["card"], "75.00")
    async with get_session_factory()() as db:
        n = await processing.expire_stale_holds(db, now=datetime.now(UTC) + timedelta(days=8))
        await db.commit()
    assert n >= 1
    assert await card_balance(u["card_id"]) == Decimal("500.00")
    async with get_session_factory()() as db:
        auth = (await db.execute(select(CardAuthorization).where(
            CardAuthorization.issuer_authorization_id == a["authorizationId"]))).scalar_one()
        assert auth.status == "expired"
    await assert_ledger_consistent()


# ─── controls & fees ────────────────────────────────────────────────────────


async def test_controls_block_international_and_limit(client: AsyncClient):
    u = await card_holder(client)
    cid = u["card"].id
    r = await client.patch(f"/api/issued-cards/{cid}/controls",
                           json={"pin": TEST_PIN, "international": False, "perTransactionLimit": "100.00"},
                           headers=u["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["controls"]["international"] is False
    a = await authorize(client, u["card"], "20.00", merchantCountry="FR", merchantCurrency="EUR")
    assert a["declineReason"] == "international_disabled"
    a = await authorize(client, u["card"], "150.00")
    assert a["declineReason"] == "card_limit_exceeded"
    r = await client.patch(f"/api/issued-cards/{cid}/controls", json={"pin": TEST_PIN, "online": False},
                           headers=u["headers"])
    a = await authorize(client, u["card"], "20.00", channel="online")
    assert a["declineReason"] == "online_disabled"


async def test_foreign_transaction_fee_from_fee_engine(client: AsyncClient):
    async with get_session_factory()() as db:
        db.add(FeeSchedule(product="card_foreign_transaction", currency="ZAR", percentage=Decimal("2.5"),
                           fixed=Decimal("0"), active=True, priority=0))
        await db.commit()
    try:
        u = await card_holder(client)
        a = await authorize(client, u["card"], "100.00", merchantCountry="GB", merchantCurrency="GBP",
                            merchantAmount="4.50", channel="online")
        assert a["approved"]
        assert await card_balance(u["card_id"]) == Decimal("397.50")
        await clear(client, u["card"], a["authorizationId"], "100.00")
        assert await card_balance(u["card_id"]) == Decimal("397.50")
        await assert_ledger_consistent()
    finally:
        async with get_session_factory()() as db:
            await db.execute(update(FeeSchedule).where(FeeSchedule.product == "card_foreign_transaction")
                             .values(active=False))
            await db.commit()


# ─── reveal & tap-to-pay tokens ─────────────────────────────────────────────


async def test_reveal_and_wallet_token_need_pin(client: AsyncClient):
    u = await card_holder(client, fund=None)
    cid = u["card"].id
    r = await client.post(f"/api/issued-cards/{cid}/reveal", json={"pin": "0000"}, headers=u["headers"])
    assert r.status_code != 200
    r = await client.post(f"/api/issued-cards/{cid}/reveal", json={"pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "sandbox" and body["pan"].startswith("400000") and body["pan"][-4:] == u["card"].last4

    r = await client.post(f"/api/issued-cards/{cid}/wallet-tokens",
                          json={"pin": TEST_PIN, "wallet": "google_pay", "deviceName": "Pixel"},
                          headers=u["headers"])
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert token["wallet"] == "google_pay" and r.json()["activationData"]
    card = (await client.get(f"/api/issued-cards/{cid}", headers=u["headers"])).json()
    assert [t["id"] for t in card["walletTokens"]] == [token["id"]]
    r = await client.delete(f"/api/issued-cards/{cid}/wallet-tokens/{token['id']}", headers=u["headers"])
    assert r.status_code == 204


async def test_other_user_cannot_touch_my_card(client: AsyncClient):
    me = await card_holder(client, fund=None)
    other = await signup(client)
    r = await client.post(f"/api/issued-cards/{me['card'].id}/freeze", headers=other["headers"])
    assert r.status_code == 404


async def test_replace_card_cancels_old_number(client: AsyncClient):
    u = await card_holder(client, fund=None)
    r = await client.post(f"/api/issued-cards/{u['card'].id}/replace", json={"pin": TEST_PIN},
                          headers=u["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["id"] != str(u["card"].id)
    a = await authorize(client, u["card"], "1.00")
    assert a["approved"] is False


async def test_sandbox_simulator_end_to_end(client: AsyncClient):
    u = await card_holder(client)
    cid = u["card"].id
    r = await client.post(f"/api/sandbox/issued-cards/{cid}/simulate",
                          json={"action": "authorize", "amount": "60.00"}, headers=u["headers"])
    assert r.status_code == 200 and r.json()["approved"], r.text
    r = await client.post(f"/api/sandbox/issued-cards/{cid}/simulate",
                          json={"action": "clear", "amount": "60.00", "authorizationId": r.json()["authorizationId"]},
                          headers=u["headers"])
    assert r.json()["status"] == "processed"
    assert await card_balance(u["card_id"]) == Decimal("440.00")
    auths = (await client.get(f"/api/issued-cards/{cid}/authorizations", headers=u["headers"])).json()
    assert auths[0]["status"] == "captured"


async def test_maintenance_fee_skips_wallets_without_a_real_card(client: AsyncClient):
    from app.workers.tasks import charge_monthly_card_maintenance_fees

    u = await signup(client)  # KYC 0 → no issued card
    await fund_card(u["card_id"], "100.00")
    async with get_session_factory()() as db:
        await db.execute(text("UPDATE wallet_cards SET created_at = now() - interval '40 days' WHERE id = :id"),
                         {"id": u["card_id"]})
        await db.commit()
    await charge_monthly_card_maintenance_fees({})
    assert await card_balance(u["card_id"]) == Decimal("100.00")


async def test_admin_freeze_cannot_be_undone_by_customer(client: AsyncClient, admin: dict):
    u = await card_holder(client, fund=None)
    cid = u["card"].id
    r = await client.get("/api/admin/cards", params={"q": u["card"].last4}, headers=admin["headers"])
    assert r.status_code == 200 and any(c["id"] == str(cid) for c in r.json()["cards"])
    r = await client.post(f"/api/admin/cards/{cid}/freeze", json={"reason": "suspected fraud"}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["frozenReason"] == "admin"
    r = await client.post(f"/api/issued-cards/{cid}/unfreeze", json={"pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 403
    r = await client.post(f"/api/admin/cards/{cid}/unfreeze", json={"reason": "cleared"}, headers=admin["headers"])
    assert r.status_code == 200 and r.json()["status"] == "active"
