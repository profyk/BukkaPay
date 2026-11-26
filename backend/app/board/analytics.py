"""Boardroom analytics: company-level aggregates from the ledger and the
operational tables. Read-only. No function here returns a customer's name,
email, phone, wallet id, card number or any other personal record; the
smallest unit returned is a count or a sum over a group.

Financial rules (see app.board.money):
  * money is Decimal and leaves as strings at the currency's precision;
  * per-currency figures are never summed across currencies; a converted
    total is only given with its rates, dates and source;
  * transaction volume is never revenue: revenue = credits to ledger revenue
    accounts; customer wallet balances are liabilities, never income;
  * a P2P transfer moves money between two customer wallets: it is counted
    once (money leaving the sender's wallet), not twice.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Date, and_, case, cast, distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.board.money import ZERO, RateBook, s
from app.core.errors import ApiError
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant, MerchantTransaction
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

# ─── reporting periods ──────────────────────────────────────────────────────

PERIOD_KINDS = ("day", "week", "month", "quarter", "year", "custom")


@dataclass
class Period:
    kind: str
    start: date
    end: date  # inclusive

    @property
    def start_ts(self) -> datetime:
        return datetime.combine(self.start, time.min, tzinfo=UTC)

    @property
    def end_ts(self) -> datetime:  # exclusive
        return datetime.combine(self.end + timedelta(days=1), time.min, tzinfo=UTC)

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def previous(self) -> Period:
        if self.kind == "month":
            pe = self.start - timedelta(days=1)
            return Period("month", date(pe.year, pe.month, 1), pe)
        if self.kind == "quarter":
            pe = self.start - timedelta(days=1)
            return Period("quarter", date(pe.year, (pe.month - 1) // 3 * 3 + 1, 1), pe)
        if self.kind == "year":
            return Period("year", date(self.start.year - 1, 1, 1), date(self.start.year - 1, 12, 31))
        return Period(self.kind, self.start - timedelta(days=self.days), self.start - timedelta(days=1))

    def label(self) -> str:
        if self.kind == "month":
            return self.start.strftime("%B %Y")
        if self.kind == "quarter":
            return f"Q{(self.start.month - 1) // 3 + 1} {self.start.year}"
        if self.kind == "year":
            return str(self.start.year)
        return f"{self.start.isoformat()} to {self.end.isoformat()}"

    def as_dict(self) -> dict:
        return {"kind": self.kind, "start": self.start.isoformat(), "end": self.end.isoformat(), "label": self.label()}


def period_of(kind: str = "month", start: date | None = None, end: date | None = None,
              today: date | None = None) -> Period:
    today = today or datetime.now(UTC).date()
    if kind not in PERIOD_KINDS:
        raise ApiError("Unknown reporting period", status_code=422)
    if kind == "custom":
        if not start or not end or end < start:
            raise ApiError("Choose a start and end date for a custom period", status_code=422)
        if (end - start).days > 3 * 366:
            raise ApiError("Custom periods can be at most three years", status_code=422)
        return Period("custom", start, min(end, today))
    a = start or today
    if kind == "day":
        return Period("day", a, a)
    if kind == "week":
        st = a - timedelta(days=a.weekday())
        return Period("week", st, min(st + timedelta(days=6), today))
    if kind == "month":
        st = date(a.year, a.month, 1)
        nx = date(st.year + (st.month == 12), st.month % 12 + 1, 1)
        return Period("month", st, min(nx - timedelta(days=1), today))
    if kind == "quarter":
        st = date(a.year, (a.month - 1) // 3 * 3 + 1, 1)
        nm = st.month + 3
        nx = date(st.year + (nm > 12), (nm - 1) % 12 + 1, 1)
        return Period("quarter", st, min(nx - timedelta(days=1), today))
    st = date(a.year, 1, 1)
    return Period("year", st, min(date(a.year, 12, 31), today))


def _pct(now: Decimal | int | None, before: Decimal | int | None) -> str | None:
    if now is None or not before:
        return None
    return format(((Decimal(now) - Decimal(before)) / Decimal(before) * 100).quantize(Decimal("0.1")), "f")


def _ratio(a, b, places: str = "0.1") -> str | None:
    if not b:
        return None
    return format((Decimal(a) / Decimal(b) * 100).quantize(Decimal(places)), "f")


# ─── classification of ledger activity ─────────────────────────────────────

KIND_GROUPS: dict[str, tuple[str, ...]] = {
    "deposits": ("wallet_topup", "cash_in", "agent_cash_in", "claim_paid_wallet"),
    "withdrawals": ("withdrawal", "withdrawal_settled", "cash_out", "agent_cash_out", "payout_debit",
                    "payout_internal", "merchant_withdrawal", "contribution_payout"),
    "p2p_transfers": ("p2p_transfer",),
    "merchant_payments": ("merchant_payment", "trade_instant_payment"),
    "payment_links": ("payment_link_payment",),
    "currency_conversions": ("currency_swap",),
    "cross_border": ("cross_border", "cross_border_debit", "cross_border_settlement"),
    "card_payments": ("card_authorization", "card_capture", "card_clearing"),
    "refunds": ("refund", "merchant_refund", "card_refund", "travel_refund", "flight_refund",
                "card_authorization_reversal", "card_chargeback"),
    "reversals": ("reversal",),
    "own_wallet_moves": ("own_wallet_move",),
}
# Never part of business activity.
EXCLUDED_KINDS = ("opening_balance", "sandbox", "test_funding", "manual_adjustment", "treasury_rebalance")
GROUP_LABELS = {
    "deposits": "Deposits (top-ups, cash in)", "withdrawals": "Withdrawals and cash-outs",
    "p2p_transfers": "P2P transfers", "merchant_payments": "Merchant payments (QR, in-app, trade)",
    "payment_links": "Payment links", "currency_conversions": "Currency conversions",
    "cross_border": "Cross-border transfers", "card_payments": "Card payments",
    "refunds": "Refunds", "reversals": "Reversals", "own_wallet_moves": "Moves between own wallets",
    "other": "Other",
}


def group_of(kind: str) -> str:
    for g, kinds in KIND_GROUPS.items():
        if kind in kinds or any(kind.startswith(k) for k in kinds if k.endswith("_")):
            return g
    if kind.startswith("card_"):
        return "card_payments"
    return "other"


def _mcol(col):
    return cast(func.date_trunc(literal_column("'month'"), col), Date)


async def wallet_flows(db: AsyncSession, p: Period, *, country: str | None = None,
                       currency: str | None = None) -> dict[tuple[str, str], dict]:
    """Money into and out of customer wallets, by (group, currency).
    `out` = debits to customer wallets (money leaving), `in` = credits."""
    q = (select(JournalEntry.kind, LedgerAccount.currency, func.sum(JournalLine.debit), func.sum(JournalLine.credit),
                func.count(distinct(JournalEntry.id)))
         .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
         .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
         .where(LedgerAccount.category == "customer", JournalEntry.posted_at >= p.start_ts,
                JournalEntry.posted_at < p.end_ts, JournalEntry.kind.not_in(EXCLUDED_KINDS)))
    if currency:
        q = q.where(LedgerAccount.currency == currency.upper())
    if country:
        q = (q.join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id)
             .join(User, User.id == WalletCard.user_id).where(User.residence_country == country.upper()))
    out: dict[tuple[str, str], dict] = {}
    for kind, ccy, deb, cred, n in (await db.execute(q.group_by(JournalEntry.kind, LedgerAccount.currency))).all():
        k = (group_of(kind), ccy)
        row = out.setdefault(k, {"out": ZERO, "in": ZERO, "entries": 0})
        row["out"] += Decimal(deb or 0)
        row["in"] += Decimal(cred or 0)
        row["entries"] += int(n)
    return out


def _gross(group: str, row: dict) -> Decimal:
    """Volume counted once: inflows for deposits/refunds/reversals, outflows otherwise."""
    return row["in"] if group in ("deposits", "refunds", "reversals") else row["out"]


async def ledger_by_type(db: AsyncSession, p: Period, types: tuple[str, ...]) -> list[tuple]:
    """(month, type, code, currency, natural amount) for revenue/expense accounts."""
    rows = (await db.execute(
        select(_mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.code, LedgerAccount.currency,
               func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .where(LedgerAccount.type.in_(types), JournalEntry.posted_at >= p.start_ts, JournalEntry.posted_at < p.end_ts)
        .group_by(_mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.code, LedgerAccount.currency))).all()
    out = []
    for m, typ, code, ccy, amt in rows:
        a = Decimal(amt or 0)
        out.append((m, typ, code, ccy, a if typ == "revenue" else -a))  # expenses are debit-normal
    return out


async def supported_currencies(db: AsyncSession) -> list[dict]:
    """Currencies BukkaPay actually runs: wallet-enabled somewhere, or holding ledger money."""
    from app.models.platform import CountryCurrency
    from app.models.reference import Currency

    enabled = set((await db.execute(select(CountryCurrency.currency_code)
                                    .where(CountryCurrency.wallet_enabled.is_(True)))).scalars().all())
    in_use = set((await db.execute(select(LedgerAccount.currency).distinct()
                                   .where(LedgerAccount.category.in_(("customer", "merchant"))))).scalars().all())
    codes = enabled | in_use
    rows = (await db.execute(select(Currency).where(Currency.code.in_(codes)))).scalars().all() if codes else []
    return [{"code": c.code, "name": c.name, "symbol": c.symbol, "decimals": c.decimals,
             "walletEnabled": c.code in enabled, "hasActivity": c.code in in_use}
            for c in sorted(rows, key=lambda r: r.code)]


# ─── adoption ───────────────────────────────────────────────────────────────

async def adoption(db: AsyncSession, p: Period, *, country: str | None = None) -> dict:
    prev = p.previous()
    personal = and_(User.account_type == "personal", User.deleted_at.is_(None))
    if country:
        personal = and_(personal, User.residence_country == country.upper())

    async def count(*where) -> int:
        return (await db.execute(select(func.count()).select_from(User).where(personal, *where))).scalar_one()

    registered = await count(User.created_at < p.end_ts)
    new = await count(User.created_at >= p.start_ts, User.created_at < p.end_ts)
    new_prev = await count(User.created_at >= prev.start_ts, User.created_at < prev.end_ts)
    email_verified = await count(User.created_at < p.end_ts, User.verified.is_(True))
    kyc_verified = await count(User.created_at < p.end_ts, User.kyc_status == "approved")

    def active_q(start: datetime, end: datetime):
        q = (select(func.count(distinct(Transaction.user_id))).join(User, User.id == Transaction.user_id)
             .where(personal, Transaction.created_at >= start, Transaction.created_at < end))
        return q

    activated = (await db.execute(select(func.count(distinct(Transaction.user_id)))
                                  .join(User, User.id == Transaction.user_id)
                                  .where(personal, Transaction.created_at < p.end_ts))).scalar_one()
    active = (await db.execute(active_q(p.start_ts, p.end_ts))).scalar_one()
    active_prev = (await db.execute(active_q(prev.start_ts, prev.end_ts))).scalar_one()
    end = p.end_ts
    dau = (await db.execute(active_q(end - timedelta(days=1), end))).scalar_one()
    mau = (await db.execute(active_q(end - timedelta(days=30), end))).scalar_one()

    # Retention: of customers active in the previous period, how many were active again.
    prev_ids = (select(Transaction.user_id).distinct().join(User, User.id == Transaction.user_id)
                .where(personal, Transaction.created_at >= prev.start_ts, Transaction.created_at < prev.end_ts))
    retained = (await db.execute(select(func.count(distinct(Transaction.user_id)))
                                 .where(Transaction.user_id.in_(prev_ids), Transaction.created_at >= p.start_ts,
                                        Transaction.created_at < p.end_ts))).scalar_one()

    by_country_rows = (await db.execute(
        select(User.residence_country, func.count(),
               func.count().filter(and_(User.created_at >= p.start_ts, User.created_at < p.end_ts)))
        .where(personal, User.created_at < p.end_ts).group_by(User.residence_country))).all()
    active_by_country = dict((await db.execute(
        select(User.residence_country, func.count(distinct(Transaction.user_id))).join(User, User.id == Transaction.user_id)
        .where(personal, Transaction.created_at >= p.start_ts, Transaction.created_at < p.end_ts)
        .group_by(User.residence_country))).all())
    wallets = (await db.execute(
        select(WalletCard.currency, func.count(distinct(WalletCard.id)), func.count(distinct(WalletCard.user_id)))
        .join(User, User.id == WalletCard.user_id).where(personal, WalletCard.created_at < p.end_ts)
        .group_by(WalletCard.currency))).all()
    wallets_active = dict((await db.execute(
        select(WalletCard.currency, func.count(distinct(Transaction.card_id)))
        .join(Transaction, Transaction.card_id == WalletCard.id).join(User, User.id == WalletCard.user_id)
        .where(personal, Transaction.created_at >= p.start_ts, Transaction.created_at < p.end_ts)
        .group_by(WalletCard.currency))).all())

    # Merchants
    mw = [Merchant.created_at < p.end_ts]
    if country:
        mw.append(Merchant.country_code == country.upper())

    async def mcount(*where) -> int:
        return (await db.execute(select(func.count()).select_from(Merchant).where(*mw, *where))).scalar_one()

    paid = and_(MerchantTransaction.type == "payment", MerchantTransaction.status == "completed")

    def m_active(start, end_):
        return (select(func.count(distinct(MerchantTransaction.merchant_id)))
                .join(Merchant, Merchant.id == MerchantTransaction.merchant_id)
                .where(*mw, paid, MerchantTransaction.created_at >= start, MerchantTransaction.created_at < end_))

    m_prev_ids = (select(MerchantTransaction.merchant_id).distinct()
                  .where(paid, MerchantTransaction.created_at >= prev.start_ts, MerchantTransaction.created_at < prev.end_ts))
    m_retained = (await db.execute(select(func.count(distinct(MerchantTransaction.merchant_id))).where(
        paid, MerchantTransaction.merchant_id.in_(m_prev_ids), MerchantTransaction.created_at >= p.start_ts,
        MerchantTransaction.created_at < p.end_ts))).scalar_one()
    m_prev_active = (await db.execute(m_active(prev.start_ts, prev.end_ts))).scalar_one()
    m_volume = (await db.execute(
        select(Merchant.settlement_currency, func.sum(MerchantTransaction.amount), func.count())
        .join(Merchant, Merchant.id == MerchantTransaction.merchant_id)
        .where(*mw, paid, MerchantTransaction.created_at >= p.start_ts, MerchantTransaction.created_at < p.end_ts)
        .group_by(Merchant.settlement_currency))).all()
    m_by_country = (await db.execute(
        select(Merchant.country_code, func.count(),
               func.count().filter(and_(Merchant.created_at >= p.start_ts, Merchant.created_at < p.end_ts)))
        .where(*mw).group_by(Merchant.country_code))).all()
    merchant_fee_rev = [(c, a) for _, typ, code, c, a in await ledger_by_type(db, p, ("revenue",))
                        if code.startswith("revenue:merchant_fees:")]
    fee_by_ccy: dict[str, Decimal] = {}
    for c, a in merchant_fee_rev:
        fee_by_ccy[c] = fee_by_ccy.get(c, ZERO) + a

    return {
        "period": p.as_dict(), "previous": prev.as_dict(), "country": country,
        "customers": {
            "appInstallations": None,
            "appInstallationsNote": "Not tracked: app store install counts aren't connected to BukkaPay.",
            "registered": registered, "newRegistrations": new, "newRegistrationsPrevious": new_prev,
            "newRegistrationsChange": _pct(new, new_prev),
            "emailVerified": email_verified, "identityVerified": kyc_verified,
            "activatedWallets": activated, "activatedNote": "Customers who have made at least one transaction.",
            "active": active, "activePrevious": active_prev, "activeChange": _pct(active, active_prev),
            "dailyActive": dau, "monthlyActive": mau,
            "retention": _ratio(retained, active_prev), "churn": _ratio(active_prev - retained, active_prev),
            "byCountry": sorted(({"country": c or "Unknown", "registered": n, "new": nn,
                                  "active": active_by_country.get(c, 0)} for c, n, nn in by_country_rows),
                                key=lambda r: -r["registered"]),
            "walletsByCurrency": [{"currency": c, "wallets": w, "customers": u, "activeInPeriod": wallets_active.get(c, 0)}
                                  for c, w, u in sorted(wallets)],
        },
        "merchants": {
            "registered": await mcount(), "newRegistrations": await mcount(Merchant.created_at >= p.start_ts),
            "verified": await mcount(Merchant.kyb_status == "approved"),
            "acceptingPayments": (await db.execute(
                select(func.count(distinct(MerchantTransaction.merchant_id))).join(
                    Merchant, Merchant.id == MerchantTransaction.merchant_id)
                .where(*mw, paid, MerchantTransaction.created_at < p.end_ts))).scalar_one(),
            "active": (await db.execute(m_active(p.start_ts, p.end_ts))).scalar_one(),
            "retention": _ratio(m_retained, m_prev_active),
            "volumeByCurrency": [{"currency": c, "volume": s(a, c), "payments": n} for c, a, n in m_volume],
            "feeRevenueByCurrency": [{"currency": c, "revenue": s(a, c)} for c, a in sorted(fee_by_ccy.items())],
            "byCountry": sorted(({"country": c, "registered": n, "new": nn} for c, n, nn in m_by_country),
                                key=lambda r: -r["registered"]),
        },
        "definitions": {
            "registered": "Personal accounts created, not deleted.",
            "identityVerified": "Identity (KYC) approved.",
            "active": "Made at least one wallet transaction in the period.",
            "monthlyActive": "Made at least one wallet transaction in the 30 days to the period end.",
            "retention": "Share of the previous period's active customers who were active again in this period.",
        },
    }


# ─── currencies and wallets ─────────────────────────────────────────────────

async def balances(db: AsyncSession) -> dict[str, dict[str, Decimal]]:
    """Current ledger balances by bucket and currency (natural direction)."""
    rows = (await db.execute(
        select(LedgerAccount.category, LedgerAccount.type, LedgerAccount.code, LedgerAccount.currency,
               func.sum(LedgerAccount.balance), func.count())
        .group_by(LedgerAccount.category, LedgerAccount.type, LedgerAccount.code, LedgerAccount.currency))).all()
    b: dict[str, dict[str, Decimal]] = {}
    counts: dict[str, int] = {}

    def add(bucket, ccy, amt):
        b.setdefault(bucket, {})
        b[bucket][ccy] = b[bucket].get(ccy, ZERO) + Decimal(amt or 0)

    for cat, typ, code, ccy, amt, n in rows:
        if cat == "customer":
            add("customer_liabilities", ccy, amt)
            counts["wallet_accounts"] = counts.get("wallet_accounts", 0) + int(n)
        elif cat == "merchant":
            add("merchant_liabilities", ccy, amt)
        elif typ == "revenue":
            add("revenue_to_date", ccy, amt)
        elif typ == "expense":
            add("expenses_to_date", ccy, amt)
        elif code.startswith("safeguard:"):
            add("safeguarded_assets", ccy, amt)
        elif code.startswith("fx:position:"):
            add("fx_position", ccy, amt)
        elif typ == "liability" and (code.startswith("escrow:") or code.startswith("card:holds")
                                     or code.startswith("agent:") or code.startswith("payable:")):
            add("settlement_and_escrow", ccy, amt)
        elif typ == "asset":
            add("other_assets", ccy, amt)
        elif typ == "liability":
            add("other_liabilities", ccy, amt)
        elif typ == "equity":
            add("equity", ccy, amt)
    b["_counts"] = counts  # type: ignore[assignment]
    return b


async def currencies(db: AsyncSession, p: Period) -> dict:
    sup = await supported_currencies(db)
    flows = await wallet_flows(db, p)
    bal = await balances(db)
    led = await ledger_by_type(db, p, ("revenue", "expense"))
    out = []
    for c in sup:
        code = c["code"]
        groups = {g: {"volume": s(_gross(g, r), code), "entries": r["entries"]}
                  for (g, ccy), r in flows.items() if ccy == code}
        rev = sum((a for _, t, _, ccy, a in led if t == "revenue" and ccy == code), ZERO)
        exp = sum((a for _, t, _, ccy, a in led if t == "expense" and ccy == code), ZERO)
        out.append({
            **c,
            "customerWalletBalances": s(bal.get("customer_liabilities", {}).get(code, ZERO), code),
            "merchantBalances": s(bal.get("merchant_liabilities", {}).get(code, ZERO), code),
            "safeguardedFunds": s(bal.get("safeguarded_assets", {}).get(code, ZERO), code),
            "activity": groups,
            "deposits": groups.get("deposits", {}).get("volume", s(0, code)),
            "withdrawals": groups.get("withdrawals", {}).get("volume", s(0, code)),
            "p2pTransfers": groups.get("p2p_transfers", {}).get("volume", s(0, code)),
            "merchantPayments": groups.get("merchant_payments", {}).get("volume", s(0, code)),
            "revenue": s(rev, code), "directCosts": s(exp, code), "grossProfit": s(rev - exp, code),
        })
    return {"period": p.as_dict(), "currencies": out, "groupLabels": GROUP_LABELS,
            "note": "Each currency is reported in its own units. Nothing on this page is added across currencies."}


async def wallet(db: AsyncSession, p: Period, *, country: str | None = None, currency: str | None = None,
                 group: str | None = None) -> dict:
    flows = await wallet_flows(db, p, country=country, currency=currency)
    rows = [{"group": g, "label": GROUP_LABELS.get(g, g), "currency": c, "intoWallets": s(r["in"], c),
             "outOfWallets": s(r["out"], c), "volume": s(_gross(g, r), c), "entries": r["entries"]}
            for (g, c), r in sorted(flows.items()) if not group or g == group]
    bal = await balances(db)
    counts = bal.pop("_counts", {})  # type: ignore[arg-type]
    cw = [WalletCard.created_at < p.end_ts]
    if currency:
        cw.append(WalletCard.currency == currency.upper())
    q_wallets = select(func.count()).select_from(WalletCard).where(*cw)
    q_active = (select(func.count(distinct(Transaction.card_id))).join(WalletCard, WalletCard.id == Transaction.card_id)
                .where(*cw, Transaction.created_at >= p.start_ts, Transaction.created_at < p.end_ts))
    if country:
        q_wallets = q_wallets.join(User, User.id == WalletCard.user_id).where(User.residence_country == country.upper())
        q_active = q_active.join(User, User.id == WalletCard.user_id).where(User.residence_country == country.upper())
    model = {k: [{"currency": c, "amount": s(a, c)} for c, a in sorted(v.items()) if not currency or c == currency]
             for k, v in bal.items()}
    return {
        "period": p.as_dict(), "filters": {"country": country, "currency": currency, "group": group},
        "walletAccounts": (await db.execute(q_wallets)).scalar_one(),
        "ledgerWalletAccounts": counts.get("wallet_accounts", 0),
        "activeWallets": (await db.execute(q_active)).scalar_one(),
        "activity": rows,
        "financialModel": model,
        "financialModelLabels": {
            "customer_liabilities": "Customer wallet balances (owed to customers: a liability, not income)",
            "merchant_liabilities": "Merchant balances awaiting settlement (a liability)",
            "safeguarded_assets": "Safeguarded funds held for customers (an asset matched to the liabilities)",
            "settlement_and_escrow": "Settlement, escrow and card-hold balances",
            "fx_position": "FX pool position",
            "revenue_to_date": "Company revenue earned to date",
            "expenses_to_date": "Direct costs booked in the ledger to date",
            "other_assets": "Other company ledger assets", "other_liabilities": "Other ledger liabilities",
            "equity": "Ledger equity accounts",
        },
        "notes": ["Balances are now; activity is for the period.",
                  "P2P transfers are counted once, as money leaving the sender's wallet.",
                  "Opening balances, sandbox and manual adjustments are left out of activity.",
                  "QR and in-app merchant payments are recorded together as merchant payments."],
    }


# ─── revenue ────────────────────────────────────────────────────────────────

async def revenue(db: AsyncSession, p: Period, reporting: str) -> dict:
    from app.board.money import month_end
    from app.models.boardroom import BoardRevenueStream

    book = await RateBook.load(db, reporting)
    led = await ledger_by_type(db, p, ("revenue", "expense"))
    streams_cfg = {r.code: r for r in (await db.execute(select(BoardRevenueStream))).scalars()}
    today = datetime.now(UTC).date()

    def on(m: date) -> date:
        return min(month_end(m), p.end, today)

    from app.board.service import stream_of

    per: dict[str, dict[str, Decimal]] = {}
    costs: dict[str, dict[str, Decimal]] = {}
    monthly: dict[str, dict] = {}
    conv_rev, conv_cost = ZERO, ZERO
    for m, typ, code, ccy, amt in led:
        key = stream_of(code) if typ == "revenue" else (code.split(":")[1] if code.count(":") >= 2 else "other")
        tgt = per if typ == "revenue" else costs
        tgt.setdefault(key, {})
        tgt[key][ccy] = tgt[key].get(ccy, ZERO) + amt
        v = book.convert(amt, ccy, on(m), period=m.isoformat())
        mk = m.isoformat()
        monthly.setdefault(mk, {"month": mk, "revenue": ZERO, "directCosts": ZERO})
        if v is not None:
            if typ == "revenue":
                conv_rev += v
                monthly[mk]["revenue"] += v
            else:
                conv_cost += v
                monthly[mk]["directCosts"] += v

    def by_ccy(d: dict[str, Decimal]) -> list[dict]:
        return [{"currency": c, "amount": s(a, c)} for c, a in sorted(d.items())]

    streams = []
    for code in sorted(set(streams_cfg) | set(per)):
        cfg = streams_cfg.get(code)
        status = cfg.status if cfg else "operational"  # money already earned means it's live
        actual = per.get(code, {})
        streams.append({"code": code, "label": cfg.label if cfg else code.replace("_", " ").capitalize(),
                        "status": status, "notes": cfg.notes if cfg else None,
                        "actual": by_ccy(actual) if (actual or status in ("operational", "disabled")) else [],
                        "showsAmounts": bool(actual) or status == "operational"})
    rev_ccy: dict[str, Decimal] = {}
    for d in per.values():
        for c, a in d.items():
            rev_ccy[c] = rev_ccy.get(c, ZERO) + a
    cost_ccy: dict[str, Decimal] = {}
    for d in costs.values():
        for c, a in d.items():
            cost_ccy[c] = cost_ccy.get(c, ZERO) + a

    # Revenue by country: the paying customer's country of residence.
    country_rows = await revenue_by_country(db, p)
    # Activity bases for per-customer and per-merchant figures.
    ad = await adoption(db, p)
    act, merchants_active = ad["customers"]["active"], ad["merchants"]["active"]
    flows = await wallet_flows(db, p)
    gtv: dict[str, Decimal] = {}
    for (g, c), r in flows.items():
        if g not in ("own_wallet_moves", "reversals", "refunds"):
            gtv[c] = gtv.get(c, ZERO) + _gross(g, r)
    gtv_conv = book.total(gtv, min(p.end, today), period=p.label())
    return {
        "period": p.as_dict(), "reportingCurrency": reporting,
        "streams": streams,
        "revenueByCurrency": by_ccy(rev_ccy), "directCostsByCurrency": by_ccy(cost_ccy),
        "grossProfitByCurrency": [{"currency": c, "amount": s(rev_ccy.get(c, ZERO) - cost_ccy.get(c, ZERO), c)}
                                  for c in sorted(set(rev_ccy) | set(cost_ccy))],
        "directCostsByType": [{"type": k, "byCurrency": by_ccy(v)} for k, v in sorted(costs.items())],
        "grossTransactionVolumeByCurrency": by_ccy(gtv),
        "converted": {
            "revenue": s(conv_rev, reporting), "directCosts": s(conv_cost, reporting),
            "grossProfit": s(conv_rev - conv_cost, reporting), "grossTransactionVolume": s(gtv_conv, reporting),
            "takeRate": _ratio(conv_rev, gtv_conv, "0.01"),
            "revenuePerActiveCustomer": s(conv_rev / act, reporting) if act else None,
            "revenuePerActiveMerchant": s(conv_rev / merchants_active, reporting) if merchants_active else None,
            "methodology": book.methodology(),
        },
        "monthly": [{"month": v["month"], "revenue": s(v["revenue"], reporting),
                     "directCosts": s(v["directCosts"], reporting),
                     "grossProfit": s(v["revenue"] - v["directCosts"], reporting)}
                    for v in sorted(monthly.values(), key=lambda r: r["month"])],
        "byCountry": country_rows,
        "notes": ["Revenue is what the ledger booked to revenue accounts: fees and spreads actually earned.",
                  "Transaction volume is shown separately and is never counted as revenue.",
                  "Planned and in-development streams show no amounts unless the ledger has booked revenue to them.",
                  "Operating expenses, PSP and banking charges outside the ledger come from the management accounts "
                  "(Financials)."],
    }


async def revenue_by_country(db: AsyncSession, p: Period) -> list[dict]:
    """Revenue lines attributed to the country of the customer whose wallet paid in that entry."""
    payer = (select(JournalLine.entry_id.label("entry_id"), func.min(User.residence_country).label("country"))
             .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
             .join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id)
             .join(User, User.id == WalletCard.user_id)
             .where(LedgerAccount.category == "customer", JournalLine.debit > 0,
                    JournalLine.created_at >= p.start_ts - timedelta(days=1), JournalLine.created_at < p.end_ts + timedelta(days=1))
             .group_by(JournalLine.entry_id).subquery())
    rows = (await db.execute(
        select(payer.c.country, LedgerAccount.currency, func.sum(JournalLine.credit - JournalLine.debit))
        .select_from(JournalLine)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .outerjoin(payer, payer.c.entry_id == JournalLine.entry_id)
        .where(LedgerAccount.type == "revenue", JournalEntry.posted_at >= p.start_ts, JournalEntry.posted_at < p.end_ts)
        .group_by(payer.c.country, LedgerAccount.currency))).all()
    return [{"country": c or "Unattributed", "currency": ccy, "revenue": s(a, ccy)} for c, ccy, a in rows]


# ─── cross-border ───────────────────────────────────────────────────────────

async def cross_border(db: AsyncSession, p: Period) -> dict:
    from app.models.platform import Country, PaymentCorridor, Transfer

    names = dict((await db.execute(select(Country.code, Country.name))).all())
    corridors = (await db.execute(select(PaymentCorridor))).scalars().all()
    stats = (await db.execute(
        select(Transfer.corridor_id, Transfer.status, Transfer.from_currency, Transfer.to_currency, func.count(),
               func.sum(Transfer.source_amount), func.sum(Transfer.destination_amount), func.sum(Transfer.fee),
               func.avg(func.extract("epoch", Transfer.credited_at - Transfer.created_at)))
        .where(Transfer.created_at >= p.start_ts, Transfer.created_at < p.end_ts)
        .group_by(Transfer.corridor_id, Transfer.status, Transfer.from_currency, Transfer.to_currency))).all()
    # Revenue the ledger booked on cross-border entries (fees and FX), by currency.
    rev_rows = (await db.execute(
        select(LedgerAccount.code, LedgerAccount.currency, func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.account_id == LedgerAccount.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(LedgerAccount.type == "revenue", JournalEntry.kind.in_(KIND_GROUPS["cross_border"]),
               JournalEntry.posted_at >= p.start_ts, JournalEntry.posted_at < p.end_ts)
        .group_by(LedgerAccount.code, LedgerAccount.currency))).all()
    stale = (await db.execute(select(func.count()).select_from(Transfer).where(
        Transfer.status.in_(("sender_debited", "instructed")),
        Transfer.created_at < datetime.now(UTC) - timedelta(hours=48)))).scalar_one()
    by_corr: dict = {}
    for cid, st, fc, tc, n, src, dst, fee, secs in stats:
        d = by_corr.setdefault(cid, {"statuses": {}, "count": 0, "sent": ZERO, "received": ZERO, "fees": ZERO,
                                     "secs": [], "fc": fc, "tc": tc})
        d["statuses"][st] = int(n)
        d["count"] += int(n)
        if st not in ("failed", "reversed"):
            d["sent"] += Decimal(src or 0)
            d["received"] += Decimal(dst or 0)
            d["fees"] += Decimal(fee or 0)
        if secs is not None:
            d["secs"].append((float(secs), int(n)))
    live, planned = [], []
    for c in corridors:
        d = by_corr.get(c.id)
        row = {"id": str(c.id), "from": c.from_country, "fromName": names.get(c.from_country, c.from_country),
               "to": c.to_country, "toName": names.get(c.to_country, c.to_country),
               "fromCurrency": c.from_currency, "toCurrency": c.to_currency, "status": c.status,
               "settlementModel": c.settlement_model}
        if c.status in ("active", "pilot"):
            completed = (d or {}).get("statuses", {}).get("credited", 0)
            total = (d or {}).get("count", 0)
            secs = (d or {}).get("secs", [])
            avg = (sum(a * n for a, n in secs) / sum(n for _, n in secs)) if secs else None
            row |= {
                "transfers": total, "byStatus": (d or {}).get("statuses", {}),
                "completed": completed,
                "failed": (d or {}).get("statuses", {}).get("failed", 0),
                "reversed": (d or {}).get("statuses", {}).get("reversed", 0),
                "pending": sum(v for k, v in (d or {}).get("statuses", {}).items()
                               if k in ("sender_debited", "instructed", "settled")),
                "sent": s((d or {}).get("sent", ZERO), c.from_currency),
                "received": s((d or {}).get("received", ZERO), c.to_currency),
                "fees": s((d or {}).get("fees", ZERO), c.from_currency),
                "successRate": _ratio(completed, total),
                "avgProcessingMinutes": round(avg / 60, 1) if avg is not None else None,
            }
            live.append(row)
        else:
            planned.append(row)
    return {
        "period": p.as_dict(), "liveCorridors": live, "plannedCorridors": planned,
        "ledgerRevenue": [{"stream": stream_code(code), "currency": c, "amount": s(a, c)} for code, c, a in rev_rows],
        "transfersPendingOver48h": stale,
        "notes": ["Only corridors with status active or pilot are live. Draft and suspended corridors are listed as "
                  "not live and carry no figures.",
                  "Amounts sent are customer funds moving across borders, not revenue. Revenue is only what the "
                  "ledger booked as fees or FX on these transfers."],
    }


def stream_code(code: str) -> str:
    from app.board.service import stream_of

    return stream_of(code)


# ─── card and POS payments ──────────────────────────────────────────────────

IN_PERSON = ("contactless", "chip", "magstripe", "wallet_token")


async def pos(db: AsyncSession, p: Period) -> dict:
    from app.models.cards import CardAuthorization, IssuedCard
    from app.models.platform import PaymentProvider

    base = [CardAuthorization.created_at >= p.start_ts, CardAuthorization.created_at < p.end_ts]
    ok = CardAuthorization.status.in_(("approved", "captured"))
    by_channel = (await db.execute(
        select(CardAuthorization.channel, CardAuthorization.currency, func.count(), func.count().filter(ok),
               func.coalesce(func.sum(CardAuthorization.captured_amount), 0),
               func.coalesce(func.sum(case((ok, CardAuthorization.amount), else_=0)), 0),
               func.coalesce(func.sum(CardAuthorization.fee), 0),
               func.count(distinct(CardAuthorization.merchant_name)))
        .where(*base).group_by(CardAuthorization.channel, CardAuthorization.currency))).all()
    by_country = (await db.execute(
        select(CardAuthorization.merchant_country, CardAuthorization.currency, func.count().filter(ok),
               func.coalesce(func.sum(case((ok, CardAuthorization.amount), else_=0)), 0))
        .where(*base, CardAuthorization.channel.in_(IN_PERSON))
        .group_by(CardAuthorization.merchant_country, CardAuthorization.currency))).all()
    declines = (await db.execute(
        select(CardAuthorization.decline_reason, func.count())
        .where(*base, CardAuthorization.status == "declined").group_by(CardAuthorization.decline_reason))).all()
    networks = (await db.execute(select(IssuedCard.network, IssuedCard.form, func.count())
                                 .where(IssuedCard.status == "active").group_by(IssuedCard.network, IssuedCard.form))).all()
    card_rev = [(code, c, a) for _, t, code, c, a in await ledger_by_type(db, p, ("revenue", "expense"))
                if "interchange" in code or code.startswith("expense:card")]
    providers = (await db.execute(select(PaymentProvider.name, PaymentProvider.mode, PaymentProvider.status)
                                  .where(PaymentProvider.provider_type == "card"))).all()
    channels = []
    totals = {"in_person": [0, 0], "online": [0, 0], "phone": [0, 0]}
    for ch, ccy, n, n_ok, captured, approved, fee, merchants in by_channel:
        channels.append({"channel": ch, "inPerson": ch in IN_PERSON, "phoneInitiated": ch == "wallet_token",
                         "currency": ccy, "attempts": n, "successful": n_ok, "failed": n - n_ok,
                         "successRate": _ratio(n_ok, n), "approvedValue": s(approved, ccy),
                         "capturedValue": s(captured, ccy), "cardholderFees": s(fee, ccy),
                         "distinctMerchants": merchants})
        k = "in_person" if ch in IN_PERSON else "online"
        totals[k][0] += n
        totals[k][1] += n_ok
        if ch == "wallet_token":
            totals["phone"][0] += n
            totals["phone"][1] += n_ok
    live = any(st == "active" and mode == "production" for _, mode, st in providers)
    return {
        "period": p.as_dict(),
        "status": "live" if live else ("sandbox" if providers else "not_configured"),
        "providers": [{"name": n, "mode": m, "status": st} for n, m, st in providers],
        "channels": channels,
        "summary": {k: {"attempts": a, "successful": b, "successRate": _ratio(b, a)} for k, (a, b) in totals.items()},
        "byCountry": [{"country": c or "Unknown", "currency": ccy, "successful": n, "value": s(v, ccy)}
                      for c, ccy, n, v in by_country],
        "declineReasons": [{"reason": r or "unspecified", "count": n} for r, n in declines],
        "activeCards": [{"network": nw, "form": f, "count": n} for nw, f, n in networks],
        "ledger": [{"account": code, "currency": c, "amount": s(a, c)} for code, c, a in card_rev],
        "terminals": None,
        "terminalsNote": "BukkaPay cards are accepted on the card network's existing terminals, so BukkaPay doesn't "
                         "operate or count terminals. 'Distinct merchants' counts merchant names seen in authorisations.",
        "notes": ["Payment values are what cardholders paid from their wallets: not revenue and not merchant "
                  "settlement. Card revenue is interchange the ledger booked; network and issuer fees are costs.",
                  "Phone-initiated means paid with a phone wallet token (tap to pay)."],
    }


# ─── FX ─────────────────────────────────────────────────────────────────────

async def fx(db: AsyncSession, p: Period, reporting: str) -> dict:
    rows = (await db.execute(select(JournalEntry.posted_at, JournalEntry.details).where(
        JournalEntry.kind == "currency_swap", JournalEntry.posted_at >= p.start_ts,
        JournalEntry.posted_at < p.end_ts))).all()
    book = await RateBook.load(db, reporting)
    pairs: dict[str, dict] = {}
    for at, d in rows:
        d = d or {}
        fc, tc = d.get("from_currency"), d.get("to_currency")
        if not fc or not tc:
            continue
        x = pairs.setdefault(f"{fc}/{tc}", {"from": fc, "to": tc, "count": 0, "sold": ZERO, "bought": ZERO,
                                             "fees": ZERO, "spread": ZERO, "ref": []})
        amt, rec = Decimal(d.get("amount") or 0), Decimal(d.get("receive") or 0)
        x["count"] += 1
        x["sold"] += amt
        x["bought"] += rec
        x["fees"] += Decimal(d.get("fee") or 0)
        x["spread"] += Decimal(d.get("spread") or 0)
        a = book.rate(fc, at.date())
        b = book.rate(tc, at.date())
        if a and b:
            x["ref"].append((a[0] / b[0], amt))
    out = []
    for k, x in sorted(pairs.items()):
        applied = (x["bought"] / x["sold"]) if x["sold"] else None
        ref = (sum(r * w for r, w in x["ref"]) / sum(w for _, w in x["ref"])) if x["ref"] else None
        out.append({"pair": k, "from": x["from"], "to": x["to"], "conversions": x["count"],
                    "volumeSold": s(x["sold"], x["from"]), "volumeBought": s(x["bought"], x["to"]),
                    "avgAppliedRate": format(applied.quantize(Decimal("0.000001")), "f") if applied else None,
                    "avgReferenceRate": format(ref.quantize(Decimal("0.000001")), "f") if ref else None,
                    "feesCharged": s(x["fees"], x["from"]), "spreadRecorded": s(x["spread"], x["from"])})
    led = await ledger_by_type(db, p, ("revenue", "expense"))
    fx_rev = {}
    fx_cost = {}
    for _, t, code, c, a in led:
        if t == "revenue" and code.startswith("revenue:fx:"):
            fx_rev[c] = fx_rev.get(c, ZERO) + a
        if t == "expense" and ":fx" in code:
            fx_cost[c] = fx_cost.get(c, ZERO) + a
    bal = await balances(db)
    from app.models.wallet import CurrencyCorridor

    quoted = (await db.execute(select(CurrencyCorridor.from_currency, CurrencyCorridor.to_currency,
                                      CurrencyCorridor.exchange_rate, CurrencyCorridor.updated_at,
                                      CurrencyCorridor.is_active))).all()
    return {
        "period": p.as_dict(), "pairs": out,
        "fxRevenueByCurrency": [{"currency": c, "amount": s(a, c)} for c, a in sorted(fx_rev.items())],
        "fxCostsByCurrency": [{"currency": c, "amount": s(a, c)} for c, a in sorted(fx_cost.items())],
        "exposure": [{"currency": c, "position": s(a, c)} for c, a in sorted(bal.get("fx_position", {}).items())],
        "currentQuotedRates": [{"pair": f"{a}/{b}", "rate": str(r), "updatedAt": u.isoformat() if u else None,
                                "active": act} for a, b, r, u, act in quoted],
        "successRate": None,
        "successRateNote": "Only completed conversions reach the ledger; refused quotes aren't recorded, so a "
                           "success rate can't be calculated yet.",
        "referenceRateSource": "Daily mid-market snapshots (board_fx_rates).",
        "notes": ["FX revenue is only what the ledger booked to FX revenue accounts (fees and the contracted spread).",
                  "Movements in exchange rates on balances held are not booked as revenue."],
    }


# ─── custodians and liquidity ───────────────────────────────────────────────

async def liability_for(db: AsyncSession, currency: str, country: str | None = None) -> Decimal:
    """Customer + merchant funds owed in a currency (optionally one country's customers/merchants)."""
    q = select(func.coalesce(func.sum(LedgerAccount.balance), 0)).where(
        LedgerAccount.currency == currency, LedgerAccount.category.in_(("customer", "merchant")))
    if country is None:
        return Decimal((await db.execute(q)).scalar_one())
    cust = (await db.execute(
        select(func.coalesce(func.sum(LedgerAccount.balance), 0))
        .join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id).join(User, User.id == WalletCard.user_id)
        .where(LedgerAccount.currency == currency, LedgerAccount.category == "customer",
               User.residence_country == country))).scalar_one()
    merch = (await db.execute(
        select(func.coalesce(func.sum(LedgerAccount.balance), 0))
        .join(Merchant, Merchant.id == LedgerAccount.merchant_id)
        .where(LedgerAccount.currency == currency, LedgerAccount.category == "merchant",
               Merchant.country_code == country))).scalar_one()
    return Decimal(cust) + Decimal(merch)


