"""Test infrastructure: a real Postgres (schema created directly from the
current ORM models — this tests the app's end-state, not the migration
path; the migration itself is validated separately via its own dry-run
against a restored schema copy, see the plan) and fakeredis standing in
for Redis, since a real Redis server isn't available in every environment
this suite runs in.

Requires DATABASE_URL to point at a disposable Postgres (docker-compose
provides one; see docker-compose.yml). Tests use randomly-suffixed emails/
usernames rather than full per-test transactional isolation, so they're
safe to run against a shared schema without conflicting.
"""

import os
import uuid

import fakeredis.aioredis
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "postgresql://bukkapay:bukkapay@localhost:5432/bukkapay_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("FX_FEED_ENABLED", "false")  # tests set rates by hand; test_fx_feed turns it on
os.environ["ADMIN_API_KEY"] = "test-master-key"  # fixtures send this exact key

import app.core.redis as redis_module

_fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
redis_module.get_redis = lambda: _fake_redis

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.core.config import get_settings
from app.db.base import Base, get_engine

get_settings.cache_clear()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    from app.reference.bootstrap import seed_reference_data

    async with engine.begin() as conn:
        await seed_reference_data(conn)
    from sqlalchemy import text

    from app.db import rls

    async with engine.begin() as conn:
        # Same deny-by-default RLS as production (migration 0022).
        await conn.execute(text(
            "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') "
            "THEN CREATE ROLE anon NOLOGIN; END IF; END $$"
        ))
        await conn.execute(text(rls.FUNCTION))
        await conn.execute(text(rls.ENABLE))
        # Same sole-super-admin guard as production (migration 0024).
        from app.db import admin_guard

        await conn.execute(text(admin_guard.SINGLE_SUPER_ADMIN_INDEX))
        await conn.execute(text(admin_guard.FUNCTION))
        await conn.execute(text(admin_guard.DROP_TRIGGER))
        await conn.execute(text(admin_guard.TRIGGER))
        await conn.execute(text(admin_guard.INVITES_NOT_SUPER))
        for stmt in admin_guard.INVITES_OWNER_ONLY_SUPER:
            await conn.execute(text(stmt))
        # Admin and customer/business emails never overlap (migration 0027).
        from app.db import account_guard

        await conn.execute(text(account_guard.ACCOUNT_TYPE_CHECK))
        await conn.execute(text(account_guard.FUNCTION))
        for stmt in account_guard.TRIGGERS:
            await conn.execute(text(stmt))
        # Escrow history and trade receipts are append-only (migration 0030).
        from app.db import trade_guard

        for stmt in trade_guard.TRIGGERS:
            await conn.execute(text(stmt))
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await _fake_redis.flushall()


# Payments require a transaction PIN (pin_service.verify_pin); every test
# user gets this one at signup.
TEST_PIN = "4826"


async def set_test_pin(client: AsyncClient, headers: dict) -> None:
    r = await client.post("/api/auth/pin", json={"newPin": TEST_PIN}, headers=headers)
    assert r.status_code == 200, r.text


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:10]}@example.com"


def unique_username() -> str:
    return f"user{uuid.uuid4().hex[:10]}"


@pytest_asyncio.fixture
async def user(client: AsyncClient) -> dict:
    """Signs up a fresh user and returns {token, user, headers}."""
    r = await client.post("/api/auth/signup", json={
        "name": "Test User", "email": unique_email(), "username": unique_username(),
        "password": "password123", "residenceCountry": "ZA", "acceptTerms": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    await set_test_pin(client, headers)
    return {"token": body["token"], "user": body["user"], "headers": headers}


async def signup_business(client: AsyncClient, name: str = "Biz Owner") -> dict:
    """A Business account (merchant dashboard sign-up), with a PIN set."""
    r = await client.post("/api/auth/signup", json={
        "name": name, "email": unique_email(), "username": unique_username(),
        "password": "password123", "residenceCountry": "ZA", "acceptTerms": True, "app": "merchant",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["accountType"] == "business"
    headers = {"Authorization": f"Bearer {body['token']}"}
    await set_test_pin(client, headers)
    return {"token": body["token"], "user": body["user"], "headers": headers}


@pytest_asyncio.fixture
async def business_user(client: AsyncClient) -> dict:
    return await signup_business(client)


@pytest_asyncio.fixture
async def other_business_user(client: AsyncClient) -> dict:
    return await signup_business(client, "Other Biz")


@pytest_asyncio.fixture
async def funded_user(client: AsyncClient, user: dict) -> dict:
    r = await client.get("/api/cards", headers=user["headers"])
    card_id = r.json()[0]["id"]
    await fund_card(card_id, "1000.00")
    user["card_id"] = card_id
    return user


async def fund_card(card_id: str, amount: str) -> None:
    """Fund a wallet the way a real top-up does — a balanced ledger posting
    from a (test) provider clearing account — since balances can no longer
    be set directly."""
    from decimal import Decimal

    from app.db.base import get_session_factory
    from app.ledger import accounts, posting
    from app.models.wallet import WalletCard

    async with get_session_factory()() as db:
        card = await db.get(WalletCard, uuid.UUID(card_id))
        await posting.post(
            db, kind="test_funding", description="test funding",
            legs=[
                posting.debit(await accounts.provider_clearing(db, "test", card.currency), Decimal(amount)),
                posting.credit(await accounts.wallet_account(db, card), Decimal(amount)),
            ],
        )
        await db.commit()


@pytest_asyncio.fixture
async def other_user(client: AsyncClient) -> dict:
    """A second, independent user — distinct from `user`/`funded_user`, which
    share one underlying account since `funded_user` depends on `user`."""
    r = await client.post("/api/auth/signup", json={
        "name": "Other User", "email": unique_email(), "username": unique_username(),
        "password": "password123", "residenceCountry": "ZA", "acceptTerms": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    await set_test_pin(client, headers)
    return {"token": body["token"], "user": body["user"], "headers": headers}


SUPER_ADMIN_EMAIL = "profykersha18@gmail.com"  # the platform owner (sole super admin)
SUPER_ADMIN_PASSWORD = "password123"


@pytest_asyncio.fixture
async def admin(client: AsyncClient) -> dict:
    """Creates the first super admin (via master key, idempotent — only the
    first call in a test session actually creates it) and logs in."""
    master_headers = {"x-admin-token": "test-master-key"}
    r = await client.post("/api/admin/setup", json={
        "email": SUPER_ADMIN_EMAIL, "name": "Test Admin", "password": SUPER_ADMIN_PASSWORD,
    }, headers=master_headers)
    assert r.status_code in (201, 409), r.text

    r = await client.post(
        "/api/admin/auth/login", json={"email": SUPER_ADMIN_EMAIL, "password": SUPER_ADMIN_PASSWORD}
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "master_headers": master_headers}
