"""FX protections: spread floor, stale-rate pause, no profitable round trip,
reverse-swap cap and daily swap limit."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.db.base import get_session_factory
from app.models.wallet import CurrencyCorridor
from tests.conftest import TEST_PIN, fund_card
from tests.test_network import signup
from tests.test_trade import _rate

pytestmark = pytest.mark.asyncio


async def _quote(client, u, src, dst, amount):
    return await client.get("/api/swap/quote", params={"from": src, "to": dst, "amount": amount}, headers=u["headers"])


async def _swap(client, u, card_id, dst, amount, expected):
    return await client.post("/api/swap", json={"fromCardId": card_id, "toCurrency": dst, "amount": amount,
                                                "expectedReceive": expected, "pin": TEST_PIN},
                             headers={**u["headers"], "Idempotency-Key": uuid.uuid4().hex})


async def test_spread_floor_and_round_trip_and_stale(client: AsyncClient, admin: dict):
    u = await signup(client, "ZA", kyc_level=1)
    await _rate("ZAR", "BWP", "0.735000", spread_pct="0.00")
    await _rate("BWP", "ZAR", "1.360544", spread_pct="0.00")
    q = (await _quote(client, u, "ZAR", "BWP", "100.00")).json()
    assert Decimal(q["spreadPercent"]) == Decimal("0.5") and q["spread"] == "0.37"  # floor applied despite a 0% pair

    # Reverse pair priced so a round trip would pay out: refused at quote time and at the FX desk.
    await _rate("BWP", "ZAR", "1.400000", spread_pct="0.00")
    r = await _quote(client, u, "ZAR", "BWP", "100.00")
    assert r.status_code == 409 and "paused" in r.text
    async with get_session_factory()() as db:
        pid = (await db.execute(__import__("sqlalchemy").select(CurrencyCorridor.id).where(
            CurrencyCorridor.from_currency == "BWP", CurrencyCorridor.to_currency == "ZAR"))).scalar_one()
    bad = await client.patch(f"/api/admin/fx/pairs/{pid}", json={"rate": "1.41", "reason": "test"}, headers=admin["headers"])
    assert bad.status_code == 409 and "more than they started with" in bad.text
    ok = await client.patch(f"/api/admin/fx/pairs/{pid}", json={"rate": "1.35", "spreadPct": "1.00", "reason": "test"},
                            headers=admin["headers"])
    assert ok.status_code == 200, ok.text

    # Stale rate pauses the pair.
    async with get_session_factory()() as db:
        await db.execute(update(CurrencyCorridor).where(CurrencyCorridor.from_currency == "ZAR",
                                                        CurrencyCorridor.to_currency == "BWP")
                         .values(updated_at=datetime.now(UTC) - timedelta(hours=30)))
        await db.commit()
    r = await _quote(client, u, "ZAR", "BWP", "100.00")
    assert r.status_code == 409 and "being updated" in r.text
    await _rate("ZAR", "BWP", "0.735000", spread_pct="1.00")


async def test_reverse_swap_cap_and_daily_limit(client: AsyncClient, admin: dict):
    await _rate("ZAR", "BWP", "0.735000", spread_pct="1.00")
    await _rate("BWP", "ZAR", "1.340000", spread_pct="1.00")
    u = await signup(client, "ZA", kyc_level=1)
    await fund_card(u["card_id"], "1000.00")
    q = (await _quote(client, u, "ZAR", "BWP", "500.00")).json()
    r = await _swap(client, u, u["card_id"], "BWP", "500.00", q["receive"])
    assert r.status_code == 201, r.text
    bwp_card, got = r.json()["toCardId"], Decimal(r.json()["received"])

    # The market moves in the customer's favour (ZAR weakens: both directions re-priced).
    # Converting back is capped at what they paid, so they never end up with more ZAR.
    await _rate("ZAR", "BWP", "0.690000", spread_pct="1.00")
    await _rate("BWP", "ZAR", "1.420000", spread_pct="1.00")
    q = (await _quote(client, u, "BWP", "ZAR", str(got))).json()
    assert q["note"] and "capped" in q["note"]
    assert Decimal(q["receive"]) < Decimal("500.00")
    r = await _swap(client, u, bwp_card, "ZAR", str(got), q["receive"])
    assert r.status_code == 201, r.text

    # Daily limit (10 per 24h).
    async with get_session_factory()() as db:
        from app.pricing import service as pricing

        await pricing.set_setting(db, "fx", {"max_swaps_per_day": 2}, actor="test")
        await db.commit()
    try:
        r = await _quote(client, u, "ZAR", "BWP", "10.00")
        assert r.status_code == 429 and "limit" in r.text
    finally:
        async with get_session_factory()() as db:
            await pricing.set_setting(db, "fx", {"max_swaps_per_day": 10}, actor="test")
            await db.commit()
        await _rate("ZAR", "BWP", "0.735000", spread_pct="1.00")
        await _rate("BWP", "ZAR", "1.340000", spread_pct="1.00")