async def custodians(db: AsyncSession) -> dict:
    from app.models.boardroom import CustodianReconciliation
    from app.models.platform import Country, CountryCustodian, Custodian, Transfer

    names = dict((await db.execute(select(Country.code, Country.name))).all())
    cus = {c.id: c for c in (await db.execute(select(Custodian))).scalars()}
    links = (await db.execute(select(CountryCustodian))).scalars().all()
    recs = (await db.execute(select(CustodianReconciliation).order_by(CustodianReconciliation.statement_date.desc(),
                                                                      CustodianReconciliation.created_at.desc()))).scalars().all()
    latest: dict[tuple, CustodianReconciliation] = {}
    for r in recs:
        latest.setdefault((r.custodian_id, r.currency), r)
    today = datetime.now(UTC).date()
    pending_transfers = (await db.execute(
        select(Transfer.from_currency, func.coalesce(func.sum(Transfer.source_amount), 0), func.count())
        .where(Transfer.status.in_(("sender_debited", "instructed", "settled"))).group_by(Transfer.from_currency))).all()
    pending = {c: (Decimal(a), n) for c, a, n in pending_transfers}
    rows, alerts = [], []
    for link in links:
        c = cus.get(link.custodian_id)
        if c is None:
            continue
        liab = await liability_for(db, link.currency_code, link.country_code)
        r = latest.get((c.id, link.currency_code))
        row = {
            "custodianId": str(c.id), "custodian": c.name, "institutionType": c.institution_type,
            "custodianStatus": c.status, "integration": c.integration_status,
            "country": link.country_code, "countryName": names.get(link.country_code, link.country_code),
            "currency": link.currency_code, "role": link.role, "arrangementStatus": link.status,
            "ledgerLiability": s(liab, link.currency_code),
            "pendingSettlements": s(pending.get(link.currency_code, (ZERO, 0))[0], link.currency_code),
            "latest": None,
        }
        if r is not None:
            row["latest"] = {
                "statementDate": r.statement_date.isoformat(), "reportedBalance": s(r.reported_balance, r.currency),
                "ledgerLiabilityAtStatement": s(r.ledger_liability, r.currency),
                "difference": s(r.difference, r.currency), "source": r.source, "status": r.status,
                "hasEvidence": r.statement_document_id is not None, "recordedBy": r.recorded_by,
                "availableLiquidity": s(r.reported_balance - liab, r.currency),
            }
            age = (today - r.statement_date).days
            if r.status != "reconciled":
                alerts.append({"level": "high", "kind": "unreconciled", "custodian": c.name, "currency": r.currency,
                               "message": f"{c.name} {r.currency}: latest statement ({r.statement_date}) is {r.status}."})
            if r.reported_balance < liab:
                alerts.append({"level": "high", "kind": "liquidity_shortage", "custodian": c.name, "currency": r.currency,
                               "message": f"{c.name} {r.currency}: reported balance is below what customers and "
                                          "merchants are owed."})
            if age > 35:
                alerts.append({"level": "medium", "kind": "missing_statement", "custodian": c.name,
                               "currency": r.currency, "message": f"{c.name} {r.currency}: no statement for {age} days."})
        elif link.status == "active":
            alerts.append({"level": "medium", "kind": "missing_statement", "custodian": c.name,
                           "currency": link.currency_code,
                           "message": f"{c.name} {link.currency_code}: no custodian statement recorded yet."})
        rows.append(row)
    stale = (await db.execute(select(func.count()).select_from(Transfer).where(
        Transfer.status.in_(("sender_debited", "instructed")),
        Transfer.created_at < datetime.now(UTC) - timedelta(hours=48)))).scalar_one()
    if stale:
        alerts.append({"level": "medium", "kind": "settlement_delay", "custodian": None, "currency": None,
                       "message": f"{stale} cross-border transfer(s) pending for more than 48 hours."})
    alerts += await unusual_movements(db)
    return {"custodians": rows, "alerts": alerts,
            "unlinked": [{"custodian": c.name, "country": c.country_code, "status": c.status}
                         for cid, c in cus.items() if not any(link.custodian_id == cid for link in links)],
            "sourceLabels": {"live_integration": "Live integration", "manual_statement": "Manually uploaded statement",
                             "management_reported": "Management-reported"},
            "notes": ["A balance is marked reconciled only when it came from a statement or live feed, has a "
                      "supporting document, and matches the ledger exactly.",
                      "Investors can't move money or see custodian credentials; nothing here can initiate a transfer."]}


