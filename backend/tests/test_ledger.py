"""Ledger guarantees: balanced, append-only, guarded balances, no double
spend under concurrency, idempotent retries, and provider flows that only
credit what the provider confirms."""

import asyncio
import re
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.db.base import get_session_factory
from app.integrations import stitch
from app.ledger import accounts, posting
from app.models.ledger import FundingRequest, JournalEntry, JournalLine, LedgerAccount
from app.models.wallet import WalletCard
from tests.conftest import TEST_PIN, fund_card, set_test_pin, unique_email, unique_username

pytestmark = pytest.mark.asyncio


# ─── helpers ────────────────────────────────────────────────────────────────


async def assert_ledger_consistent() -> None:
    """Every entry balances per currency, every account's cached balance
    equals the sum of its lines, and every wallet projection matches."""
    async with get_session_factory()() as db:
        unbalanced = (await db.execute(text("""
            SELECT entry_id, currency FROM journal_lines GROUP BY entry_id, currency
            HAVING sum(debit) <> sum(credit)
        """))).all()
        assert unbalanced == []
        drift = (await db.execute(text("""
            SELECT a.code, a.balance,
                   COALESCE(sum(CASE WHEN a.type IN ('asset','expense') THEN l.debit - l.credit
                                     ELSE l.credit - l.debit END), 0) AS computed
            FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
            GROUP BY a.id HAVING a.balance <> COALESCE(sum(CASE WHEN a.type IN ('asset','expense')
                THEN l.debit - l.credit ELSE l.credit - l.debit END), 0)
        """))).all()
        assert drift == []
        projection = (await db.execute(text("""
            SELECT c.id FROM wallet_cards c JOIN ledger_accounts a ON a.wallet_card_id = c.id
            WHERE c.balance <> a.balance
        """))).all()
        assert projection == []


async def signup(client: AsyncClient) -> dict:
    r = await client.post("/api/auth/signup", json={
        "name": "Ledger User", "email": unique_email(), "username": unique_username(),
        "password": "password123", "residenceCountry": "ZA", "acceptTerms": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    await set_test_pin(client, headers)
    async with get_session_factory()() as db:  # contact-verified (KYC level 1)
        await db.execute(text("UPDATE users SET kyc_level = 1 WHERE id = :id"), {"id": body["user"]["id"]})
        await db.commit()
    cards = (await client.get("/api/cards", headers=headers)).json()
    return {"user": body["user"], "headers": headers, "card_id": cards[0]["id"]}


async def card_balance(card_id: str) -> Decimal:
    async with get_session_factory()() as db:
        return (await db.get(WalletCard, uuid.UUID(card_id))).balance


# ─── posting engine ─────────────────────────────────────────────────────────


async def test_unbalanced_posting_is_rejected(client: AsyncClient):
    u = await signup(client)
    async with get_session_factory()() as db:
        card = await db.get(WalletCard, uuid.UUID(u["card_id"]))
        wallet = await accounts.wallet_account(db, card)
        clearing = await accounts.provider_clearing(db, "test", "ZAR")
        with pytest.raises(posting.LedgerError):
            await posting.post(db, kind="bad", description="bad", legs=[
                posting.debit(clearing, Decimal("10.00")), posting.credit(wallet, Decimal("9.99")),
            ])
        await db.rollback()


async def test_database_rejects_unbalanced_lines_even_without_the_engine(client: AsyncClient):
    """The deferred trigger catches a hand-written unbalanced journal."""
    u = await signup(client)
    async with get_session_factory()() as db:
        card = await db.get(WalletCard, uuid.UUID(u["card_id"]))
        wallet = await accounts.wallet_account(db, card)
        await db.commit()
    async with get_session_factory()() as db:
        entry = JournalEntry(reference="JRN-TEST-" + uuid.uuid4().hex[:8], kind="manual", description="x", details={})
        db.add(entry)
        await db.flush()
        db.add(JournalLine(entry_id=entry.id, line_no=1, account_id=wallet.id, currency="ZAR",
                           debit=Decimal("0"), credit=Decimal("5.00")))
        await db.flush()
        with pytest.raises(Exception, match="does not balance"):
            await db.commit()


async def test_journal_is_append_only(client: AsyncClient, funded_user: dict):
    async with get_session_factory()() as db:
        line = (await db.execute(select(JournalLine).limit(1))).scalar_one()
        with pytest.raises(Exception, match="append-only"):
            await db.execute(text("UPDATE journal_lines SET credit = credit + 1 WHERE id = :id"), {"id": line.id})
        await db.rollback()
    async with get_session_factory()() as db:
        with pytest.raises(Exception, match="append-only"):
            await db.execute(text("DELETE FROM journal_entries"))
        await db.rollback()


async def test_balances_cannot_be_written_outside_the_ledger(client: AsyncClient, funded_user: dict):
    async with get_session_factory()() as db:
        with pytest.raises(Exception, match="only be changed by a ledger posting"):
            await db.execute(
                text("UPDATE wallet_cards SET balance = 999999 WHERE id = :id"), {"id": funded_user["card_id"]}
            )
        await db.rollback()
    async with get_session_factory()() as db:
        with pytest.raises(Exception, match="only be changed by a ledger posting"):
            await db.execute(text("UPDATE ledger_accounts SET balance = balance + 1"))
        await db.rollback()


async def test_pre_ledger_balance_gets_opening_entry(client: AsyncClient):
    """A wallet that held money before the ledger existed is brought in
    through suspense:migration the first time it is touched."""
    u = await signup(client)
    async with get_session_factory()() as db:
        await db.execute(text("SELECT set_config('bukkapay.ledger_posting', 'on', true)"))
        await db.execute(text("UPDATE wallet_cards SET balance = 250 WHERE id = :id"), {"id": u["card_id"]})
        await db.commit()
    other = await signup(client)
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": u["card_id"], "toUserId": other["user"]["walletId"], "amount": "100.00",
    }, headers=u["headers"])
    assert r.status_code == 200, r.text
    assert await card_balance(u["card_id"]) == Decimal("150.00")
    async with get_session_factory()() as db:
        opening = (await db.execute(
            select(JournalEntry).where(
                JournalEntry.kind == "opening_balance",
                JournalEntry.details["wallet_card_id"].astext == u["card_id"],
            )
        )).scalar_one()
        assert sum(line.credit for line in opening.lines) == Decimal("250.00")
    await assert_ledger_consistent()


