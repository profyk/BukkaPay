"""Live market rates for currency swaps.

Every 30 seconds the worker fetches mid-market rates and re-prices every
active swap pair:

    published rate = market mid × (1 − buffer_bps)
    customer gets  = published rate × (1 − spread)      (app.services.swap_service)

The buffer covers market movement between refreshes, and the spread is
BukkaPay's margin, so a swap never sells currency below market. Both
directions are derived from the same mids, so a round trip always loses.

Safety:
  * circuit breaker — a pair that would move more than `feed_max_move_pct`
    in one refresh is NOT re-priced automatically; it's logged for treasury
    (Admin → FX desk) and the old rate goes stale and pauses on its own;
  * fail safe — if the feed stops, rates stop being refreshed and swaps on
    those pairs pause after `feed_stale_minutes` (fx_guard.check_fresh);
  * provider-neutral — FX_FEED_URL points at any endpoint returning
    {"base": "USD", "rates": {"ZAR": 18.2, ...}} (open.er-api.com format);
    swap in the partner bank's or Onafriq's feed when contracted.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import log
from app.models.wallet import CurrencyCorridor

DEFAULT_URL = "https://open.er-api.com/v6/latest/USD"
STATUS_KEY = "fx:feed:status"
MIDS_KEY = "fx:feed:mids"
RATE_DP = Decimal("0.000001")


def feed_url() -> str:
    return os.environ.get("FX_FEED_URL", DEFAULT_URL)


async def fetch_mids() -> tuple[str, dict[str, Decimal]]:
    """Returns (base, {currency: units per 1 base})."""
    async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "bukkapay-fx-feed"}) as client:
        r = await client.get(feed_url())
        r.raise_for_status()
        body = r.json()
    rates = body.get("rates") or body.get("conversion_rates") or {}
    base = (body.get("base") or body.get("base_code") or "USD").upper()
    mids = {k.upper(): Decimal(str(v)) for k, v in rates.items() if v and Decimal(str(v)) > 0}
    mids[base] = Decimal(1)
    return base, mids


async def apply(db: AsyncSession, mids: dict[str, Decimal], pol: dict, *, now: datetime | None = None) -> dict:
    """Re-price active pairs from mids. Returns counts and any held pairs."""
    now = now or datetime.now(UTC)
    buffer = Decimal(pol["feed_buffer_bps"]) / Decimal(10_000)
    max_move = Decimal(pol["feed_max_move_pct"]) / Decimal(100)
    updated, held, missing = 0, [], []
    pairs = (await db.execute(select(CurrencyCorridor).where(CurrencyCorridor.is_active.is_(True))
                              .with_for_update(skip_locked=True))).scalars().all()
    for p in pairs:
        if p.from_currency not in mids or p.to_currency not in mids:
            missing.append(f"{p.from_currency}{p.to_currency}")
            continue
        mid = mids[p.to_currency] / mids[p.from_currency]
        new = (mid * (1 - buffer)).quantize(RATE_DP)
        old = Decimal(p.exchange_rate or 0)
        if old and abs(new - old) / old > max_move:
            held.append({"pair": f"{p.from_currency}{p.to_currency}", "from": str(old), "to": str(new)})
            log.warning("fx_feed_circuit_breaker", pair=f"{p.from_currency}{p.to_currency}", old=str(old), new=str(new))
            continue
        p.exchange_rate = new
        p.updated_at = now  # freshness stamp even when the rate is unchanged
        updated += 1
    await db.flush()
    return {"updated": updated, "held": held, "missing": missing}


async def refresh(db: AsyncSession) -> dict:
    from app.core.redis import get_redis
    from app.services import fx_guard

    pol = await fx_guard.policy(db)
    if not pol.get("feed_enabled"):
        return {"enabled": False}
    status = {"at": datetime.now(UTC).isoformat(), "source": feed_url()}
    try:
        base, mids = await fetch_mids()
        result = await apply(db, mids, pol)
        # Reporting conversions (board dashboard) reuse the last good mids.
        await get_redis().set(MIDS_KEY, json.dumps({"base": base, "at": status["at"],
                                                   "mids": {k: str(v) for k, v in mids.items()}}), ex=7 * 24 * 3600)
        status |= {"ok": True, "base": base, **result}
    except Exception as e:  # noqa: BLE001 - feed down: keep old rates; they go stale and pause on their own
        status |= {"ok": False, "error": str(e)[:200]}
        log.warning("fx_feed_failed", error=str(e)[:200])
    await get_redis().set(STATUS_KEY, json.dumps(status), ex=24 * 3600)
    return status


async def last_status() -> dict | None:
    from app.core.redis import get_redis

    raw = await get_redis().get(STATUS_KEY)
    return json.loads(raw) if raw else None


async def cached_mids() -> dict | None:
    """Last good mids from the feed: {"base", "at", "mids": {ccy: Decimal}}. Fetches once if none cached."""
    from app.core.redis import get_redis

    raw = await get_redis().get(MIDS_KEY)
    if raw:
        d = json.loads(raw)
        return {**d, "mids": {k: Decimal(v) for k, v in d["mids"].items()}}
    try:
        base, mids = await fetch_mids()
    except Exception:  # noqa: BLE001 - no rates: callers report per currency
        return None
    at = datetime.now(UTC).isoformat()
    await get_redis().set(MIDS_KEY, json.dumps({"base": base, "at": at, "mids": {k: str(v) for k, v in mids.items()}}),
                          ex=24 * 3600)
    return {"base": base, "at": at, "mids": mids}