async def unusual_movements(db: AsyncSession) -> list[dict]:
    """Yesterday's money out of customer wallets vs the 30-day daily average, per currency."""
    now = datetime.now(UTC)
    day0 = datetime.combine(now.date(), time.min, tzinfo=UTC)
    q = (select(LedgerAccount.currency, func.coalesce(func.sum(JournalLine.debit), 0))
         .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
         .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
         .where(LedgerAccount.category == "customer", JournalEntry.kind.in_(KIND_GROUPS["withdrawals"])))
    last = dict((await db.execute(q.where(JournalEntry.posted_at >= day0 - timedelta(days=1),
                                          JournalEntry.posted_at < day0).group_by(LedgerAccount.currency))).all())
    base = dict((await db.execute(q.where(JournalEntry.posted_at >= day0 - timedelta(days=31),
                                          JournalEntry.posted_at < day0 - timedelta(days=1))
                                  .group_by(LedgerAccount.currency))).all())
    out = []
    for c, v in last.items():
        avg = Decimal(base.get(c, 0)) / 30
        if avg > 0 and Decimal(v) > avg * 3:
            out.append({"level": "medium", "kind": "unusual_movement", "custodian": None, "currency": c,
                        "message": f"{c} withdrawals yesterday were {(Decimal(v) / avg).quantize(Decimal('0.1'))}× "
                                   "the 30-day daily average."})
    return out


