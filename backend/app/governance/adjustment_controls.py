"""Insider-abuse controls on admin money adjustments.

The threat: an admin (or two colluding admins) moving company money into a
wallet they control, or reversing fees for a friend. Controls, on top of
wallet-ID-only targeting, named sources of funds and maker-checker:

  1. Conflict of interest: an adjustment to a wallet whose holder looks like
     the requester or the approver (same name, same email name) is refused
     for that admin; if it looks like the owner, it's refused outright.
  2. Company cost is measured for every adjustment (goodwill credits, and
     reversals that hand back fee revenue), in USD.
  3. Owner sign-off: the owner (super admin) must be the requester or the
     approver when any limit is crossed:
        - amount above `owner_approval_above_usd` (or no USD rate to measure it)
        - company cost above `goodwill_max_usd` for one adjustment
        - the requester's company cost in 24h above `maker_daily_company_cost_usd`
        - the customer's company cost in 30 days above `customer_30d_company_cost_usd`
  4. Only the owner can change these limits; every change is audited.
  5. Customers are notified of every adjustment, and the monitoring report
     shows every adjustment with who asked, who approved, and repeat patterns.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.admin import AdminUser
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.platform import ApprovalRequest
from app.models.revenue import PricingSetting
from app.models.user import User

KEY = "adjustment_controls"
DEFAULTS: dict[str, int] = {
    "owner_approval_above_usd": 250,
    "goodwill_max_usd": 50,
    "maker_daily_company_cost_usd": 200,
    "customer_30d_company_cost_usd": 100,
}
LABELS = {
    "owner_approval_above_usd": "Owner must approve any adjustment above (USD)",
    "goodwill_max_usd": "Company-paid credit per adjustment without owner (USD)",
    "maker_daily_company_cost_usd": "Company-paid credits one admin can request per 24h without owner (USD)",
    "customer_30d_company_cost_usd": "Company-paid credits to one customer per 30 days without owner (USD)",
}


def role_of(admin: AdminUser | None) -> str | None:
    if admin is None:
        return None
    return str(getattr(admin.role, "value", admin.role))


def is_owner(admin: AdminUser | None) -> bool:
    return role_of(admin) == "super_admin"


async def get_controls(db: AsyncSession) -> dict:
    row = await db.get(PricingSetting, KEY)
    return {**DEFAULTS, **(row.value if row else {})}


async def set_controls(db: AsyncSession, ctx, changes: dict) -> dict:
    if not is_owner(ctx.admin):
        raise ApiError("Only the owner can change adjustment limits", status_code=403)
    clean = {}
    for k, v in changes.items():
        if k not in DEFAULTS:
            raise ApiError(f"Unknown limit {k}")
        try:
            clean[k] = int(v)
        except (TypeError, ValueError) as e:
            raise ApiError(f"{k} must be a whole number") from e
        if clean[k] < 0:
            raise ApiError(f"{k} can't be negative")
    row = await db.get(PricingSetting, KEY, with_for_update=True)
    before = {**DEFAULTS, **(row.value if row else {})}
    if row is None:
        row = PricingSetting(key=KEY, value={})
        db.add(row)
    row.value = {**(row.value or {}), **clean}
    row.updated_by = ctx.admin.email
    await db.flush()
    after = {**DEFAULTS, **row.value}
    await ctx.audit(db, "adjustment_controls.updated", target_type="setting", target_id=KEY,
                    details={"before": before, "after": after})
    return after


async def to_usd(db: AsyncSession, amount: Decimal, currency: str) -> Decimal | None:
    from app.network.settlement import rate

    r = await rate(db, currency, "USD")
    return (amount * r).quantize(Decimal("0.01")) if r else None


async def company_cost(db: AsyncSession, p: dict) -> Decimal:
    """What this adjustment costs BukkaPay, in the wallet currency."""
    if p["source"] == "goodwill":
        return Decimal(p["amount"])
    if p["source"] != "reversal":
        return Decimal(0)
    entry = (await db.execute(select(JournalEntry).where(JournalEntry.reference == p["journal_reference"]))
             ).scalar_one_or_none()
    if entry is None:
        return Decimal(0)
    rows = (await db.execute(select(LedgerAccount.type, func.sum(JournalLine.credit - JournalLine.debit))
                             .join(JournalLine, JournalLine.account_id == LedgerAccount.id)
                             .where(JournalLine.entry_id == entry.id).group_by(LedgerAccount.type))).all()
    # Reversing hands back revenue the entry earned (cost) and un-books
    # expense it recorded (saving). Net credit on both: revenue earned is a
    # credit, expense booked is a debit (negative), so the sum is the cost.
    cost = sum((Decimal(net or 0) for typ, net in rows if typ in ("revenue", "expense")), Decimal(0))
    return max(cost, Decimal(0))


def _norm(s: str | None) -> str:
    return "".join(ch for ch in (s or "").lower() if ch.isalnum())


def looks_like(admin: AdminUser | None, user: User) -> bool:
    if admin is None:
        return False
    same_name = _norm(admin.name) and _norm(admin.name) == _norm(user.name)
    same_mail = _norm(admin.email.split("@")[0]) and _norm(admin.email.split("@")[0]) == _norm((user.email or "").split("@")[0])
    return bool(same_name or same_mail)


async def _usd_sum(db: AsyncSession, rows) -> Decimal:
    total = Decimal(0)
    for p in rows:
        total += Decimal(str((p.get("controls") or {}).get("company_cost_usd") or 0))
    return total


async def assess(db: AsyncSession, ctx, p: dict, user: User) -> dict:
    """At request time: conflict check and the owner-approval flags."""
    if looks_like(ctx.admin, user):
        raise ApiError("This wallet appears to belong to you. Another admin must file it, and the owner must approve it.",
                       status_code=403)
    owner = await _owner(db)
    if owner is not None and looks_like(owner, user):
        raise ApiError("Adjustments to the owner's own wallet are not allowed", status_code=403)
    limits = await get_controls(db)
    ccy = p["currency"]
    amount = Decimal(p["amount"]) if p.get("amount") else await _reversal_amount(db, p)
    cost = await company_cost(db, p)
    amount_usd, cost_usd = await to_usd(db, amount, ccy), await to_usd(db, cost, ccy)
    why: list[str] = []
    if amount_usd is None or (cost and cost_usd is None):
        why.append(f"no USD rate for {ccy}")
    if amount_usd is not None and amount_usd > limits["owner_approval_above_usd"]:
        why.append(f"amount USD {amount_usd} is above USD {limits['owner_approval_above_usd']}")
    if cost_usd and cost_usd > limits["goodwill_max_usd"]:
        why.append(f"company cost USD {cost_usd} is above USD {limits['goodwill_max_usd']}")
    if cost_usd:
        since = datetime.now(UTC) - timedelta(hours=24)
        mine = (await db.execute(select(ApprovalRequest.payload).where(
            ApprovalRequest.action == "ledger.adjustment", ApprovalRequest.requested_by == (ctx.admin.id if ctx.admin else None),
            ApprovalRequest.status.in_(("pending", "executed")), ApprovalRequest.created_at >= since))).scalars().all()
        if await _usd_sum(db, mine) + cost_usd > limits["maker_daily_company_cost_usd"]:
            why.append(f"your company-paid credits in 24h would exceed USD {limits['maker_daily_company_cost_usd']}")
        since30 = datetime.now(UTC) - timedelta(days=30)
        theirs = (await db.execute(select(ApprovalRequest.payload).where(
            ApprovalRequest.action == "ledger.adjustment", ApprovalRequest.status.in_(("pending", "executed")),
            ApprovalRequest.created_at >= since30,
            ApprovalRequest.payload["wallet_id"].astext == user.wallet_id))).scalars().all()
        if await _usd_sum(db, theirs) + cost_usd > limits["customer_30d_company_cost_usd"]:
            why.append(f"this customer's company-paid credits in 30 days would exceed USD {limits['customer_30d_company_cost_usd']}")
    return {"amount": str(amount), "amount_usd": str(amount_usd) if amount_usd is not None else None,
            "company_cost": str(cost), "company_cost_usd": str(cost_usd) if cost_usd is not None else None,
            "requires_owner": bool(why), "why": why}


async def check_approver(db: AsyncSession, ctx, req: ApprovalRequest) -> None:
    """At approval time, before anything executes."""
    p = req.payload or {}
    user = (await db.execute(select(User).where(User.wallet_id == p.get("wallet_id")))).scalar_one_or_none()
    if user is not None and looks_like(ctx.admin, user):
        raise ApiError("This wallet appears to belong to you, so you can't approve it", status_code=403)
    controls = p.get("controls") or {}
    if controls.get("requires_owner"):
        maker = await db.get(AdminUser, req.requested_by) if req.requested_by else None
        if not (is_owner(ctx.admin) or is_owner(maker)):
            raise ApiError("The owner must approve this adjustment: " + "; ".join(controls.get("why") or []),
                           status_code=403)


async def _owner(db: AsyncSession) -> AdminUser | None:
    return (await db.execute(select(AdminUser).where(AdminUser.role == "super_admin"))).scalars().first()


async def _reversal_amount(db: AsyncSession, p: dict) -> Decimal:
    entry = (await db.execute(select(JournalEntry).where(JournalEntry.reference == p.get("journal_reference")))
             ).scalar_one_or_none()
    if entry is None:
        return Decimal(0)
    total = (await db.execute(select(func.coalesce(func.sum(JournalLine.debit), 0))
                              .where(JournalLine.entry_id == entry.id))).scalar_one()
    return Decimal(total)


async def report(db: AsyncSession, *, days: int = 30) -> dict:
    """Every adjustment in the window, with makers, checkers and red flags."""
    since = datetime.now(UTC) - timedelta(days=days)
    reqs = (await db.execute(select(ApprovalRequest).where(ApprovalRequest.action == "ledger.adjustment",
                                                           ApprovalRequest.created_at >= since)
                             .order_by(ApprovalRequest.created_at.desc()))).scalars().all()
    admins = {a.id: a for a in (await db.execute(select(AdminUser))).scalars()}
    name = lambda i: admins[i].email if i in admins else ("master key" if i is None else str(i))  # noqa: E731
    pairs: dict[tuple, int] = {}
    customers: dict[str, int] = {}
    items = []
    for r in reqs:
        p = r.payload or {}
        c = p.get("controls") or {}
        if r.status == "executed":
            pairs[(r.requested_by, r.decided_by)] = pairs.get((r.requested_by, r.decided_by), 0) + 1
            customers[p.get("wallet_id", "?")] = customers.get(p.get("wallet_id", "?"), 0) + 1
        items.append({"id": str(r.id), "status": r.status, "createdAt": r.created_at.isoformat(),
                      "walletId": p.get("wallet_id"), "holder": p.get("holder_name"), "source": p.get("source"),
                      "direction": p.get("direction"), "currency": p.get("currency"),
                      "amount": c.get("amount") or p.get("amount"), "companyCostUsd": c.get("company_cost_usd"),
                      "ownerRequired": bool(c.get("requires_owner")), "requestedBy": name(r.requested_by),
                      "approvedBy": name(r.decided_by) if r.decided_by else None, "reason": r.reason})
    flags = [f"{name(m)} → {name(c)} approved each other's adjustments {n} times" for (m, c), n in pairs.items() if n >= 3]
    flags += [f"Wallet {w} was adjusted {n} times" for w, n in customers.items() if n >= 3]
    executed_cost = sum(Decimal(i["companyCostUsd"] or 0) for i in items if i["status"] == "executed")
    return {"days": days, "items": items, "flags": flags, "companyCostUsd": f"{executed_cost:.2f}",
            "limits": await get_controls(db), "labels": LABELS}
