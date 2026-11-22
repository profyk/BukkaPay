"""Milestone 1: strict account segregation, the SYS_* chart of accounts and
proof of reserve."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.db.base import get_session_factory
from app.ledger import chart, reserves
from app.models.ledger import CustodianBalanceSnapshot, LedgerAccount
from tests.conftest import fund_card

pytestmark = pytest.mark.asyncio


def test_system_code_mapping():
    assert chart.system_code_for("revenue:fx:ZAR") == "SYS_REVENUE_FX_ZAR"
    assert chart.system_code_for("card:holds:BWP") == "SYS_CARD_HOLD_ESCROW_BWP"
    assert chart.system_code_for("payable:travel_operators:USD") == "SYS_FLIGHT_SETTLEMENT_USD"
    assert chart.system_code_for("card:payable:sandbox:ZAR") is None
    assert chart.system_code_for("wallet:123") is None
    assert chart.category_for("wallet:abc") == "customer"
    assert chart.category_for("merchant:abc:ZAR") == "merchant"
    assert chart.category_for("revenue:fees:ZAR") == "system"


async def test_accounts_are_segregated(client: AsyncClient, funded_user: dict):
    async with get_session_factory()() as db:
        wallet = (await db.execute(select(LedgerAccount).where(
            LedgerAccount.code == f"wallet:{funded_user['card_id']}"))).scalar_one()
        assert wallet.category == "customer" and wallet.system_code is None
        fx = await chart.sys_account(db, "SYS_REVENUE_FX", "BWP")
        assert fx.category == "system" and fx.system_code == "SYS_REVENUE_FX_BWP" and fx.type == "revenue"
        await db.commit()

    # The database refuses an account whose category doesn't match its code.
    for code, category in ((f"wallet:{uuid.uuid4()}", "system"), ("revenue:test:ZAR", "customer"),
                           (f"merchant:{uuid.uuid4()}:ZAR", "customer")):
        async with get_session_factory()() as db:
            with pytest.raises((IntegrityError, DBAPIError)):
                await db.execute(text(
                    "INSERT INTO ledger_accounts (id, code, name, type, currency, allow_negative, category, "
                    "balance, version, created_at) VALUES (gen_random_uuid(), :c, 'x', 'liability', 'ZAR', false, "
                    ":cat, 0, 0, now())"), {"c": code, "cat": category})
            await db.rollback()


async def test_proof_of_reserve(client: AsyncClient, user: dict):
    cards = (await client.get("/api/cards", headers=user["headers"])).json()
    await fund_card(cards[0]["id"], "250.00")
    async with get_session_factory()() as db:
        owed = (await reserves.liabilities_by_currency(db))["ZAR"]
        assert owed >= Decimal("250.00")
        cid = (await db.execute(text(
            "INSERT INTO custodians (id, name, country_code, institution_type, status, integration_status, "
            "regulatory_status, contact, created_at, updated_at) VALUES (gen_random_uuid(), 'Test Bank', 'ZA', "
            "'bank', 'active', 'none', 'licensed', '{}'::jsonb, now(), now()) RETURNING id"))).scalar_one()
        db.add(CustodianBalanceSnapshot(custodian_id=cid, currency="ZAR", balance=owed - Decimal("1.00"),
                                        as_of=datetime(2026, 1, 1, tzinfo=UTC), source="statement"))
        await db.flush()
        zar = next(r for r in await reserves.proof_of_reserve(db) if r["currency"] == "ZAR")
        assert zar["covered"] is False and Decimal(zar["surplus"]) <= Decimal("-1.00")
        # A newer statement replaces the older one for that custodian.
        db.add(CustodianBalanceSnapshot(custodian_id=cid, currency="ZAR", balance=owed + Decimal("500.00"),
                                        as_of=datetime(2026, 1, 2, tzinfo=UTC), source="statement"))
        await db.flush()
        zar = next(r for r in await reserves.proof_of_reserve(db) if r["currency"] == "ZAR")
        assert zar["covered"] is True
        await db.rollback()


def test_trade_escrow_accounts_in_chart():
    assert chart.system_code_for("escrow:trade:BWP") == "SYS_TRADE_ESCROW_BWP"
    assert chart.system_code_for("revenue:escrow_fees:USD") == "SYS_REVENUE_ESCROW_FEES_USD"
    assert any(p == "escrow:" for p in reserves.CUSTOMER_FUND_PREFIXES)  # escrow counts as owed


async def test_trade_schema_rules(client: AsyncClient, business_user: dict, user: dict):
    from app.ledger import posting
    from app.models.trade import EscrowContract, EscrowEvent, TradeInvoice

    r = await client.post("/api/merchants", json={"businessName": "Gabs Wholesale", "businessType": "retail"},
                          headers=business_user["headers"])
    merchant_id = uuid.UUID(r.json()["id"])
    buyer_id = uuid.UUID(user["user"]["id"])

    # Invoice totals must add up.
    async with get_session_factory()() as db:
        db.add(TradeInvoice(reference="TINV-BAD", merchant_id=merchant_id, buyer_name="B", seller_country="BW",
                            currency="BWP", subtotal=Decimal("100.00"), tax_total=Decimal("14.00"),
                            total=Decimal("100.00")))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()

    async with get_session_factory()() as db:
        fx = await chart.sys_account(db, "SYS_FX_POOL", "BWP")
        esc = await chart.sys_account(db, "SYS_TRADE_ESCROW", "BWP")
        entry = await posting.post(db, kind="test_escrow", description="t",
                                   legs=[posting.debit(fx, Decimal("10.00")), posting.credit(esc, Decimal("10.00"))])
        # Fee rate is capped at 5%.
        db.add(EscrowContract(reference="ESC-BADFEE", buyer_user_id=buyer_id, merchant_id=merchant_id, currency="BWP",
                              amount=Decimal("10.00"), fee_rate=Decimal("0.0600"), fee_amount=Decimal("0.60"),
                              funded_entry_id=entry.id, idempotency_key="k1"))
        with pytest.raises(IntegrityError):
            await db.flush()
        await db.rollback()

    async with get_session_factory()() as db:
        fx = await chart.sys_account(db, "SYS_FX_POOL", "BWP")
        esc = await chart.sys_account(db, "SYS_TRADE_ESCROW", "BWP")
        entry = await posting.post(db, kind="test_escrow", description="t",
                                   legs=[posting.debit(fx, Decimal("10.00")), posting.credit(esc, Decimal("10.00"))])
        c = EscrowContract(reference=f"ESC-{uuid.uuid4().hex[:8]}", buyer_user_id=buyer_id, merchant_id=merchant_id,
                           currency="BWP", amount=Decimal("10.00"), fee_rate=Decimal("0.0100"),
                           fee_amount=Decimal("0.10"), funded_entry_id=entry.id, idempotency_key="k2")
        db.add(c)
        await db.flush()
        ev = EscrowEvent(contract_id=c.id, event="funded", actor_type="buyer", actor_id=str(buyer_id))
        db.add(ev)
        await db.commit()
    # History can't be rewritten.
    async with get_session_factory()() as db:
        with pytest.raises(DBAPIError):
            await db.execute(text("UPDATE escrow_events SET note = 'edited' WHERE id = :i"), {"i": ev.id})
        await db.rollback()
