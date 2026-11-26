"""Board portal: invitations, two-step sign-in and the investor metrics.

Metrics are company aggregates only. Amounts are computed per currency from
the ledger and, where a live mid-rate exists, converted into one reporting
currency (stated with the rate time); anything without a rate is listed
separately rather than guessed."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.models.board import BoardFinancial, BoardMember, BoardSession, BoardUpdate
from app.models.enums import TransactionType
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant, MerchantTransaction
from app.models.platform import Country
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

INVITE_TTL = timedelta(days=7)
SESSION_TTL = timedelta(hours=12)
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
LOCK_FOR = timedelta(minutes=15)
ZERO = Decimal("0")
COSTS = ("staff_costs", "technology_costs", "marketing_costs", "compliance_legal_costs", "office_admin_costs",
         "other_costs")


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


# ─── invitations & sign-in ──────────────────────────────────────────────────

def invite_link(token: str) -> str:
    from app.core.config import get_settings

    return f"{get_settings().board_web_url.rstrip('/')}/accept?token={token}"


def member_status(m: BoardMember) -> str:
    if not m.active:
        return "revoked"
    if m.accepted_at:
        return "active"
    if m.invite_expires_at and m.invite_expires_at < _now():
        return "expired"
    return "invited"


async def invite(db: AsyncSession, *, email: str, name: str, organisation: str | None, title: str | None,
                 by) -> tuple[BoardMember, str, bool]:
    email = email.strip().lower()
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email))).scalar_one_or_none()
    if m and m.accepted_at and m.active:
        raise ApiError("This person already has board access", status_code=409)
    token = secrets.token_urlsafe(32)
    if m is None:
        m = BoardMember(email=email, name=name)
        db.add(m)
    m.name, m.organisation, m.title, m.active = name, organisation, title, True
    m.invite_token_hash, m.invite_expires_at, m.invited_by = _h(token), _now() + INVITE_TTL, by.id if by else None
    await db.flush()
    link = invite_link(token)
    sent = await _email(m.email, "You're invited to the BukkaPay board portal",
                        [f"Hello {m.name},",
                         "You've been invited to the BukkaPay board portal, where BukkaPay's owner shares the "
                         "company's numbers with its board and investors: growth, revenue, profit and loss, cash "
                         "and runway, and investor updates.",
                         "You'll choose a password. Each time you sign in we also email you a code."],
                        button=("Accept and set your password", link),
                        note="This link works once and expires in 7 days. If you weren't expecting it, ignore this email.")
    return m, link, sent


async def accept(db: AsyncSession, token: str, password: str) -> BoardMember:
    m = (await db.execute(select(BoardMember).where(BoardMember.invite_token_hash == _h(token)))).scalar_one_or_none()
    if m is None or not m.active or not m.invite_expires_at or m.invite_expires_at < _now():
        raise ApiError("This invitation link is invalid or has expired. Ask BukkaPay for a new one.", status_code=400)
    if len(password) < 12:
        raise ApiError("Use at least 12 characters for your password")
    m.password_hash = hash_secret(password)
    m.invite_token_hash, m.invite_expires_at, m.accepted_at = None, None, _now()
    m.failed_attempts, m.locked_until = 0, None
    await db.flush()
    return m


def _check_lock(m: BoardMember) -> None:
    if m.locked_until and m.locked_until > _now():
        raise ApiError("Too many attempts. Try again in 15 minutes.", status_code=429)


async def _fail(db: AsyncSession, m: BoardMember) -> None:
    m.failed_attempts = (m.failed_attempts or 0) + 1
    if m.failed_attempts >= MAX_ATTEMPTS:
        m.locked_until, m.failed_attempts = _now() + LOCK_FOR, 0
    await db.commit()


async def start_login(db: AsyncSession, email: str, password: str) -> None:
    """Step 1: password. Sends the emailed code. Same error for every failure."""
    bad = ApiError("Email or password is incorrect", status_code=401)
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email.strip().lower()))).scalar_one_or_none()
    if m is None or not m.active or not m.password_hash:
        raise bad
    _check_lock(m)
    ok, _ = verify_secret(password, m.password_hash)
    if not ok:
        await _fail(db, m)
        raise bad
    code = f"{secrets.randbelow(1_000_000):06d}"
    m.login_code_hash, m.login_code_expires_at = _h(f"{m.id}:{code}"), _now() + CODE_TTL
    await db.flush()
    await _email(m.email, f"Your BukkaPay board sign-in code: {code}",
                 [f"Hello {m.name},", "Use this code to finish signing in to the BukkaPay board portal."],
                 code=code, note="The code expires in 10 minutes. If this wasn't you, change your password.")


async def finish_login(db: AsyncSession, email: str, code: str, ip: str | None) -> tuple[str, BoardMember]:
    bad = ApiError("That code is wrong or has expired", status_code=401)
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email.strip().lower()))).scalar_one_or_none()
    if m is None or not m.active or not m.login_code_hash:
        raise bad
    _check_lock(m)
    if (m.login_code_expires_at or _now()) < _now() or not secrets.compare_digest(m.login_code_hash,
                                                                                  _h(f"{m.id}:{code.strip()}")):
        await _fail(db, m)
        raise bad
    m.login_code_hash = m.login_code_expires_at = None
    m.failed_attempts, m.last_login_at = 0, _now()
    token = secrets.token_urlsafe(32)
    db.add(BoardSession(member_id=m.id, token_hash=_h(token), expires_at=_now() + SESSION_TTL, ip=ip))
    await db.flush()
    return token, m


async def member_for_token(db: AsyncSession, token: str) -> BoardMember | None:
    row = (await db.execute(select(BoardSession, BoardMember).join(BoardMember, BoardMember.id == BoardSession.member_id)
                            .where(BoardSession.token_hash == _h(token), BoardSession.revoked_at.is_(None),
                                   BoardSession.expires_at > _now()))).first()
    if row is None or not row[1].active:
        return None
    return row[1]


async def end_sessions(db: AsyncSession, member_id, token: str | None = None) -> None:
    q = select(BoardSession).where(BoardSession.member_id == member_id, BoardSession.revoked_at.is_(None))
    if token:
        q = q.where(BoardSession.token_hash == _h(token))
    for s in (await db.execute(q)).scalars():
        s.revoked_at = _now()


async def _email(to: str, subject: str, paras: list[str], *, button: tuple[str, str] | None = None,
                 code: str | None = None, note: str | None = None) -> bool:
    from app.core.config import get_settings
    from app.integrations import email_brand as eb
    from app.integrations.resend_client import send_resend_email

    if not get_settings().resend_api_key:
        return False
    html = eb.heading(subject.split(":")[0]) + "".join(eb.paragraph(eb.esc(p)) for p in paras)
    if code:
        html += eb.code_box(code)
    if button:
        html += eb.button(*button)
    if note:
        html += eb.note(eb.esc(note))
    text = "\n\n".join(paras + ([code] if code else []) + ([f"{button[0]}: {button[1]}"] if button else []) + ([note] if note else []))
    try:
        await send_resend_email(to=to, subject=subject, html=eb.layout(html, preheader=subject), text=text)
    except Exception:  # noqa: BLE001 - the owner can share the link another way
        return False
    return True


# ─── metrics ────────────────────────────────────────────────────────────────

def _month(d: date | datetime) -> date:
    return date(d.year, d.month, 1)


def _months_back(n: int, today: date | None = None) -> list[date]:
    t = _month(today or _now().date())
    out = []
    for _ in range(n):
        out.append(t)
        t = _month(t - timedelta(days=1))
    return list(reversed(out))


class Converter:
    """Per-currency amounts → reporting currency using cached feed mids."""

    def __init__(self, reporting: str, fx: dict | None):
        self.reporting = reporting
        self.mids = (fx or {}).get("mids") or {}
        self.at = (fx or {}).get("at")
        self.missing: set[str] = set()

    def __call__(self, amount: Decimal, ccy: str) -> Decimal | None:
        if ccy == self.reporting:
            return Decimal(amount)
        if ccy not in self.mids or self.reporting not in self.mids:
            self.missing.add(ccy)
            return None
        return Decimal(amount) / self.mids[ccy] * self.mids[self.reporting]

    def total(self, by_ccy: dict[str, Decimal]) -> Decimal:
        s = ZERO
        for c, a in by_ccy.items():
            v = self(a, c)
            if v is not None:
                s += v
        return s


def _f(v: Decimal | None) -> float | None:
    return None if v is None else float(round(Decimal(v), 2))


def _pct(now, before) -> float | None:
    if not before:
        return None
    return round(float((Decimal(now) - Decimal(before)) / Decimal(before) * 100), 1)


async def reporting_currency(db: AsyncSession) -> str:
    latest = (await db.execute(select(BoardFinancial.currency).order_by(BoardFinancial.month.desc()).limit(1))).scalar()
    return latest or "USD"


async def overview(db: AsyncSession, *, months: int = 12) -> dict:
    from app.services.fx_feed import cached_mids

    reporting = await reporting_currency(db)
    conv = Converter(reporting, await cached_mids())
    month_list = _months_back(months)
    start = datetime(month_list[0].year, month_list[0].month, 1, tzinfo=UTC)
    now = _now()

    def mcol(col):
        return cast(func.date_trunc(literal_column("'month'"), col), Date)

    # Users
    users_total = (await db.execute(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))).scalar_one()
    before = (await db.execute(select(func.count()).select_from(User).where(User.created_at < start))).scalar_one()
    signups = dict((await db.execute(select(mcol(User.created_at), func.count()).where(User.created_at >= start)
                                     .group_by(mcol(User.created_at)))).all())
    mau = dict((await db.execute(select(mcol(Transaction.created_at), func.count(distinct(Transaction.user_id)))
                                 .where(Transaction.created_at >= start).group_by(mcol(Transaction.created_at)))).all())
    tpv_rows = (await db.execute(select(mcol(Transaction.created_at), WalletCard.currency, func.sum(Transaction.amount),
                                        func.count())
                                 .join(WalletCard, WalletCard.id == Transaction.card_id)
                                 .where(Transaction.created_at >= start, Transaction.type == TransactionType.DEBIT)
                                 .group_by(mcol(Transaction.created_at), WalletCard.currency))).all()
    led = (await db.execute(select(mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.currency,
                                   func.sum(JournalLine.credit - JournalLine.debit))
                            .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
                            .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
                            .where(LedgerAccount.type.in_(("revenue", "expense")), JournalEntry.posted_at >= start)
                            .group_by(mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.currency))).all()
    new_merchants = dict((await db.execute(select(mcol(Merchant.created_at), func.count()).where(Merchant.created_at >= start)
                                           .group_by(mcol(Merchant.created_at)))).all())
    act_merchants = dict((await db.execute(select(mcol(MerchantTransaction.created_at),
                                                  func.count(distinct(MerchantTransaction.merchant_id)))
                                           .where(MerchantTransaction.created_at >= start)
                                           .group_by(mcol(MerchantTransaction.created_at)))).all())
    fin = {f.month: f for f in (await db.execute(select(BoardFinancial).where(BoardFinancial.month >= month_list[0])))
           .scalars()}

    tpv: dict[date, dict[str, Decimal]] = {}
    txn_count: dict[date, int] = {}
    for m, c, a, n in tpv_rows:
        tpv.setdefault(m, {})[c] = Decimal(a or 0)
        txn_count[m] = txn_count.get(m, 0) + int(n)
    rev: dict[date, dict[str, Decimal]] = {}
    cost: dict[date, dict[str, Decimal]] = {}
    for m, typ, c, a in led:
        tgt = rev if str(typ) == "revenue" else cost
        sign = 1 if str(typ) == "revenue" else -1  # expenses are debit-normal
        tgt.setdefault(m, {})[c] = tgt.get(m, {}).get(c, ZERO) + sign * Decimal(a or 0)

    series, cumulative = [], before
    for m in month_list:
        cumulative += signups.get(m, 0)
        revenue = conv.total(rev.get(m, {}))
        direct = conv.total(cost.get(m, {}))
        f = fin.get(m)
        opex = None
        other_income = ZERO
        if f is not None:
            opex = sum((conv(getattr(f, k) or ZERO, f.currency) or ZERO) for k in COSTS)
            other_income = conv(f.other_income or ZERO, f.currency) or ZERO
        gross = revenue - direct
        net = None if opex is None else gross + other_income - opex
        series.append({
            "month": m.isoformat(), "signups": signups.get(m, 0), "users": cumulative, "mau": mau.get(m, 0),
            "transactions": txn_count.get(m, 0), "tpv": _f(conv.total(tpv.get(m, {}))),
            "revenue": _f(revenue), "directCosts": _f(direct), "grossProfit": _f(gross),
            "operatingCosts": _f(opex), "otherIncome": _f(other_income) if f else None, "netProfit": _f(net),
            "cash": _f(conv(f.cash_balance, f.currency)) if f and f.cash_balance is not None else None,
            "fundingRaised": _f(conv(f.funding_raised or ZERO, f.currency)) if f else None,
            "headcount": f.headcount if f else None,
            "costBreakdown": {k: _f(conv(getattr(f, k) or ZERO, f.currency)) for k in COSTS} if f else None,
            "newMerchants": new_merchants.get(m, 0), "activeMerchants": act_merchants.get(m, 0),
        })

    cur, prev = series[-1], series[-2] if len(series) > 1 else None
    # Trailing 30 days
    d30 = now - timedelta(days=30)
    act30 = (await db.execute(select(func.count(distinct(Transaction.user_id))).where(Transaction.created_at >= d30))).scalar_one()
    tpv30 = conv.total({c: Decimal(a or 0) for c, a in (await db.execute(
        select(WalletCard.currency, func.sum(Transaction.amount)).join(WalletCard, WalletCard.id == Transaction.card_id)
        .where(Transaction.created_at >= d30, Transaction.type == TransactionType.DEBIT).group_by(WalletCard.currency))).all()})
    n30 = (await db.execute(select(func.count()).select_from(Transaction).where(
        Transaction.created_at >= d30, Transaction.type == TransactionType.DEBIT))).scalar_one()
    rev30 = conv.total({c: Decimal(a or 0) for c, a in (await db.execute(
        select(LedgerAccount.currency, func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.account_id == LedgerAccount.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(LedgerAccount.type == "revenue", JournalEntry.posted_at >= d30).group_by(LedgerAccount.currency))).all()})
    funds = {c: Decimal(a or 0) for c, a in (await db.execute(select(WalletCard.currency, func.sum(WalletCard.balance))
                                                            .group_by(WalletCard.currency))).all()}

    # Burn & runway from the last three months with management accounts
    nets = [Decimal(str(s["netProfit"])) for s in series[-3:] if s["netProfit"] is not None]
    burn = -sum(nets) / len(nets) if nets and sum(nets) < 0 else ZERO
    cash = next((Decimal(str(s["cash"])) for s in reversed(series) if s["cash"] is not None), None)
    runway = round(float(cash / burn), 1) if cash is not None and burn > 0 else None

    # Revenue by stream (12 months), per product, converted
    from app.pricing import service as pricing

    streams = []
    for s in await pricing.revenue_report(db, since=start):
        amt = conv(Decimal(str(s.get("revenue") or s.get("amount") or 0)), s.get("currency") or reporting)
        streams.append({"stream": s.get("product") or s.get("stream") or s.get("name"), "currency": s.get("currency"),
                        "amount": _f(amt) if amt is not None else None})
    merged: dict[str, float] = {}
    for s in streams:
        if s["amount"] is not None:
            merged[str(s["stream"])] = merged.get(str(s["stream"]), 0) + s["amount"]

    countries = (await db.execute(select(Country.status, func.count()).where(Country.region == "Africa")
                                  .group_by(Country.status))).all()
    by_country = (await db.execute(select(User.residence_country, func.count()).where(User.deleted_at.is_(None))
                                   .group_by(User.residence_country).order_by(func.count().desc()).limit(12))).all()
    ytd = [s for s in series if s["month"][:4] == str(now.year)]

    return {
        "reportingCurrency": reporting, "fxAt": conv.at, "unconverted": sorted(conv.missing),
        "generatedAt": now.isoformat(),
        "kpis": {
            "users": users_total, "mau": act30, "mauChange": _pct(cur["mau"], prev["mau"]) if prev else None,
            "activation": round(act30 / users_total * 100, 1) if users_total else 0,
            "newUsersThisMonth": cur["signups"], "signupGrowth": _pct(cur["signups"], prev["signups"]) if prev else None,
            "tpv30": _f(tpv30), "revenue30": _f(rev30), "transactions30": n30,
            "takeRate": round(float(rev30 / tpv30 * 100), 2) if tpv30 else None,
            "arpu": _f(rev30 / act30) if act30 else None, "avgTicket": _f(tpv30 / n30) if n30 else None,
            "revenueGrowth": _pct(cur["revenue"] or 0, prev["revenue"] or 0) if prev else None,
            "merchants": (await db.execute(select(func.count()).select_from(Merchant))).scalar_one(),
            "activeMerchants": cur["activeMerchants"],
            "customerFunds": _f(conv.total(funds)),
            "monthlyBurn": _f(burn), "cash": _f(cash), "runwayMonths": runway,
            "revenueYtd": _f(sum(Decimal(str(s["revenue"] or 0)) for s in ytd)),
            "netYtd": _f(sum(Decimal(str(s["netProfit"])) for s in ytd if s["netProfit"] is not None))
            if any(s["netProfit"] is not None for s in ytd) else None,
            "countriesLive": sum(n for st, n in countries if st == "live"),
            "countriesPilot": sum(n for st, n in countries if st == "pilot"),
        },
        "series": series,
        "revenueStreams": sorted(({"stream": k, "amount": round(v, 2)} for k, v in merged.items()),
                                 key=lambda r: r["amount"], reverse=True),
        "markets": [{"country": c or "Unknown", "users": n} for c, n in by_country],
        "cohorts": await cohorts(db),
    }


async def cohorts(db: AsyncSession, n: int = 6) -> list[dict]:
    """Share of each signup-month cohort that transacted in each later month."""
    months = _months_back(n)
    start = datetime(months[0].year, months[0].month, 1, tzinfo=UTC)
    cm = cast(func.date_trunc(literal_column("'month'"), User.created_at), Date)
    sizes = dict((await db.execute(select(cm, func.count()).where(User.created_at >= start).group_by(cm))).all())
    am = cast(func.date_trunc(literal_column("'month'"), Transaction.created_at), Date)
    rows = (await db.execute(select(cm, am, func.count(distinct(Transaction.user_id)))
                             .join(User, User.id == Transaction.user_id)
                             .where(User.created_at >= start, Transaction.created_at >= start)
                             .group_by(cm, am))).all()
    act: dict[tuple, int] = {(c, a): k for c, a, k in rows}
    out = []
    for i, c in enumerate(months):
        size = sizes.get(c, 0)
        cells = []
        for a in months[i:]:
            k = act.get((c, a), 0)
            cells.append(round(k / size * 100, 1) if size else None)
        out.append({"cohort": c.isoformat(), "size": size, "retention": cells})
    return out


async def updates(db: AsyncSession, *, published_only: bool = True) -> list[dict]:
    q = select(BoardUpdate).order_by(BoardUpdate.created_at.desc())
    if published_only:
        q = q.where(BoardUpdate.published_at.is_not(None))
    return [{"id": str(u.id), "title": u.title, "period": u.period, "body": u.body,
             "publishedAt": u.published_at.isoformat() if u.published_at else None,
             "createdAt": u.created_at.isoformat() if u.created_at else None}
            for u in (await db.execute(q)).scalars()]
