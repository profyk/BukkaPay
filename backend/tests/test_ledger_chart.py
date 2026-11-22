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
