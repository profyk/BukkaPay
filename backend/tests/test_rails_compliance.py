"""Book-transfer rail, rail failover, the up-front funds check, empty-wallet
card pausing, sanctions screening and the newer monitoring rules."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.db.base import get_session_factory
from app.models.cards import IssuedCard
from app.models.enums import KycStatus, TransactionType
from app.models.platform import ComplianceCase, PaymentCorridor, PaymentProvider, RiskEvent
from app.models.user import User
from app.models.wallet import Transaction
from app.network import compliance, outbox, screening
from tests.conftest import TEST_PIN, fund_card
from tests.test_cards import authorize, card_holder
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import activate_corridor, open_country, signup

pytestmark = pytest.mark.asyncio


async def _provider_id(code: str) -> uuid.UUID:
    async with get_session_factory()() as db:
        return (await db.execute(text("SELECT id FROM payment_providers WHERE code=:c"), {"c": code})).scalar_one()


async def _corridor(**values) -> dict:
    """Point ZA→ZW at a rail setup; returns the previous values to restore."""
    async with get_session_factory()() as db:
        c = (await db.execute(select(PaymentCorridor).where(PaymentCorridor.from_country == "ZA",
                                                            PaymentCorridor.to_country == "ZW"))).scalar_one()
        before = {k: getattr(c, k) for k in values}
        for k, v in values.items():
            setattr(c, k, v)
        await db.commit()
        return before


async def _send(client, sender, recipient, amount="100.00"):
    qr = await client.post("/api/transfer/quote", json={"fromCardId": sender["card_id"], "amount": amount,
                                                         "destinationCountryCode": "ZW"}, headers=sender["headers"])
    if qr.status_code != 200:
        return qr  # refused at quote time (e.g. corridor at capacity)
    q = qr.json()
    return await client.post("/api/transfers/cross-border", json={
        "quoteId": q["quoteId"], "fromCardId": sender["card_id"], "toUserId": recipient["user"]["walletId"],
        "pin": TEST_PIN}, headers=sender["headers"])


async def _setup(client):
    await open_country("ZW")
    await activate_corridor("ZA", "ZW", "ZAR", "ZWG", rate="1.50")
    sender = await signup(client, "ZA", kyc_level=2)
    recipient = await signup(client, "ZW", kyc_level=2)
    await fund_card(sender["card_id"], "1000.00")
    return sender, recipient


# ─── rails ──────────────────────────────────────────────────────────────────


async def test_book_rail_settles_instantly_and_tracks_pool_positions(client: AsyncClient, admin: dict):
    sender, recipient = await _setup(client)
    before = await _corridor(rail_provider_id=await _provider_id("book"), settlement_model="internal_book",
                             liquidity_limit=None)
    try:
        r = await _send(client, sender, recipient, "200.00")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "instructed"
        # No delay: settles on the next worker tick (rail events run before any other backlog).
        await outbox.process_due(get_session_factory(), limit=20)
        status = (await client.get(f"/api/transfers/{r.json()['reference']}", headers=sender["headers"])).json()
        assert status["status"] == "credited"
        cards = (await client.get("/api/cards", headers=recipient["headers"])).json()
        assert Decimal(next(c for c in cards if c["currency"] == "ZWG")["balance"]) == Decimal("297.00")

        pos = (await client.get("/api/admin/network/treasury/book-positions", headers=admin["headers"])).json()
        zwg = next(p for p in pos if p["currency"] == "ZWG")
        assert zwg["action"] == "top_up" and Decimal(zwg["amount"]) >= Decimal("297.00")
        await assert_ledger_consistent()
    finally:
        await _corridor(**before)


async def test_book_pool_capacity_is_enforced_at_send_time(client: AsyncClient):
    sender, recipient = await _setup(client)
    async with get_session_factory()() as db:
        from app.ledger import accounts

        drawn = max((await accounts.provider_clearing(db, "book", "ZWG")).balance, Decimal(0))
        await db.commit()
    before = await _corridor(rail_provider_id=await _provider_id("book"), settlement_model="internal_book",
                             liquidity_limit=drawn + Decimal("200"))
    try:
        assert (await _send(client, sender, recipient, "100.00")).status_code == 200  # 148.50 ZWG fits
        await outbox.process_due(get_session_factory())
        r = await _send(client, sender, recipient, "100.00")  # another 148.50 doesn't
        assert r.status_code == 503 and "capacity" in r.json()["error"]
        assert await card_balance(sender["card_id"]) == Decimal("900.00")  # refused before any debit
    finally:
        await _corridor(**before)


async def test_rail_failover_uses_the_backup_when_the_main_rail_is_down(client: AsyncClient):
    sender, recipient = await _setup(client)
    papss, sandbox = await _provider_id("papss"), await _provider_id("sandbox")
    async with get_session_factory()() as db:
        p = await db.get(PaymentProvider, papss)
        p.status = "active"  # "active" but not connected: it refuses every instruction
        await db.commit()
    before = await _corridor(rail_provider_id=papss, fallback_provider_ids=[str(sandbox)],
                             settlement_model="prefunded")
    try:
        r = await _send(client, sender, recipient)
        assert r.status_code == 200, r.text
        async with get_session_factory()() as db:
            rail = (await db.execute(text("SELECT rail FROM transfers WHERE reference=:r"),
                                     {"r": r.json()["reference"]})).scalar_one()
        assert rail == "sandbox"
    finally:
        await _corridor(**before)
        async with get_session_factory()() as db:
            (await db.get(PaymentProvider, papss)).status = "inactive"
            await db.commit()


# ─── funds gate ─────────────────────────────────────────────────────────────


async def test_empty_wallet_is_refused_up_front_with_top_up_code(client: AsyncClient):
    payer = await signup(client)
    payee = await signup(client)
    r = await client.post("/api/transfer", json={"fromCardId": payer["card_id"], "toUserId": payee["user"]["walletId"],
                                                 "amount": "10.00", "pin": TEST_PIN}, headers=payer["headers"])
    assert r.status_code == 402, r.text
    assert r.json()["code"] == "no_funds" and "Top up" in r.json()["error"]
    await fund_card(payer["card_id"], "5.00")
    r = await client.post("/api/transfer", json={"fromCardId": payer["card_id"], "toUserId": payee["user"]["walletId"],
                                                 "amount": "10.00", "pin": TEST_PIN}, headers=payer["headers"])
    assert r.status_code == 402 and r.json()["code"] == "insufficient_funds"
    assert r.json()["balance"] == "5.00" and r.json()["needed"] == "10.00"


async def test_card_is_paused_at_issuer_when_wallet_empties_and_resumes_on_top_up(client: AsyncClient):
    holder = await card_holder(client, fund="50.00")
    card = holder["card"]
    assert (await authorize(client, card, "50.00"))["approved"] is True  # spends everything
    await outbox.process_due(get_session_factory())
    async with get_session_factory()() as db:
        c = await db.get(IssuedCard, card.id)
        assert (c.status, c.frozen_reason) == ("frozen", "no_funds")
    # The customer can't switch it back on while the wallet is empty.
    r = await client.post(f"/api/issued-cards/{card.id}/unfreeze", json={"pin": TEST_PIN}, headers=holder["headers"])
    assert r.status_code == 402
    await fund_card(holder["card_id"], "20.00")
    await outbox.process_due(get_session_factory())
    async with get_session_factory()() as db:
        c = await db.get(IssuedCard, card.id)
        assert (c.status, c.frozen_reason) == ("active", None)


async def test_customer_freeze_is_never_undone_by_a_top_up(client: AsyncClient):
    holder = await card_holder(client, fund=None)
    r = await client.post(f"/api/issued-cards/{holder['card'].id}/freeze", headers=holder["headers"])
    assert r.status_code == 200, r.text
    await fund_card(holder["card_id"], "20.00")
    await outbox.process_due(get_session_factory())
    async with get_session_factory()() as db:
        c = await db.get(IssuedCard, holder["card"].id)
        assert c.status == "frozen" and c.frozen_reason == "customer"


# ─── screening & monitoring ─────────────────────────────────────────────────


def _fake_screen(sanctions: str, pep: str = "clear"):
    async def fake(**kw):
        return screening.Outcome(provider="opensanctions", sanctions=sanctions, pep=pep,
                                 hits=[screening.Hit(name=kw["name"], score=0.97, topics=["sanction"],
                                                     datasets=["un_sc_sanctions"], entity_id="Q1")])
    return fake


async def test_sanctions_hit_blocks_kyc_approval_and_freezes(client: AsyncClient, monkeypatch):
    from app.services import admin_user_service

    monkeypatch.setattr(screening, "screen", _fake_screen("match"))
    u = await signup(client)
    async with get_session_factory()() as db:
        user = await db.get(User, uuid.UUID(u["user"]["id"]))
        user.kyc_status = KycStatus.PENDING
        await admin_user_service.approve_kyc(db, user)
        await db.commit()
        user = await db.get(User, uuid.UUID(u["user"]["id"]))
        assert user.frozen is True and user.kyc_status == KycStatus.PENDING and user.kyc_level < 2
        case = (await db.execute(select(ComplianceCase).where(ComplianceCase.user_id == user.id))).scalars().first()
        assert case is not None and case.priority == "high"


async def test_pep_is_reviewed_but_not_blocked(client: AsyncClient, monkeypatch):
    from app.services import admin_user_service

    monkeypatch.setattr(screening, "screen", _fake_screen("clear", pep="match"))
    u = await signup(client)
    async with get_session_factory()() as db:
        user = await db.get(User, uuid.UUID(u["user"]["id"]))
        await admin_user_service.approve_kyc(db, user)
        await db.commit()
        assert user.frozen is False and user.kyc_status == KycStatus.APPROVED
        rules = (await db.execute(select(RiskEvent.rule).where(RiskEvent.user_id == user.id))).scalars().all()
        assert "pep_match" in rules


async def test_without_a_provider_nothing_counts_as_a_pass(client: AsyncClient):
    u = await signup(client)
    async with get_session_factory()() as db:
        result = await compliance.record_screening(db, user_id=uuid.UUID(u["user"]["id"]))
        await db.commit()
    assert result == {"sanctions": "not_screened", "pep": "not_screened", "blocked": False}


async def test_structuring_and_rule_dedup(client: AsyncClient):
    u = await signup(client)
    uid = uuid.UUID(u["user"]["id"])
    async with get_session_factory()() as db:
        user = await db.get(User, uid)
        for _ in range(3):
            db.add(Transaction(user_id=uid, title="x", category="transfer", amount=Decimal("17500"),
                               type=TransactionType.DEBIT, icon="send"))
        await db.flush()
        events = await compliance.evaluate(db, user=user, amount=Decimal("17500"), currency="ZAR", kind="p2p",
                                           reference="T1")
        assert "structuring" in [e.rule for e in events]
        again = await compliance.evaluate(db, user=user, amount=Decimal("17500"), currency="ZAR", kind="p2p",
                                          reference="T2")
        assert "structuring" not in [e.rule for e in again]  # once a day, not per payment
        await db.commit()


async def test_rapid_pass_through_flagged(client: AsyncClient):
    u = await signup(client)
    uid = uuid.UUID(u["user"]["id"])
    async with get_session_factory()() as db:
        user = await db.get(User, uid)
        db.add(Transaction(user_id=uid, title="in", category="transfer", amount=Decimal("8000"),
                           type=TransactionType.CREDIT, icon="send"))
        db.add(Transaction(user_id=uid, title="out", category="transfer", amount=Decimal("7600"),
                           type=TransactionType.DEBIT, icon="send"))
        await db.flush()
        events = await compliance.evaluate(db, user=user, amount=Decimal("7600"), currency="ZAR", kind="p2p",
                                           reference="T3")
        assert "rapid_pass_through" in [e.rule for e in events]
        await db.rollback()


async def test_high_risk_destination_flagged(client: AsyncClient):
    u = await signup(client)
    async with get_session_factory()() as db:
        user = await db.get(User, uuid.UUID(u["user"]["id"]))
        events = await compliance.evaluate(db, user=user, amount=Decimal("100"), currency="ZAR",
                                           kind="cross_border", reference="T4", country="IR")
        assert [e.rule for e in events] == ["high_risk_jurisdiction"]
        await db.rollback()


async def test_empty_wallet_card_fee_is_not_attempted_or_nagged_daily(client: AsyncClient):
    """The monthly card fee is never attempted on an empty wallet, and the
    person hears about it once, not every day."""
    from app.models.notification import Notification
    from app.workers import tasks

    u = await signup(client)
    async with get_session_factory()() as db:
        await db.execute(text("UPDATE wallet_cards SET last_maintenance_fee_at = now() - interval '40 days' "
                              "WHERE id = :id"), {"id": u["card_id"]})
        await db.commit()
    await tasks.charge_monthly_card_maintenance_fees({})
    await tasks.charge_monthly_card_maintenance_fees({})
    async with get_session_factory()() as db:
        notes = (await db.execute(select(Notification).where(Notification.user_id == uuid.UUID(u["user"]["id"]),
                                                             Notification.related_id == u["card_id"]))).scalars().all()
    titles = [n.title for n in notes]
    assert "Card Maintenance Fee Failed" not in titles
    assert titles.count("Card fee due") <= 1
    assert await card_balance(u["card_id"]) == Decimal("0.00")


# ─── own wallets ────────────────────────────────────────────────────────────


async def test_move_between_own_wallets(client: AsyncClient, other_user: dict):
    u = await signup(client)
    await fund_card(u["card_id"], "100.00")
    second = await client.post("/api/cards", json={"title": "Savings", "currency": u["currency"]}, headers=u["headers"])
    assert second.status_code in (200, 201), second.text
    to_id = second.json()["id"]
    start = await card_balance(u["card_id"])  # after any card issuance fee
    r = await client.post("/api/wallets/move", json={"fromCardId": u["card_id"], "toCardId": to_id, "amount": "40.00",
                                                     "pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 200, r.text
    assert await card_balance(u["card_id"]) == start - Decimal("40.00")
    assert await card_balance(to_id) == Decimal("40.00")
    # Someone else's wallet can't be a target.
    other_cards = (await client.get("/api/cards", headers=other_user["headers"])).json()
    r = await client.post("/api/wallets/move", json={"fromCardId": u["card_id"], "toCardId": other_cards[0]["id"],
                                                     "amount": "10.00", "pin": TEST_PIN}, headers=u["headers"])
    assert r.status_code == 404
    await assert_ledger_consistent()