async def record_reconciliation(db: AsyncSession, *, custodian_id, currency: str, statement_date: date,
                                reported_balance: Decimal, source: str, pending: Decimal | None,
                                document_id=None, notes: str | None, by: str):
    from app.models.boardroom import CustodianReconciliation
    from app.models.platform import Custodian

    c = await db.get(Custodian, custodian_id)
    if c is None:
        raise ApiError("Custodian not found", status_code=404)
    if source not in ("live_integration", "manual_statement", "management_reported"):
        raise ApiError("Say where the balance came from", status_code=422)
    if source == "live_integration" and c.integration_status != "production":
        raise ApiError("This custodian has no live integration; record it as a statement or management-reported",
                       status_code=422)
    currency = currency.upper()
    liab = await liability_for(db, currency, c.country_code)
    diff = Decimal(reported_balance) - liab
    evidence = document_id is not None or source == "live_integration"
    status = "reconciled" if (diff == 0 and evidence and source != "management_reported") else (
        "under_review" if diff == 0 else "unreconciled")
    r = CustodianReconciliation(custodian_id=c.id, country_code=c.country_code, currency=currency,
                                statement_date=statement_date, reported_balance=reported_balance,
                                ledger_liability=liab, difference=diff, pending_settlements=pending, source=source,
                                status=status, statement_document_id=document_id, notes=notes, recorded_by=by)
    db.add(r)
    await db.flush()
    return r


