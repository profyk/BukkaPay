"""Live FX feed: pairs re-priced from market mids minus the buffer, big jumps
held by the circuit breaker, feed failures leave rates to go stale."""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.base import get_session_factory
from app.models.wallet import CurrencyCorridor
from app.services import fx_feed
from tests.test_trade import _rate

pytestmark = pytest.mark.asyncio

POL = {"feed_enabled": True, "feed_buffer_bps": 30, "feed_max_move_pct": 3, "feed_stale_minutes": 10}


async def _pair(src, dst) -> Decimal:
    async with get_session_factory()() as db:
        return (await db.execute(select(CurrencyCorridor.exchange_rate).where(
            CurrencyCorridor.from_currency == src, CurrencyCorridor.to_currency == dst))).scalar_one()


async def test_feed_reprices_pairs_with_buffer_and_breaker(client: AsyncClient):
    await _rate("ZAR", "BWP", "0.735000")
    await _rate("BWP", "ZAR", "1.340000")
    mids = {"USD": Decimal(1), "ZAR": Decimal("18.00"), "BWP": Decimal("13.30")}
    async with get_session_factory()() as db:
        r = await fx_feed.apply(db, mids, POL)
        await db.commit()
    assert r["updated"] >= 2 and not r["held"]
    zb = await _pair("ZAR", "BWP")
    assert zb == (Decimal("13.30") / Decimal("18.00") * Decimal("0.997")).quantize(Decimal("0.000001"))
    bz = await _pair("BWP", "ZAR")
    assert zb * bz < 1  # a round trip always loses, before spreads even apply

    # A 10% jump in one refresh is held, not applied.
    async with get_session_factory()() as db:
        r = await fx_feed.apply(db, {**mids, "BWP": Decimal("14.70")}, POL)
        await db.commit()
    assert any(h["pair"] == "ZARBWP" for h in r["held"])
    assert await _pair("ZAR", "BWP") == zb


async def test_feed_failure_keeps_rates_and_admin_refresh(client: AsyncClient, admin: dict, monkeypatch):
    async def boom():
        raise RuntimeError("feed down")

    monkeypatch.setattr(fx_feed, "fetch_mids", boom)
    from app.services import fx_guard

    async def pol(db):
        return {**await __import__("app.pricing.service", fromlist=["x"]).get_setting(db, "fx"), "feed_enabled": True}

    monkeypatch.setattr(fx_guard, "policy", pol)
    r = await client.post("/api/admin/fx/feed/refresh", headers=admin["headers"])
    assert r.status_code == 200 and r.json()["ok"] is False and "feed down" in r.json()["error"]
    desk = (await client.get("/api/admin/fx/desk", headers=admin["headers"])).json()
    assert desk["feed"]["enabled"] is True and desk["feed"]["last"]["ok"] is False
