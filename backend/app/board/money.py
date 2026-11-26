"""Decimal-safe money for Boardroom reporting.

Rules:
  * amounts are Decimal end to end and leave the API as strings, rounded to
    the currency's own decimal places;
  * amounts in different currencies are never added together unless they
    are first converted with a stated rate: each conversion records the
    original amount and currency, the rate, its source and date, and the
    converted amount;
  * a historical period is converted at the rate on (or last before) the end
    of that period, from the daily snapshots in board_fx_rates. Today's rate
    is never used for a past period. A currency with no rate for a period is
    reported as unconverted, not guessed.
"""

from __future__ import annotations

import calendar
from bisect import bisect_right
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import EXPONENT
from app.models.boardroom import BoardFxRate

ZERO = Decimal("0")


def dp(ccy: str | None) -> int:
    return EXPONENT.get((ccy or "").upper(), 2)


def q(amount: Decimal | int | str | None, ccy: str | None) -> Decimal | None:
    if amount is None:
        return None
    return Decimal(amount).quantize(Decimal(1).scaleb(-dp(ccy)), rounding=ROUND_HALF_UP)


def s(amount: Decimal | int | str | None, ccy: str | None) -> str | None:
    """Money out of the API: a string at the currency's precision."""
    v = q(amount, ccy)
    return None if v is None else format(v, "f")


def month_end(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


async def snapshot_today(db: AsyncSession) -> None:
    """Keep one row per currency per day from the FX feed's last good mids,
    so later reports can convert each period at its own rate."""
    from app.services.fx_feed import cached_mids, feed_url

    fx = await cached_mids()
    if not fx or not fx.get("mids"):
        return
    at = fx.get("at")
    try:
        captured = datetime.fromisoformat(at) if at else datetime.now(UTC)
    except ValueError:
        captured = datetime.now(UTC)
    day = captured.date()
    from app.models.reference import Currency

    wanted = set((await db.execute(select(Currency.code))).scalars().all()) | {"USD"}
    rows = [{"rate_date": day, "base": fx.get("base") or "USD", "currency": c, "mid": Decimal(v),
             "source": feed_url(), "captured_at": captured}
            for c, v in fx["mids"].items() if c in wanted and Decimal(v) > 0]
    if rows:
        await db.execute(insert(BoardFxRate).values(rows).on_conflict_do_nothing(
            index_elements=["rate_date", "currency"]))
        await db.flush()


class RateBook:
    """Historical mid rates by day. `mid` = units of currency per 1 base."""

    def __init__(self, reporting: str, rows: list[BoardFxRate]):
        self.reporting = reporting.upper()
        self.days: list[date] = []
        self.by_day: dict[date, dict[str, Decimal]] = {}
        self.sources: dict[date, str] = {}
        for r in rows:
            self.by_day.setdefault(r.rate_date, {})[r.currency] = Decimal(r.mid)
            self.sources[r.rate_date] = r.source
        self.days = sorted(self.by_day)
        self.used: dict[tuple[str, date], dict] = {}
        self.missing: set[tuple[str, str]] = set()

    @classmethod
    async def load(cls, db: AsyncSession, reporting: str) -> RateBook:
        rows = (await db.execute(select(BoardFxRate))).scalars().all()
        return cls(reporting, list(rows))

    def _day_for(self, ccy: str, on: date) -> date | None:
        i = bisect_right(self.days, on)
        while i > 0:
            d = self.days[i - 1]
            book = self.by_day[d]
            if ccy in book and self.reporting in book:
                return d
            i -= 1
        return None

    def rate(self, ccy: str, on: date) -> tuple[Decimal, date] | None:
        """Reporting-currency units per 1 `ccy`, as of `on`."""
        ccy = ccy.upper()
        if ccy == self.reporting:
            return Decimal(1), on
        d = self._day_for(ccy, on)
        if d is None:
            return None
        book = self.by_day[d]
        return book[self.reporting] / book[ccy], d

    def convert(self, amount: Decimal, ccy: str, on: date, *, period: str | None = None) -> Decimal | None:
        ccy = ccy.upper()
        if ccy == self.reporting:
            return Decimal(amount)
        r = self.rate(ccy, on)
        if r is None:
            self.missing.add((ccy, period or on.isoformat()))
            return None
        rate, d = r
        self.used[(ccy, d)] = {"currency": ccy, "rate": format(rate.quantize(Decimal("0.0000000001")), "f"),
                               "rateDate": d.isoformat(), "source": self.sources.get(d),
                               "reportingCurrency": self.reporting}
        return Decimal(amount) * rate

    def convert_line(self, amount: Decimal, ccy: str, on: date) -> dict:
        """A single conversion with its full audit trail."""
        conv = self.convert(amount, ccy, on)
        r = self.rate(ccy, on)
        return {"originalAmount": s(amount, ccy), "originalCurrency": ccy.upper(),
                "rate": format(r[0], "f") if r else None, "rateDate": r[1].isoformat() if r else None,
                "rateSource": self.sources.get(r[1]) if r and ccy.upper() != self.reporting else (
                    "same currency" if ccy.upper() == self.reporting else None),
                "reportingCurrency": self.reporting, "convertedAmount": s(conv, self.reporting)}

    def total(self, by_ccy: dict[str, Decimal], on: date, *, period: str | None = None) -> Decimal:
        t = ZERO
        for c, a in by_ccy.items():
            v = self.convert(a, c, on, period=period)
            if v is not None:
                t += v
        return t

    def methodology(self) -> dict:
        return {
            "method": "Each period is converted at the mid-market rate on, or last before, its final day "
                      "(daily snapshots of the FX feed). Current periods use the latest snapshot.",
            "reportingCurrency": self.reporting,
            "ratesUsed": sorted(self.used.values(), key=lambda r: (r["rateDate"], r["currency"])),
            "unconverted": [{"currency": c, "period": p} for c, p in sorted(self.missing)],
        }