# ─── countries ──────────────────────────────────────────────────────────────

COUNTRY_STATUS = {"planned": "Planned", "pilot": "Pilot", "live": "Operational", "suspended": "Temporarily suspended"}


async def countries(db: AsyncSession, p: Period) -> dict:
    from app.models.boardroom import BusinessMilestone
    from app.models.platform import (
        Country,
        CountryCurrency,
        CountryCustodian,
        Custodian,
        PaymentProvider,
        ProviderCountry,
    )

    cs = (await db.execute(select(Country).where(Country.region == "Africa"))).scalars().all()
    ccy = {}
    for cc in (await db.execute(select(CountryCurrency))).scalars():
        ccy.setdefault(cc.country_code, []).append({"currency": cc.currency_code, "walletEnabled": cc.wallet_enabled})
    personal = and_(User.account_type == "personal", User.deleted_at.is_(None))
    cust = dict((await db.execute(select(User.residence_country, func.count()).where(personal)
                                  .group_by(User.residence_country))).all())
    active = dict((await db.execute(
        select(User.residence_country, func.count(distinct(Transaction.user_id))).join(User, User.id == Transaction.user_id)
        .where(personal, Transaction.created_at >= p.start_ts, Transaction.created_at < p.end_ts)
        .group_by(User.residence_country))).all())
    merch = dict((await db.execute(select(Merchant.country_code, func.count()).group_by(Merchant.country_code))).all())
    vol_rows = (await db.execute(
        select(User.residence_country, LedgerAccount.currency, func.sum(JournalLine.debit))
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .join(WalletCard, WalletCard.id == LedgerAccount.wallet_card_id).join(User, User.id == WalletCard.user_id)
        .where(LedgerAccount.category == "customer", JournalEntry.posted_at >= p.start_ts,
               JournalEntry.posted_at < p.end_ts, JournalEntry.kind.not_in(EXCLUDED_KINDS + ("own_wallet_move",)))
        .group_by(User.residence_country, LedgerAccount.currency))).all()
    vol: dict[str, list] = {}
    for c, cur, a in vol_rows:
        vol.setdefault(c, []).append({"currency": cur, "volume": s(a, cur)})
    rev: dict[str, list] = {}
    for r in await revenue_by_country(db, p):
        rev.setdefault(r["country"], []).append({"currency": r["currency"], "revenue": r["revenue"]})
    custs = {}
    for link, c in (await db.execute(select(CountryCustodian, Custodian).join(Custodian, Custodian.id == CountryCustodian.custodian_id))).all():
        custs.setdefault(link.country_code, []).append({"name": c.name, "currency": link.currency_code,
                                                        "status": link.status, "role": link.role})
    provs = {}
    for pc, pv in (await db.execute(select(ProviderCountry, PaymentProvider).join(PaymentProvider, PaymentProvider.id == ProviderCountry.provider_id))).all():
        provs.setdefault(pc.country_code, []).append({"name": pv.name, "type": pv.provider_type, "status": pc.status,
                                                      "capabilities": pc.capabilities})
    ms = {}
    for m in (await db.execute(select(BusinessMilestone).where(BusinessMilestone.country_code.is_not(None)))).scalars():
        ms.setdefault(m.country_code, []).append({"title": m.title, "status": m.status, "progress": m.progress,
                                                  "category": m.category})
    out = []
    for c in sorted(cs, key=lambda x: x.name):
        gates = {"compliance": c.compliance_approved, "custodian": c.custodian_ready, "provider": c.provider_ready}
        status = c.status
        label = COUNTRY_STATUS.get(status, status)
        # "Under development" needs real work in progress, not just seeded planning rows.
        active_partner = any(x["status"] in ("contracting", "sandbox", "live") for x in provs.get(c.code, []))
        active_ms = any(x["status"] in ("in_progress", "completed") for x in ms.get(c.code, []))
        if status == "planned" and (any(gates.values()) or active_partner or active_ms):
            label = "Under development"
        out.append({
            "code": c.code, "name": c.name, "status": status, "statusLabel": label,
            "currencies": ccy.get(c.code, []), "defaultCurrency": c.default_currency,
            "registeredCustomers": cust.get(c.code, 0), "activeCustomers": active.get(c.code, 0),
            "merchants": merch.get(c.code, 0), "volume": vol.get(c.code, []), "revenue": rev.get(c.code, []),
            "operatingExpenses": None, "profitability": None,
            "custodians": custs.get(c.code, []), "partners": provs.get(c.code, []),
            "readiness": gates, "regulator": c.regulator, "licenceModel": c.licence_model,
            "complianceSignedAt": c.compliance_signed_at.isoformat() if c.compliance_signed_at else None,
            "launchedAt": c.launched_at.isoformat() if c.launched_at else None,
            "milestones": ms.get(c.code, []),
        })
    return {"period": p.as_dict(), "countries": out,
            "notes": ["A country is Operational only when its status is live, which the platform allows only after "
                      "compliance, custodian and provider readiness are all signed off.",
                      "Operating expenses and profit by country aren't available: management accounts are kept for "
                      "the company as a whole."]}


