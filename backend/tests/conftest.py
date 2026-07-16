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
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "postgresql://bukkapay:bukkapay@localhost:5432/bukkapay_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ADMIN_API_KEY", "test-master-key")

import app.core.redis as redis_module  # noqa: E402

_fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
redis_module.get_redis = lambda: _fake_redis

from app.core.config import get_settings  # noqa: E402
from app.db.base import Base, get_engine  # noqa: E402
import app.models  # noqa: E402,F401 — registers every model on Base.metadata

get_settings.cache_clear()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await _seed_corridors(engine)
    yield
    await engine.dispose()


async def _seed_corridors(engine):
    """Mirrors the seed data inserted by the 0005 migration, since tests
    build schema from the ORM models directly rather than replaying
    migrations."""
    from sqlalchemy import insert
    from app.models.wallet import CurrencyCorridor

    seed = [
        ("USD", "ZAR", "18.200000"), ("ZAR", "USD", "0.054945"),
        ("USD", "BWP", "13.500000"), ("BWP", "USD", "0.074074"),
        ("ZAR", "BWP", "0.741758"), ("BWP", "ZAR", "1.348148"),
    ]
    async with engine.begin() as conn:
        for from_cur, to_cur, rate in seed:
            await conn.execute(insert(CurrencyCorridor).values(
                from_currency=from_cur, to_currency=to_cur, exchange_rate=rate,
                fee_percentage="1.0", fee_fixed="0",
            ))


@pytest_asyncio.fixture
async def client():
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await _fake_redis.flushall()


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:10]}@example.com"


def unique_username() -> str:
    return f"user{uuid.uuid4().hex[:10]}"


@pytest_asyncio.fixture
async def user(client: AsyncClient) -> dict:
    """Signs up a fresh user and returns {token, user, headers}."""
    r = await client.post("/api/auth/signup", json={
        "name": "Test User", "email": unique_email(), "username": unique_username(),
        "password": "password123",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {"token": body["token"], "user": body["user"], "headers": {"Authorization": f"Bearer {body['token']}"}}


@pytest_asyncio.fixture
async def funded_user(client: AsyncClient, user: dict) -> dict:
    r = await client.get("/api/cards", headers=user["headers"])
    card_id = r.json()[0]["id"]
    await client.patch(f"/api/cards/{card_id}/balance", json={"balance": "1000.00"}, headers=user["headers"])
    user["card_id"] = card_id
    return user


@pytest_asyncio.fixture
async def other_user(client: AsyncClient) -> dict:
    """A second, independent user — distinct from `user`/`funded_user`, which
    share one underlying account since `funded_user` depends on `user`."""
    r = await client.post("/api/auth/signup", json={
        "name": "Other User", "email": unique_email(), "username": unique_username(),
        "password": "password123",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {"token": body["token"], "user": body["user"], "headers": {"Authorization": f"Bearer {body['token']}"}}


SUPER_ADMIN_EMAIL = "super-admin@example.com"
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