# ─── transfers ──────────────────────────────────────────────────────────────


async def test_concurrent_transfers_cannot_overspend(client: AsyncClient):
    sender = await signup(client)
    await fund_card(sender["card_id"], "100.00")
    recipients = [await signup(client) for _ in range(5)]

    async def send(r):
        return await client.post("/api/transfer", json={"pin": TEST_PIN, 
            "fromCardId": sender["card_id"], "toUserId": r["user"]["walletId"], "amount": "60.00",
        }, headers=sender["headers"])

    results = await asyncio.gather(*(send(r) for r in recipients))
    ok = [r for r in results if r.status_code == 200]
    assert len(ok) == 1, [r.text for r in results]
    assert all("insufficient" in r.json()["error"].lower() for r in results if r.status_code != 200)
    assert await card_balance(sender["card_id"]) == Decimal("40.00")
    await assert_ledger_consistent()


async def test_transfer_idempotency_key_replays_without_double_debit(client: AsyncClient, funded_user: dict,
                                                                   other_user: dict):
    body = {"pin": TEST_PIN, "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"],
            "amount": "25.00"}
    headers = {**funded_user["headers"], "Idempotency-Key": "tx-" + uuid.uuid4().hex}
    first = await client.post("/api/transfer", json=body, headers=headers)
    second = await client.post("/api/transfer", json=body, headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert await card_balance(funded_user["card_id"]) == Decimal("975.00")

    changed = await client.post("/api/transfer", json={"pin": TEST_PIN, **body, "amount": "30.00"}, headers=headers)
    assert changed.status_code == 422


async def test_transfer_rejects_sub_cent_amounts(client: AsyncClient, funded_user: dict, other_user: dict):
    r = await client.post("/api/transfer", json={"pin": TEST_PIN, 
        "fromCardId": funded_user["card_id"], "toUserId": other_user["user"]["walletId"], "amount": "10.005",
    }, headers=funded_user["headers"])
    assert r.status_code == 400


async def test_removed_balance_endpoints_are_gone(client: AsyncClient, funded_user: dict, admin: dict):
    r = await client.patch(f"/api/cards/{funded_user['card_id']}/balance", json={"balance": "1000000"},
                           headers=funded_user["headers"])
    assert r.status_code in (404, 405)
    r = await client.post("/api/transactions", json={
        "title": "free money", "category": "x", "amount": "500", "type": "credit", "icon": "x",
    }, headers=funded_user["headers"])
    assert r.status_code in (404, 405)
    r = await client.patch(f"/api/admin/wallets/{funded_user['card_id']}/balance", json={"balance": "1"},
                           headers=admin["master_headers"])
    assert r.status_code in (404, 405)
    assert await card_balance(funded_user["card_id"]) == Decimal("1000.00")


# ─── merchant pay ───────────────────────────────────────────────────────────


async def test_merchant_pay_requires_login_and_debits_payer(client: AsyncClient, funded_user: dict,
                                                           other_user: dict):
    r = await client.post("/api/merchants", json={
        "businessName": "Ledger Shop", "businessType": "retail",
    }, headers=other_user["headers"])
    assert r.status_code in (200, 201), r.text
    merchant_id = r.json()["id"]
    async with get_session_factory()() as db:  # verified business (KYB approved)
        await db.execute(text("UPDATE merchants SET kyb_status='approved' WHERE id=:id"), {"id": merchant_id})
        await db.commit()

    anon = await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": "50.00"})
    assert anon.status_code == 401

    paid = await client.post(f"/api/merchant-pay/{merchant_id}", json={"amount": "50.00", "pin": TEST_PIN},
                             headers=funded_user["headers"])
    assert paid.status_code == 201, paid.text
    assert await card_balance(funded_user["card_id"]) == Decimal("950.00")
    await assert_ledger_consistent()


# ─── Stitch top-up / withdrawal ─────────────────────────────────────────────


@pytest.fixture
def stitch_sandbox(monkeypatch):
    state = {"result": ("completed", None), "disbursement": None}

    async def create_payment_request(amount, currency, reference, payer_reference, redirect_url):
        state["amount"] = Decimal(str(amount))
        return {"id": "pr_" + uuid.uuid4().hex, "url": "https://stitch.test/pay"}

    async def get_payment_result(payment_request_id):
        status, amount = state["result"]
        return status, (state.get("amount") if amount is None and status == "completed" else amount)

    async def create_disbursement(**kwargs):
        if isinstance(state["disbursement"], Exception):
            raise state["disbursement"]
        return {"id": "dis_" + uuid.uuid4().hex, "status": "pending"}

    monkeypatch.setattr(stitch, "is_stitch_payments_configured", lambda: True)
    monkeypatch.setattr(stitch, "create_payment_request", create_payment_request)
    monkeypatch.setattr(stitch, "get_payment_result", get_payment_result)
    monkeypatch.setattr(stitch, "create_disbursement", create_disbursement)
    return state


async def test_topup_credits_provider_amount_once_and_only_for_owner(client: AsyncClient, stitch_sandbox):
    u = await signup(client)
    intruder = await signup(client)
    r = await client.post("/api/wallet/topup/stitch", json={"walletCardId": u["card_id"], "amount": "100.00"},
                          headers=u["headers"])
    assert r.status_code == 200, r.text
    pr = r.json()["paymentRequestId"]

    # Another user can't claim it, and a client-supplied amount is ignored.
    stolen = await client.post("/api/wallet/topup/stitch/verify", json={
        "paymentRequestId": pr, "walletCardId": intruder["card_id"], "amount": "100000.00",
    }, headers=intruder["headers"])
    assert stolen.status_code == 404

    for _ in range(3):
        v = await client.post("/api/wallet/topup/stitch/verify", json={
            "paymentRequestId": pr, "walletCardId": u["card_id"], "amount": "100000.00",
        }, headers=u["headers"])
        assert v.status_code == 200, v.text
        assert v.json()["status"] == "completed"
    assert await card_balance(u["card_id"]) == Decimal("100.00")
    assert await card_balance(intruder["card_id"]) == Decimal("0.00")
    await assert_ledger_consistent()


async def test_topup_amount_mismatch_is_held_for_review(client: AsyncClient, stitch_sandbox):
    u = await signup(client)
    r = await client.post("/api/wallet/topup/stitch", json={"walletCardId": u["card_id"], "amount": "100.00"},
                          headers=u["headers"])
    stitch_sandbox["result"] = ("completed", Decimal("10.00"))
    v = await client.post("/api/wallet/topup/stitch/verify", json={"paymentRequestId": r.json()["paymentRequestId"]},
                          headers=u["headers"])
    assert v.json()["status"] == "review"
    assert await card_balance(u["card_id"]) == Decimal("0.00")
    async with get_session_factory()() as db:
        fr = (await db.execute(select(FundingRequest).where(
            FundingRequest.provider_reference == r.json()["paymentRequestId"]))).scalar_one()
        assert fr.status == "review"


async def test_topup_callback_ignores_redirect_params(client: AsyncClient, stitch_sandbox):
    u = await signup(client)
    victim_target = await signup(client)
    r = await client.post("/api/wallet/topup/stitch", json={"walletCardId": u["card_id"], "amount": "40.00"},
                          headers=u["headers"])
    body = r.json()
    cb = await client.get("/api/stitch/topup/callback", params={
        "ref": body["reference"], "id": body["paymentRequestId"],
        "cardId": victim_target["card_id"], "amount": "99999",
    })
    assert cb.status_code in (302, 307)
    assert await card_balance(u["card_id"]) == Decimal("40.00")
    assert await card_balance(victim_target["card_id"]) == Decimal("0.00")


async def test_withdrawal_rejected_by_provider_restores_balance(client: AsyncClient, stitch_sandbox):
    u = await signup(client)
    await fund_card(u["card_id"], "500.00")
    stitch_sandbox["disbursement"] = stitch.StitchRejected("invalid account")
    r = await client.post("/api/wallet/withdraw/stitch", json={
        "walletCardId": u["card_id"], "amount": "200.00", "bankId": "fnb",
        "accountNumber": "62000000000", "accountName": "Ledger User", "pin": TEST_PIN,
    }, headers=u["headers"])
    assert r.status_code == 502
    assert await card_balance(u["card_id"]) == Decimal("500.00")
    await assert_ledger_consistent()


async def test_withdrawal_timeout_keeps_funds_pending_not_lost(client: AsyncClient, stitch_sandbox):
    u = await signup(client)
    await fund_card(u["card_id"], "500.00")
    stitch_sandbox["disbursement"] = TimeoutError("read timeout")
    r = await client.post("/api/wallet/withdraw/stitch", json={
        "walletCardId": u["card_id"], "amount": "200.00", "bankId": "fnb",
        "accountNumber": "62000000000", "accountName": "Ledger User", "pin": TEST_PIN,
    }, headers=u["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "processing"
    assert await card_balance(u["card_id"]) == Decimal("291.50")  # 200 + R8.50 withdrawal fee
    async with get_session_factory()() as db:
        pending = (await db.execute(
            select(LedgerAccount).where(LedgerAccount.code == "payouts:pending:ZAR")
        )).scalar_one()
        assert pending.balance >= Decimal("200.00")
    await assert_ledger_consistent()


# ─── schema drift ───────────────────────────────────────────────────────────


def test_migration_ddl_matches_orm_ddl():
    """The ORM test schema and the migrations must install the same triggers."""
    import importlib.util
    from pathlib import Path

    from app.ledger import ddl

    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"

    def load(name):
        spec = importlib.util.spec_from_file_location(name, versions / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def norm(sql: str) -> str:
        return re.sub(r"\s+", " ", sql).strip()

    migration_sql = {norm(s) for s in load("0016_ledger_and_currencies").LEDGER_DDL}
    migration_sql.add(norm(load("0017_network_platform").CONTRIBUTION_GUARD))
    for stmt in ddl.ALL:
        if stmt.lstrip().upper().startswith("DROP TRIGGER"):
            continue
        assert norm(stmt) in migration_sql, stmt