# ─── company health ─────────────────────────────────────────────────────────

def _grade(value: Decimal | None, *, good: Decimal, warn: Decimal, higher_is_better: bool = True) -> str:
    if value is None:
        return "no_data"
    if not higher_is_better:
        value, good, warn = -value, -good, -warn
    if value >= good:
        return "on_track"
    if value >= warn:
        return "needs_attention"
    return "behind_target"


async def health(db: AsyncSession, reporting: str) -> dict:
    from app.board.service import overview
    from app.models.boardroom import BusinessMilestone, CompanyRisk
    from app.models.cards import CardAuthorization
    from app.models.platform import Transfer

    ov = await overview(db, months=3)
    ser = ov["series"]
    cur, prev = ser[-1], ser[-2]

    def d(v):
        return None if v is None else Decimal(str(v))

    def growth(a, b):
        return None if a is None or not b else (Decimal(str(a)) - Decimal(str(b))) / Decimal(str(b)) * 100

    rev_g = growth(cur["revenue"], prev["revenue"])
    cust_g = growth(cur["users"], prev["users"])
    merch_g = growth(sum(r["newMerchants"] for r in ser[-1:]), sum(r["newMerchants"] for r in ser[-2:-1]))
    k = ov["kpis"]
    runway = d(k.get("runwayMonths"))
    net = d(cur["netProfit"])
    since = datetime.now(UTC) - timedelta(days=30)
    auth = (await db.execute(select(func.count(), func.count().filter(CardAuthorization.status.in_(("approved", "captured"))))
                             .where(CardAuthorization.created_at >= since))).one()
    tr = (await db.execute(select(func.count(), func.count().filter(Transfer.status == "credited"),
                                  func.count().filter(and_(Transfer.status.in_(("sender_debited", "instructed")),
                                                           Transfer.created_at < datetime.now(UTC) - timedelta(hours=48))))
                           .where(Transfer.created_at >= since))).one()
    ms = (await db.execute(select(BusinessMilestone.status, BusinessMilestone.category, BusinessMilestone.target_date,
                                  BusinessMilestone.progress))).all()
    today = datetime.now(UTC).date()
    open_ms = [m for m in ms if m[0] not in ("completed", "cancelled")]
    late = [m for m in open_ms if m[2] and m[2] < today]
    done = [m for m in ms if m[0] == "completed"]
    compliance = [m for m in ms if m[1] in ("regulatory", "compliance")]
    risks = (await db.execute(select(CompanyRisk.likelihood, CompanyRisk.impact, CompanyRisk.status, CompanyRisk.category))).all()
    high_open = [r for r in risks if r[2] in ("open", "mitigating") and r[0] * r[1] >= 15]
    reg_risks = [r for r in risks if r[3] in ("regulatory", "compliance") and r[2] in ("open", "mitigating")]
    countries_live = k.get("countriesLive") or 0
    act = d(k.get("activation"))

    def item(name, status, value, note):
        return {"name": name, "status": status, "value": value, "note": note}

    def fmt(v, suffix="%"):
        return None if v is None else f"{v.quantize(Decimal('0.1'))}{suffix}"

    sections = [
        {"area": "Financial health", "items": [
            item("Revenue growth (month on month)", _grade(rev_g, good=Decimal(5), warn=Decimal(0)), fmt(rev_g),
                 "Ledger revenue, this month vs last."),
            item("Cash runway", _grade(runway, good=Decimal(12), warn=Decimal(6)) if runway is not None else (
                "on_track" if k.get("cash") is not None and (k.get("monthlyBurn") or 0) == 0 else "no_data"),
                 fmt(runway, " months"), "Cash ÷ average monthly burn (management accounts)."),
            item("Profitability", "no_data" if net is None else ("on_track" if net >= 0 else "needs_attention"),
                 None if net is None else f"{reporting} {net.quantize(Decimal('0.01'))}", "Net profit this month."),
            item("Expense control", await _budget_status(db), None, "Operating costs vs approved budget this month."),
        ]},
        {"area": "Adoption", "items": [
            item("Customer growth", _grade(cust_g, good=Decimal(5), warn=Decimal(1)), fmt(cust_g), "Customers, month on month."),
            item("Merchant growth", _grade(merch_g, good=Decimal(5), warn=Decimal(0)), fmt(merch_g), "New merchants, month on month."),
            item("Wallet activation", _grade(act, good=Decimal(40), warn=Decimal(20)), fmt(act),
                 "Customers who transacted in the last 30 days."),
            item("Retention", "no_data" if not ov["cohorts"] else "needs_attention" if all(
                (c["retention"][1] if len(c["retention"]) > 1 else None) in (None, 0) for c in ov["cohorts"][:-1]) else "on_track",
                 None, "From signup cohorts (Markets & retention)."),
        ]},
        {"area": "Operations", "items": [
            item("Platform availability", "no_data", None, "Uptime monitoring isn't connected to the Boardroom yet."),
            item("Card payment success", _grade(Decimal(auth[1]) / auth[0] * 100 if auth[0] else None,
                                                good=Decimal(90), warn=Decimal(80)),
                 fmt(Decimal(auth[1]) / auth[0] * 100) if auth[0] else None, "Approved ÷ attempted, 30 days."),
            item("Cross-border completion", _grade(Decimal(tr[1]) / tr[0] * 100 if tr[0] else None,
                                                   good=Decimal(95), warn=Decimal(85)),
                 fmt(Decimal(tr[1]) / tr[0] * 100) if tr[0] else None, "Credited ÷ started, 30 days."),
            item("Settlement performance", "no_data" if not tr[0] else ("on_track" if tr[2] == 0 else "needs_attention"),
                 None if not tr[0] else f"{tr[2]} delayed", "Transfers pending more than 48 hours."),
        ]},
        {"area": "Strategy", "items": [
            item("Product and partnership milestones", "no_data" if not ms else (
                "completed" if not open_ms else "on_track" if not late else "behind_target"),
                 None if not ms else f"{len(done)} done, {len(late)} overdue of {len(ms)}", "Milestone tracker."),
            item("Country expansion", "no_data" if not countries_live and not k.get("countriesPilot") else "on_track",
                 f"{countries_live} live, {k.get('countriesPilot') or 0} pilot", "From country status."),
        ]},
        {"area": "Compliance", "items": [
            item("Compliance milestones", "no_data" if not compliance else (
                "completed" if all(m[0] == "completed" for m in compliance) else
                "behind_target" if any(m[2] and m[2] < today and m[0] != "completed" for m in compliance) else "on_track"),
                 None if not compliance else f"{sum(m[0] == 'completed' for m in compliance)} of {len(compliance)} done",
                 "Regulatory and compliance milestones."),
            item("High regulatory and other risks", "no_data" if not risks else (
                "on_track" if not high_open else "needs_attention"),
                 None if not risks else f"{len(high_open)} high, {len(reg_risks)} regulatory open", "Risk register."),
        ]},
    ]
    return {"generatedAt": datetime.now(UTC).isoformat(), "sections": sections,
            "statusLabels": {"on_track": "On track", "needs_attention": "Needs attention",
                             "behind_target": "Behind target", "completed": "Completed", "no_data": "No data yet"},
            "notes": ["Scores only use data that exists. Anything without data shows 'No data yet' instead of a score.",
                      "Thresholds are defaults; the owner can set targets per metric."]}


async def _budget_status(db: AsyncSession) -> str:
    from app.board.service import COSTS
    from app.models.board import BoardFinancial
    from app.models.boardroom import BoardBudget

    today = datetime.now(UTC).date()
    month = date(today.year, today.month, 1)
    # Use the latest month that has both a budget and management accounts.
    budgets = (await db.execute(select(BoardBudget.month, func.sum(BoardBudget.amount)).group_by(BoardBudget.month)
                                .order_by(BoardBudget.month.desc()).limit(6))).all()
    for m, total in budgets:
        if m > month:
            continue
        f = (await db.execute(select(BoardFinancial).where(BoardFinancial.month == m))).scalar_one_or_none()
        if f is None:
            continue
        actual = sum((Decimal(getattr(f, k) or 0) for k in COSTS), ZERO)
        if not total:
            return "no_data"
        r = actual / Decimal(total)
        return "on_track" if r <= Decimal("1.0") else ("needs_attention" if r <= Decimal("1.1") else "behind_target")
    return "no_data"


__all__ = ["Period", "period_of", "adoption", "currencies", "wallet", "revenue", "cross_border", "pos", "fx",
           "custodians", "countries", "health", "record_reconciliation"]
