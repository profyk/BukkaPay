"""Analytics for customers, merchants and admins. Aggregated in SQL (never by
pulling rows to the client), always per currency (currencies are never added
together), with the previous period for comparison and plain-language
insights."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, and_, cast, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TransactionType
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant, MerchantTransaction
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

ZERO = Decimal("0.00")
TZ = {**dict.fromkeys(["ZA", "BW", "ZW", "ZM", "NA", "LS", "SZ", "MW", "MZ", "RW", "BI", "CD"], "Africa/Johannesburg"),
      **dict.fromkeys(["KE", "UG", "TZ", "ET", "SO", "DJ", "ER", "KM", "MG"], "Africa/Nairobi"),
      **dict.fromkeys(["NG", "CM", "GA", "CG", "CF", "TD", "GQ", "AO", "NE", "BJ"], "Africa/Lagos"),
      **dict.fromkeys(["GH", "CI", "SN", "ML", "BF", "TG", "GM", "GN", "GW", "SL", "LR", "MR"], "Africa/Accra"),
      "EG": "Africa/Cairo", "MA": "Africa/Casablanca", "TN": "Africa/Tunis", "DZ": "Africa/Algiers"}


def _money(v) -> str:
    return f"{Decimal(v or 0):.2f}"


def _pct(now: Decimal, before: Decimal) -> float | None:
    if not before:
        return None
    return round(float((now - before) / before * 100), 1)


def _window(days: int, now: datetime | None = None) -> tuple[datetime, datetime, datetime]:
    now = now or datetime.now(UTC)
    start = now - timedelta(days=days)
    return now, start, start - timedelta(days=days)


def _fill_days(rows: dict, start: datetime, days: int, keys: tuple[str, ...]) -> list[dict]:
    out = []
    for i in range(days + 1):
        d = (start + timedelta(days=i)).date()
        vals = rows.get(d, {})
        out.append({"date": d.isoformat(), **{k: _money(vals.get(k)) for k in keys}})
    return out


# ─── customer ───────────────────────────────────────────────────────────────


async def customer(db: AsyncSession, user: User, *, days: int = 30, currency: str | None = None) -> dict:
    wallets = (await db.execute(select(WalletCard).where(WalletCard.user_id == user.id)
                                .order_by(WalletCard.created_at))).scalars().all()
    currencies = sorted({w.currency for w in wallets})
    if not currencies:
        return {"currencies": [], "currency": None}
    ccy = (currency or "").upper()
    if ccy not in currencies:
        main = next((w for w in wallets if w.is_default), wallets[0])
        ccy = main.currency
    now, start, prev = _window(days)
    base = (select(Transaction).join(WalletCard, WalletCard.id == Transaction.card_id)
            .where(Transaction.user_id == user.id, WalletCard.currency == ccy, Transaction.deleted_at.is_(None)))
    sub = base.subquery()
    t = sub.c

    async def totals(a, b):
        r = (await db.execute(select(
            func.coalesce(func.sum(t.amount).filter(t.type == TransactionType.CREDIT), 0),
            func.coalesce(func.sum(t.amount).filter(t.type == TransactionType.DEBIT), 0),
            func.count().filter(t.type == TransactionType.DEBIT),
            func.coalesce(func.sum(t.fee_amount), 0),
            func.coalesce(func.max(t.amount).filter(t.type == TransactionType.DEBIT), 0),
        ).where(t.created_at >= a, t.created_at < b))).one()
        return [Decimal(x) for x in r[:2]] + [int(r[2]), Decimal(r[3]), Decimal(r[4])]

    cin, cout, n_out, fees, biggest = await totals(start, now)
    pin, pout, _, _, _ = await totals(prev, start)

    day = cast(t.created_at, Date)
    daily = {d: {"in": i, "out": o} for d, i, o in (await db.execute(select(
        day, func.sum(t.amount).filter(t.type == TransactionType.CREDIT),
        func.sum(t.amount).filter(t.type == TransactionType.DEBIT)).where(t.created_at >= start)
        .group_by(day))).all()}

    async def by_category(a, b):
        return {c: Decimal(s) for c, s in (await db.execute(select(t.category, func.sum(t.amount)).where(
            t.type == TransactionType.DEBIT, t.created_at >= a, t.created_at < b).group_by(t.category))).all()}

    cats, prev_cats = await by_category(start, now), await by_category(prev, start)
    payees = (await db.execute(select(t.title, func.sum(t.amount), func.count()).where(
        t.type == TransactionType.DEBIT, t.created_at >= start).group_by(t.title)
        .order_by(func.sum(t.amount).desc()).limit(5))).all()
    weekday = (await db.execute(select(func.extract("isodow", t.created_at), func.sum(t.amount)).where(
        t.type == TransactionType.DEBIT, t.created_at >= start).group_by(func.extract("isodow", t.created_at)))).all()

    categories = sorted(({"category": c, "amount": _money(a), "share": round(float(a / cout * 100), 1) if cout else 0,
                          "previous": _money(prev_cats.get(c))} for c, a in cats.items()),
                        key=lambda x: Decimal(x["amount"]), reverse=True)
    insights = []
    if pout and cout:
        ch = _pct(cout, pout)
        insights.append({"tone": "good" if ch < 0 else "warn",
                         "text": f"You spent {abs(ch)}% {'less' if ch < 0 else 'more'} than the previous {days} days."})
    if categories:
        top = categories[0]
        insights.append({"tone": "info", "text": f"{top['category'].replace('_', ' ').capitalize()} is your biggest "
                                                 f"spend: {top['share']}% of what you spent."})
        rises = [(c, Decimal(x["amount"]) - Decimal(x["previous"])) for x in categories for c in [x["category"]]
                 if Decimal(x["previous"]) > 0]
        if rises:
            c, d = max(rises, key=lambda r: r[1])
            if d > 0:
                insights.append({"tone": "warn", "text": f"{c.replace('_', ' ').capitalize()} is up {ccy} {d:.2f} "
                                                         "on the previous period."})
    if cin:
        rate = (cin - cout) / cin * 100
        insights.append({"tone": "good" if rate > 0 else "warn",
                         "text": f"You kept {rate:.0f}% of the money that came in." if rate > 0
                         else "You spent more than came in this period."})
    if fees:
        insights.append({"tone": "info", "text": f"You paid {ccy} {fees:.2f} in fees. Transfers to other BukkaPay "
                                                 "users are free."})
    return {
        "currencies": currencies, "currency": ccy, "days": days,
        "totals": {"in": _money(cin), "out": _money(cout), "net": _money(cin - cout), "fees": _money(fees),
                   "transactions": n_out, "averageDailySpend": _money(cout / days if days else 0),
                   "biggestExpense": _money(biggest),
                   "inChange": _pct(cin, pin), "outChange": _pct(cout, pout)},
        "daily": _fill_days(daily, start, days, ("in", "out")),
        "categories": categories,
        "payees": [{"name": n, "amount": _money(a), "count": c} for n, a, c in payees],
        "weekday": [{"day": int(d), "amount": _money(a)} for d, a in sorted(weekday)],
        "insights": insights[:5],
    }


# ─── merchant ───────────────────────────────────────────────────────────────


async def merchant(db: AsyncSession, m: Merchant, *, days: int = 30) -> dict:
    from app.models.enums import MerchantTransactionStatus, MerchantTransactionType

    now, start, prev = _window(days)
    tz = TZ.get((m.country_code or "").upper(), "UTC")
    mt = MerchantTransaction
    paid = and_(mt.merchant_id == m.id, mt.type == MerchantTransactionType.PAYMENT,
                mt.status == MerchantTransactionStatus.COMPLETED)

    async def totals(a, b):
        r = (await db.execute(select(func.coalesce(func.sum(mt.amount), 0), func.count(),
                                     func.count(distinct(mt.payer_id))).where(paid, mt.created_at >= a,
                                                                               mt.created_at < b))).one()
        refunds = (await db.execute(select(func.coalesce(func.sum(mt.amount), 0)).where(
            mt.merchant_id == m.id, mt.type == MerchantTransactionType.REFUND, mt.created_at >= a,
            mt.created_at < b))).scalar_one()
        return Decimal(r[0]), int(r[1]), int(r[2]), Decimal(refunds)

    sales, count, customers, refunds = await totals(start, now)
    psales, pcount, pcustomers, _ = await totals(prev, start)
    local = func.timezone(tz, mt.created_at)
    day = cast(local, Date)
    daily = {d: {"sales": s, "count": c} for d, s, c in (await db.execute(
        select(day, func.sum(mt.amount), func.count()).where(paid, mt.created_at >= start).group_by(day))).all()}
    hours = {int(h): (Decimal(s), int(c)) for h, s, c in (await db.execute(
        select(func.extract("hour", local), func.sum(mt.amount), func.count()).where(paid, mt.created_at >= start)
        .group_by(func.extract("hour", local)))).all()}
    weekdays = {int(d): (Decimal(s), int(c)) for d, s, c in (await db.execute(
        select(func.extract("isodow", local), func.sum(mt.amount), func.count()).where(paid, mt.created_at >= start)
        .group_by(func.extract("isodow", local)))).all()}
    per_payer = (select(mt.payer_id, func.count().label("n")).where(paid, mt.created_at >= start,
                                                                     mt.payer_id.is_not(None))
                 .group_by(mt.payer_id).subquery())
    repeat = (await db.execute(select(func.count()).select_from(per_payer).where(per_payer.c.n >= 2))).scalar_one()
    top = (await db.execute(select(func.coalesce(mt.payer_name, "Walk-in customer"), func.sum(mt.amount), func.count())
                            .where(paid, mt.created_at >= start).group_by(mt.payer_name)
                            .order_by(func.sum(mt.amount).desc()).limit(5))).all()

    daily_rows = []
    for i in range(days + 1):
        d = (start + timedelta(days=i)).date()
        v = daily.get(d, {})
        daily_rows.append({"date": d.isoformat(), "sales": _money(v.get("sales")), "count": int(v.get("count") or 0)})
    busiest = max(hours.items(), key=lambda kv: kv[1][1])[0] if hours else None
    insights = []
    if psales:
        ch = _pct(sales, psales)
        insights.append({"tone": "good" if ch >= 0 else "warn",
                         "text": f"Sales are {'up' if ch >= 0 else 'down'} {abs(ch)}% on the previous {days} days."})
    if busiest is not None:
        insights.append({"tone": "info", "text": f"Your busiest hour is {busiest:02d}:00–{(busiest + 1) % 24:02d}:00. "
                                                 "Have change and staff ready then."})
    if customers:
        insights.append({"tone": "info", "text": f"{repeat} of {customers} paying customers came back more than once "
                                                 f"({round(repeat / customers * 100)}%)."})
    if refunds and sales:
        insights.append({"tone": "warn" if refunds / sales > Decimal("0.05") else "info",
                         "text": f"Refunds were {refunds / sales * 100:.1f}% of sales."})
    return {
        "currency": m.settlement_currency, "days": days, "timezone": tz,
        "totals": {"sales": _money(sales), "count": count, "averageTicket": _money(sales / count if count else 0),
                   "customers": customers, "repeatCustomers": repeat, "refunds": _money(refunds),
                   "net": _money(sales - refunds), "salesChange": _pct(sales, psales),
                   "countChange": _pct(Decimal(count), Decimal(pcount)),
                   "customersChange": _pct(Decimal(customers), Decimal(pcustomers))},
        "daily": daily_rows,
        "hours": [{"hour": h, "sales": _money(hours.get(h, (0, 0))[0]), "count": hours.get(h, (0, 0))[1]} for h in range(24)],
        "weekdays": [{"day": d, "sales": _money(weekdays.get(d, (0, 0))[0]), "count": weekdays.get(d, (0, 0))[1]}
                     for d in range(1, 8)],
        "topCustomers": [{"name": n, "amount": _money(a), "count": c} for n, a, c in top],
        "insights": insights,
    }


# ─── admin ──────────────────────────────────────────────────────────────────


async def platform(db: AsyncSession, *, days: int = 30) -> dict:
    from app.models.revenue import AgentTransaction

    now, start, prev = _window(days)
    users_total = (await db.execute(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))).scalar_one()

    async def signups(a, b):
        return (await db.execute(select(func.count()).select_from(User).where(User.created_at >= a,
                                                                              User.created_at < b))).scalar_one()

    async def active(a, b):
        return (await db.execute(select(func.count(distinct(Transaction.user_id))).where(
            Transaction.created_at >= a, Transaction.created_at < b))).scalar_one()

    new_now, new_prev = await signups(start, now), await signups(prev, start)
    act_now, act_prev = await active(start, now), await active(prev, start)
    uday = cast(User.created_at, Date)
    signup_daily = {d: n for d, n in (await db.execute(select(uday, func.count()).where(User.created_at >= start)
                                                       .group_by(uday))).all()}
    tday = cast(Transaction.created_at, Date)
    dau = {d: n for d, n in (await db.execute(select(tday, func.count(distinct(Transaction.user_id)))
                                              .where(Transaction.created_at >= start).group_by(tday))).all()}
    growth = []
    for i in range(days + 1):
        d = (start + timedelta(days=i)).date()
        growth.append({"date": d.isoformat(), "signups": signup_daily.get(d, 0), "activeUsers": dau.get(d, 0)})

    vol_rows = (await db.execute(select(tday, WalletCard.currency, func.sum(Transaction.amount), func.count())
                                 .join(WalletCard, WalletCard.id == Transaction.card_id)
                                 .where(Transaction.created_at >= start, Transaction.type == TransactionType.DEBIT)
                                 .group_by(tday, WalletCard.currency))).all()
    volume_by_ccy: dict[str, dict] = {}
    for d, ccy, amt, n in vol_rows:
        v = volume_by_ccy.setdefault(ccy, {"total": ZERO, "count": 0, "days": {}})
        v["total"] += Decimal(amt)
        v["count"] += int(n)
        v["days"][d] = Decimal(amt)
    volume = [{"currency": c, "total": _money(v["total"]), "count": v["count"],
               "daily": [{"date": (start + timedelta(days=i)).date().isoformat(),
                          "amount": _money(v["days"].get((start + timedelta(days=i)).date()))} for i in range(days + 1)]}
              for c, v in sorted(volume_by_ccy.items(), key=lambda kv: kv[1]["total"], reverse=True)]

    countries = (await db.execute(select(User.residence_country, func.count()).where(User.deleted_at.is_(None))
                                  .group_by(User.residence_country).order_by(func.count().desc()).limit(10))).all()
    kyc = (await db.execute(select(User.kyc_level, func.count()).where(User.deleted_at.is_(None))
                            .group_by(User.kyc_level).order_by(User.kyc_level))).all()
    accounts = (await db.execute(select(User.account_type, func.count()).where(User.deleted_at.is_(None))
                                 .group_by(User.account_type))).all()
    merchants_total = (await db.execute(select(func.count()).select_from(Merchant))).scalar_one()
    merchants_active = (await db.execute(select(func.count(distinct(MerchantTransaction.merchant_id))).where(
        MerchantTransaction.created_at >= start))).scalar_one()
    categories = (await db.execute(select(Transaction.category, func.count()).where(
        Transaction.created_at >= start, Transaction.type == TransactionType.DEBIT)
        .group_by(Transaction.category).order_by(func.count().desc()).limit(8))).all()
    rday = cast(JournalEntry.posted_at, Date)
    revenue_rows = (await db.execute(select(rday, LedgerAccount.currency, func.sum(JournalLine.credit - JournalLine.debit))
                                     .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
                                     .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
                                     .where(LedgerAccount.type.in_(("revenue", "expense")), JournalEntry.posted_at >= start)
                                     .group_by(rday, LedgerAccount.currency))).all()
    revenue: dict[str, dict] = {}
    for d, ccy, amt in revenue_rows:
        r = revenue.setdefault(ccy, {"total": ZERO, "days": {}})
        r["total"] += Decimal(amt or 0)
        r["days"][d] = r["days"].get(d, ZERO) + Decimal(amt or 0)
    agents = (await db.execute(select(AgentTransaction.kind, AgentTransaction.currency, func.sum(AgentTransaction.amount),
                                      func.count()).where(AgentTransaction.status == "completed",
                                                          AgentTransaction.completed_at >= start)
                               .group_by(AgentTransaction.kind, AgentTransaction.currency))).all()
    return {
        "days": days,
        "kpis": {"users": users_total, "newUsers": new_now, "newUsersChange": _pct(Decimal(new_now), Decimal(new_prev)),
                 "activeUsers": act_now, "activeUsersChange": _pct(Decimal(act_now), Decimal(act_prev)),
                 "activationRate": round(act_now / users_total * 100, 1) if users_total else 0,
                 "merchants": merchants_total, "activeMerchants": merchants_active},
        "growth": growth,
        "volume": volume,
        "revenue": [{"currency": c, "total": _money(r["total"]),
                     "daily": [{"date": (start + timedelta(days=i)).date().isoformat(),
                                "amount": _money(r["days"].get((start + timedelta(days=i)).date()))}
                               for i in range(days + 1)]}
                    for c, r in sorted(revenue.items(), key=lambda kv: kv[1]["total"], reverse=True)],
        "countries": [{"country": c or "—", "users": n} for c, n in countries],
        "kyc": [{"level": lvl or 0, "users": n} for lvl, n in kyc],
        "accountTypes": [{"type": str(t or "personal"), "users": n} for t, n in accounts],
        "categories": [{"category": c, "count": n} for c, n in categories],
        "agents": [{"kind": k, "currency": c, "amount": _money(a), "count": n} for k, c, a, n in agents],
    }
