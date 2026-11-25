"""Account deletion: refused while money is held, then the account is
anonymised, sessions end, identity details are sealed for the retention
period and purged afterwards."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.db.base import get_session_factory
from app.models.closure import ClosedAccount
from app.models.user import User
from app.services import account_closure
from tests.conftest import TEST_PIN, fund_card
from tests.test_network import signup

pytestmark = pytest.mark.asyncio


async def test_customer_deletes_account(client: AsyncClient):
    u = await signup(client, "ZA", kyc_level=1)
    email = u["user"]["email"]
    await fund_card(u["card_id"], "10.00")

    check = (await client.get("/api/account/closure-check", headers=u["headers"])).json()
    assert check["canClose"] is False and "ZAR wallet" in check["blockers"][0]
    r = await client.post("/api/account/close", json={"pin": TEST_PIN, "confirm": "DELETE"}, headers=u["headers"])
    assert r.status_code == 409

    # Empty the wallet (as a withdrawal would), then close.
    from decimal import Decimal

    from app.ledger import accounts, posting
    from app.models.wallet import WalletCard

    async with get_session_factory()() as db:
        card = await db.get(WalletCard, uuid.UUID(u["card_id"]))
        await posting.post(db, kind="test_withdrawal", description="withdraw", legs=[
            posting.debit(await accounts.wallet_account(db, card), Decimal("10.00")),
            posting.credit(await accounts.provider_clearing(db, "test", "ZAR"), Decimal("10.00"))])
        await db.commit()
    bad = await client.post("/api/account/close", json={"pin": TEST_PIN, "confirm": "yes"}, headers=u["headers"])
    assert bad.status_code == 400
    r = await client.post("/api/account/close", json={"pin": TEST_PIN, "confirm": "DELETE", "reason": "moving"},
                          headers=u["headers"])
    assert r.status_code == 200, r.text

    # Signed out everywhere, can't sign in, details gone from the live account.
    assert (await client.get("/api/account/closure-check", headers=u["headers"])).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": email, "password": "password123"})).status_code == 401
    async with get_session_factory()() as db:
        user = await db.get(User, uuid.UUID(u["user"]["id"]))
        assert user.deleted_at and user.name == "Deleted User" and user.phone is None and user.password is None
        rec = (await db.execute(__import__("sqlalchemy").select(ClosedAccount).where(
            ClosedAccount.user_id == user.id))).scalar_one()
        assert rec.snapshot["email"] == email and rec.closed_by == "customer"
        assert rec.retain_until > datetime.now(UTC) + timedelta(days=365 * 4)
        # After the retention period the sealed details are purged.
        assert await account_closure.purge_expired(db, now=rec.retain_until + timedelta(days=1)) >= 1
        await db.commit()
        await db.refresh(rec)
        assert rec.snapshot is None and rec.purged_at is not None


async def test_business_account_deletes_with_password(client: AsyncClient):
    from tests.conftest import signup_business

    owner = await signup_business(client, "Closing Shop")
    check = await client.get("/api/account/closure-check", headers=owner["headers"])
    assert check.status_code == 200, check.text  # business tokens can use /api/account
    assert check.json()["canClose"] is True and check.json()["confirmWith"] == "pin"
    async with get_session_factory()() as db:  # a web-only owner with no PIN confirms with the password
        user = await db.get(User, uuid.UUID(owner["user"]["id"]))
        user.transaction_pin = None
        await db.commit()
    assert (await client.get("/api/account/closure-check", headers=owner["headers"])).json()["confirmWith"] == "password"
    bad = await client.post("/api/account/close", json={"confirm": "DELETE", "password": "wrong"}, headers=owner["headers"])
    assert bad.status_code == 401
    ok = await client.post("/api/account/close", json={"confirm": "DELETE", "password": "password123"},
                           headers=owner["headers"])
    assert ok.status_code == 200, ok.text
