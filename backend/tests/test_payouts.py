"""Cross-border payouts end to end against the mock rail: quote → confirm →
execute → webhooks → reconciliation, plus reject/timeout/duplicate/late/
return paths, FX, quote expiry, KYC and the free in-network shortcut."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text, update

from app.core.money import Minor
from app.db.base import get_session_factory
from app.models.payouts import Payout
from app.models.platform import FeeSchedule
from app.models.user import User
from app.network import outbox
from app.payouts import rails
from app.payouts import service as payout_service
from mock_providers.scenarios import MockPayoutRail
from tests.conftest import TEST_PIN, fund_card
from tests.test_ledger import assert_ledger_consistent, card_balance
from tests.test_network import signup
from tests.test_trade import _rate

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_mock_rail():
    rails.MOCK.scenario = "accept"
    rails.MOCK.calls.clear()
    rails.MOCK.by_key.clear()
    rails.MOCK.statement_lines.clear()
    yield
    rails.MOCK.scenario = "accept"


async def _sender(client, balance="1000.00", kyc=2):
    u = await signup(client, "ZA", kyc_level=kyc)
    await fund_card(u["card_id"], balance)
    return u


async def _recipient(client, u, **over):
    body = {"country": "ZA", "currency": "ZAR", "method": "bank", "firstName": "Thandi", "lastName": "Mokoena",
            "bankCode": "fnb", "bankName": "FNB", "accountNumber": "62012345678", "branchCode": "250655", **over}
    r = await client.post("/api/payouts/recipients", json=body, headers=u["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def _quote(client, u, rid, amount=10_000, **kw):
    r = await client.post("/api/payouts/quote", json={"sourceWalletId": u["card_id"], "recipientId": rid,
                                                      "amount": amount, "purpose": "family_support", **kw},
                          headers=u["headers"])
    assert r.status_code == 200, r.text
    return r.json()


async def _confirm(client, u, pid, key=None):
    return await client.post(f"/api/payouts/{pid}/confirm", json={"pin": TEST_PIN},
                             headers={**u["headers"], "Idempotency-Key": key or uuid.uuid4().hex})


async def _status(client, u, pid):
    return (await client.get(f"/api/payouts/{pid}", headers=u["headers"])).json()


async def _run_outbox(now=None):
    await outbox.process_due(get_session_factory(), limit=50, now=now)


async def test_recipient_formats_are_validated_and_masked(client: AsyncClient):
    u = await _sender(client)
    bad = await client.post("/api/payouts/recipients", json={"country": "ZA", "currency": "ZAR", "method": "bank",
                                                             "firstName": "A", "lastName": "B", "bankCode": "fnb",
                                                             "accountNumber": "12"}, headers=u["headers"])
    assert bad.status_code == 400
    wrong_ccy = await client.post("/api/payouts/recipients", json={"country": "BW", "currency": "ZAR", "method": "mobile_wallet",
                                                                   "firstName": "Kago", "lastName": "Molefe",
                                                                   "msisdn": "71234567", "operator": "orange"},
                                  headers=u["headers"])
    assert wrong_ccy.status_code == 400
    r = await _recipient(client, u, country="BW", currency="BWP", method="mobile_wallet", msisdn="071234567",
                         operator="orange", bankCode=None, accountNumber=None, branchCode=None)
    assert r["accountHint"].startswith("+267") and r["accountHint"].endswith("••••")
    r = await _recipient(client, u)
    assert r["accountHint"] == "•••• 5678"


async def test_happy_path_bank_payout_with_fee_duplicate_and_late_webhooks(client: AsyncClient):
    async with get_session_factory()() as db:
        await db.execute(text("DELETE FROM fee_schedules WHERE product = 'payout'"))
        db.add(FeeSchedule(product="payout", percentage=Decimal("1.0"), fixed=Decimal("0"), priority=0, active=True))
        await db.commit()
    try:
        u = await _sender(client, "1000.00")
        rcp = await _recipient(client, u)
        q = await _quote(client, u, rcp["id"], 20_000)  # R200.00
        assert q["status"] == "quoted" and q["feeAmount"] == 200 and q["totalAmount"] == 20_200
        assert q["receiveAmount"] == 20_000 and q["inNetwork"] is False

        key = uuid.uuid4().hex
        r = await _confirm(client, u, q["id"], key)
        assert r.status_code == 200 and r.json()["status"] == "confirmed", r.text
        again = await _confirm(client, u, q["id"], key)  # replayed confirm
        assert again.json()["status"] == "confirmed"
        assert await card_balance(u["card_id"]) == Decimal("798.00")  # debited once: 200 + 2 fee

        await _run_outbox()
        p = await _status(client, u, q["id"])
        assert p["status"] == "submitted"
        assert len(rails.MOCK.calls) == 1 and rails.MOCK.calls[0].idempotency_key.startswith("po_")
        ref = rails.MOCK.by_key[rails.MOCK.calls[0].idempotency_key].provider_reference

        mock = MockPayoutRail(client)
        assert (await mock.webhook(ref, "processing")).json()["status"] == "processed"
        ev = "pevt_" + uuid.uuid4().hex
        assert (await mock.webhook(ref, "paid", event_id=ev)).json()["status"] == "processed"
        assert (await mock.webhook(ref, "paid", event_id=ev)).json()["status"] == "duplicate"
        late = await mock.webhook(ref, "failed", reason="late from provider")
        assert late.json()["status"] == "late"  # paid can't become failed: flagged, no money moves
        p = await _status(client, u, q["id"])
        assert p["status"] == "paid"
        assert await card_balance(u["card_id"]) == Decimal("798.00")
        await assert_ledger_consistent()
    finally:
        async with get_session_factory()() as db:
            await db.execute(text("DELETE FROM fee_schedules WHERE product = 'payout'"))
            await db.commit()


async def test_rejected_payout_is_reversed_automatically(client: AsyncClient):
    u = await _sender(client, "500.00")
    rcp = await _recipient(client, u)
    q = await _quote(client, u, rcp["id"], 10_000)
    assert (await _confirm(client, u, q["id"])).status_code == 200
    assert await card_balance(u["card_id"]) == Decimal("400.00")
    MockPayoutRail(client).script("reject")
    await _run_outbox()
    p = await _status(client, u, q["id"])
    assert p["status"] == "reversed" and "invalid" in p["failureReason"]
    assert await card_balance(u["card_id"]) == Decimal("500.00")
    await assert_ledger_consistent()


async def test_timeout_is_retried_with_the_same_idempotency_key(client: AsyncClient):
    u = await _sender(client, "500.00")
    rcp = await _recipient(client, u)
    q = await _quote(client, u, rcp["id"], 10_000)
    await _confirm(client, u, q["id"])
    MockPayoutRail(client).script("timeout")
    await _run_outbox()
    assert (await _status(client, u, q["id"]))["status"] == "confirmed"  # unknown outcome: never reversed on a guess
    MockPayoutRail(client).script("accept")
    await _run_outbox(now=datetime.now(UTC) + timedelta(minutes=5))  # backoff elapsed
    assert (await _status(client, u, q["id"]))["status"] == "submitted"
    keys = {c.idempotency_key for c in rails.MOCK.calls}
    assert len(rails.MOCK.calls) == 2 and len(keys) == 1 and len(rails.MOCK.by_key) == 1


async def test_returned_after_paid_refunds_everything(client: AsyncClient):
    u = await _sender(client, "500.00")
    rcp = await _recipient(client, u)
    q = await _quote(client, u, rcp["id"], 5_000)
    await _confirm(client, u, q["id"])
    MockPayoutRail(client).script("paid_now")
    await _run_outbox()
    assert (await _status(client, u, q["id"]))["status"] == "paid"
    ref = next(iter(rails.MOCK.by_key.values())).provider_reference
    r = await MockPayoutRail(client).webhook(ref, "returned", reason="Account closed")
    assert r.json()["status"] == "processed"
    p = await _status(client, u, q["id"])
    assert p["status"] == "reversed" and p["failureReason"] == "Account closed"
    assert await card_balance(u["card_id"]) == Decimal("500.00")
    await assert_ledger_consistent()


async def test_fx_corridor_locks_rate_and_books_spread(client: AsyncClient):
    await _rate("ZAR", "USD", "0.055000", "1.50")
    u = await _sender(client, "2000.00")
    rcp = await _recipient(client, u, country="ZW", currency="USD", method="mobile_wallet", msisdn="0771234567",
                           operator="ecocash", bankCode=None, accountNumber=None, branchCode=None)
    q = await _quote(client, u, rcp["id"], 100_000)  # R1,000
    assert q["receiveCurrency"] == "USD" and Decimal(q["fxRate"]) == Decimal("0.055")
    assert q["receiveAmount"] == 5417 and q["fxSpreadAmount"] == 83  # $55.00 gross − 1.5% ($0.825 → $0.83)
    await _confirm(client, u, q["id"])
    MockPayoutRail(client).script("paid_now")
    await _run_outbox()
    assert (await _status(client, u, q["id"]))["status"] == "paid"
    await assert_ledger_consistent()


async def test_expired_quote_and_low_kyc_are_refused(client: AsyncClient):
    u = await _sender(client)
    rcp = await _recipient(client, u)
    q = await _quote(client, u, rcp["id"])
    async with get_session_factory()() as db:
        await db.execute(update(Payout).where(Payout.id == uuid.UUID(q["id"]))
                         .values(quote_expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    r = await _confirm(client, u, q["id"])
    assert r.status_code == 409 and "expired" in r.json()["error"]
    async with get_session_factory()() as db:
        await payout_service.expire_quotes(db)  # the 5-minute job
        await db.commit()
    assert (await _status(client, u, q["id"]))["status"] == "expired"
    assert await card_balance(u["card_id"]) == Decimal("1000.00")

    low = await _sender(client, kyc=1)
    rcp2 = await _recipient(client, low)
    r = await client.post("/api/payouts/quote", json={"sourceWalletId": low["card_id"], "recipientId": rcp2["id"],
                                                      "amount": 10_000, "purpose": "family_support"}, headers=low["headers"])
    assert r.status_code == 403  # refused before any quote or debit: KYC tier limits


async def test_in_network_recipient_skips_the_rail_and_is_free(client: AsyncClient):
    u = await _sender(client, "300.00")
    friend = await signup(client, "ZA", kyc_level=2)
    async with get_session_factory()() as db:
        await db.execute(update(User).where(User.id == uuid.UUID(friend["user"]["id"])).values(phone="+27821234567"))
        await db.commit()
    # A saved mobile-wallet recipient whose number belongs to a BukkaPay customer.
    async with get_session_factory()() as db:
        from app.models.payouts import PayoutRecipient

        r = PayoutRecipient(user_id=uuid.UUID(u["user"]["id"]), country="ZA", currency="ZAR", method="mobile_wallet",
                            first_name="Friend", last_name="OnBukka", msisdn="+27821234567", operator="mtn", extra={})
        db.add(r)
        await db.commit()
        rid = str(r.id)
    q = await _quote(client, u, rid, 7_500)
    assert q["inNetwork"] is True and q["feeAmount"] == 0 and q["rail"] == "internal"
    p = (await _confirm(client, u, q["id"])).json()
    assert p["status"] == "paid"
    assert rails.MOCK.calls == []  # no rail involved
    assert await card_balance(u["card_id"]) == Decimal("225.00")
    assert await card_balance(friend["card_id"]) == Decimal("75.00")
    await assert_ledger_consistent()


async def test_webhooks_must_be_signed_and_fresh(client: AsyncClient):
    mock = MockPayoutRail(client)
    assert (await mock.webhook("X", "paid", bad_signature=True)).status_code == 401
    assert (await mock.webhook("X", "paid", stale=True)).status_code == 401
    r = await client.post("/api/webhooks/payouts/onafriq", content=b'{"id":"1"}')
    assert r.status_code == 401  # Onafriq stub fails closed until its docs arrive


async def test_daily_reconciliation_flags_mismatches(client: AsyncClient):
    u = await _sender(client, "500.00")
    rcp = await _recipient(client, u)
    q = await _quote(client, u, rcp["id"], 3_000)
    await _confirm(client, u, q["id"])
    MockPayoutRail(client).script("paid_now")
    await _run_outbox()
    ref = next(iter(rails.MOCK.by_key.values())).provider_reference
    today = datetime.now(UTC).date()
    rails.MOCK.statement_lines.extend([
        rails.StatementLine(ref, Minor(2_999, "ZAR"), "paid", today),            # amount differs
        rails.StatementLine("MOCK-UNKNOWN", Minor(100, "ZAR"), "paid", today),    # not in our ledger
    ])
    async with get_session_factory()() as db:
        summary = await payout_service.reconcile(db, "mock", today, started_by="test")
        await db.commit()
    assert summary["amount_mismatch"] == 1 and summary["unmatched_provider"] == 1
    async with get_session_factory()() as db:
        from app.models.platform import ReconciliationItem

        items = (await db.execute(select(ReconciliationItem.result).where(
            ReconciliationItem.reference.in_([ref, "MOCK-UNKNOWN"])))).scalars().all()
    assert sorted(items) == ["amount_mismatch", "unmatched_provider"]
