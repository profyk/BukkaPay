"""Admin: trade escrow dispute desk and treasury safeguarding endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.ledger import reserves
from app.models.ledger import CustodianBalanceSnapshot
from app.models.merchant import Merchant
from app.models.platform import Custodian
from app.models.trade import EscrowContract, EscrowEvent, TradeInvoice
from app.models.user import User
from app.schemas.base import CamelModel
from app.trade import service as trade

router = APIRouter(tags=["admin-trade"])


async def _row(db, c: EscrowContract, *, events: bool = False) -> dict:
    buyer = await db.get(User, c.buyer_user_id)
    merchant = await db.get(Merchant, c.merchant_id)
    inv = await db.get(TradeInvoice, c.invoice_id) if c.invoice_id else None
    out = {
        "reference": c.reference, "status": c.status, "currency": c.currency, "amount": f"{c.amount:.2f}",
        "fee": f"{c.fee_amount:.2f}", "feeRate": str(c.fee_rate), "releaseCondition": c.release_condition,
        "autoReleaseAt": c.auto_release_at.isoformat() if c.auto_release_at else None,
        "buyer": {"id": str(buyer.id), "name": buyer.name, "email": buyer.email, "kycLevel": buyer.kyc_level} if buyer else None,
        "seller": {"id": str(merchant.id), "name": merchant.business_name, "country": merchant.country_code,
                   "kybStatus": merchant.kyb_status} if merchant else None,
        "invoice": inv.reference if inv else None, "disputeReason": c.dispute_reason,
        "disputedAt": c.disputed_at.isoformat() if c.disputed_at else None, "resolvedBy": c.resolved_by,
        "resolutionNote": c.resolution_note, "createdAt": c.created_at.isoformat(),
    }
    if events:
        out["events"] = [{"event": e.event, "actor": e.actor_type, "actorId": e.actor_id, "note": e.note,
                          "at": e.created_at.isoformat()} for e in (await db.execute(
                              select(EscrowEvent).where(EscrowEvent.contract_id == c.id)
                              .order_by(EscrowEvent.created_at))).scalars()]
    return out


@router.get("/trade/escrows")
async def list_escrows(status: str | None = Query(default=None), _=Depends(require("compliance.view")),
                       db: AsyncSession = Depends(get_db)) -> dict:
    stmt = select(EscrowContract)
    if status:
        stmt = stmt.where(EscrowContract.status == status)
    rows = list((await db.execute(stmt.order_by(EscrowContract.created_at.desc()).limit(200))).scalars())
    counts = dict((await db.execute(select(EscrowContract.status, func.count()).group_by(EscrowContract.status))).all())
    held = [{"currency": c, "amount": f"{a:.2f}"} for c, a in (await db.execute(
        select(EscrowContract.currency, func.sum(EscrowContract.amount))
        .where(EscrowContract.status.in_(("funded", "disputed"))).group_by(EscrowContract.currency))).all()]
    return {"counts": counts, "held": held, "escrows": [await _row(db, c) for c in rows]}


@router.get("/trade/escrows/{reference}")
async def escrow_detail(reference: str, _=Depends(require("compliance.view")), db: AsyncSession = Depends(get_db)) -> dict:
    return await _row(db, await trade.get_contract(db, reference), events=True)


class ResolveIn(CamelModel):
    outcome: str = Field(pattern="^(release|refund)$")
    note: str = Field(min_length=10, max_length=2000)


@router.post("/trade/escrows/{reference}/resolve")
async def resolve(reference: str, body: ResolveIn, ctx: AdminContext = Depends(require("compliance.manage")),
                  db: AsyncSession = Depends(get_db)) -> dict:
    """Mediate a disputed escrow: pay the seller or refund the buyer."""
    c = await trade.get_contract(db, reference, lock=True)
    if c.status != "disputed":
        raise ApiError("Only disputed escrows are resolved here", status_code=409)
    who = ctx.admin.email if ctx.admin else "master_key"
    if body.outcome == "release":
        c, receipt = await trade.release(db, c, actor_type="admin", actor_id=who, event="resolved_release", note=body.note)
    else:
        c, receipt = await trade.refund(db, c, actor_type="admin", actor_id=who, event="resolved_refund", note=body.note)
    return {**(await _row(db, c, events=True)), "receipt": receipt.receipt_number}


# ─── treasury: safeguarding ─────────────────────────────────────────────────


@router.get("/treasury/reserves")
async def proof_of_reserve(_=Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await reserves.proof_of_reserve(db)


class SnapshotIn(CamelModel):
    custodian_id: str
    currency: str = Field(min_length=3, max_length=3)
    balance: str
    as_of: datetime
    source: str = Field(default="statement", pattern="^(statement|api|manual)$")
    reference: str | None = None


@router.post("/treasury/custodian-balances", status_code=201)
async def record_custodian_balance(body: SnapshotIn, ctx: AdminContext = Depends(require("reconciliation.run")),
                                   db: AsyncSession = Depends(get_db)) -> dict:
    """Record what a safeguarding custodian reports holding (statement or API)."""
    try:
        cid = uuid.UUID(body.custodian_id)
    except ValueError as e:
        raise ApiError("Custodian not found", status_code=404) from e
    if await db.get(Custodian, cid) is None:
        raise ApiError("Custodian not found", status_code=404)
    from decimal import Decimal, InvalidOperation

    try:
        balance = Decimal(body.balance.strip())
    except InvalidOperation as e:
        raise ApiError("Invalid balance") from e
    if not balance.is_finite() or balance < 0 or balance != balance.quantize(Decimal("0.01")):
        raise ApiError("Balance must be zero or more, with at most 2 decimals")
    snap = CustodianBalanceSnapshot(custodian_id=cid, currency=body.currency.upper(), balance=balance,
                                    as_of=body.as_of, source=body.source, reference=body.reference,
                                    recorded_by=ctx.admin.email if ctx.admin else "master_key")
    db.add(snap)
    await db.flush()
    return {"id": str(snap.id), "custodianId": body.custodian_id, "currency": snap.currency,
            "balance": f"{snap.balance:.2f}", "asOf": snap.as_of.isoformat()}


# ─── AfCFTA trade report ─────────────────────────────────────────────────────

REPORT_COLUMNS = [
    "invoice", "status", "created_at", "seller", "seller_country", "buyer", "buyer_country", "currency",
    "invoice_total", "payment_mode", "incoterm", "line", "description", "hs_code", "origin_country",
    "quantity", "unit", "unit_price", "line_total", "escrow", "escrow_status", "escrow_fee",
]


@router.get("/trade/report.csv")
async def trade_report(start: str | None = Query(default=None, alias="from"), end: str | None = Query(default=None, alias="to"),
                       ctx: AdminContext = Depends(require("compliance.view")), db: AsyncSession = Depends(get_db)):
    """One row per invoice line: who traded what (HS code, origin) across which
    border, how it was paid, and the escrow outcome — for regulators, AfCFTA
    reporting and trade-finance partners. Dates are ISO (YYYY-MM-DD), UTC."""
    import csv
    import io

    from fastapi.responses import Response

    from app.models.trade import TradeInvoiceItem

    stmt = select(TradeInvoice).order_by(TradeInvoice.created_at)
    try:
        if start:
            stmt = stmt.where(TradeInvoice.created_at >= datetime.fromisoformat(start))
        if end:
            stmt = stmt.where(TradeInvoice.created_at < datetime.fromisoformat(end))
    except ValueError as e:
        raise ApiError("Dates must look like 2026-11-01") from e
    invoices = list((await db.execute(stmt.limit(50000))).scalars())
    ids = [i.id for i in invoices]
    items: dict = {}
    escrows: dict = {}
    sellers: dict = {}
    if ids:
        for it in (await db.execute(select(TradeInvoiceItem).where(TradeInvoiceItem.invoice_id.in_(ids))
                                    .order_by(TradeInvoiceItem.line_no))).scalars():
            items.setdefault(it.invoice_id, []).append(it)
        for e in (await db.execute(select(EscrowContract).where(EscrowContract.invoice_id.in_(ids)))).scalars():
            escrows[e.invoice_id] = e
        for m in (await db.execute(select(Merchant).where(Merchant.id.in_({i.merchant_id for i in invoices})))).scalars():
            sellers[m.id] = m.business_name

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(REPORT_COLUMNS)
    for inv in invoices:
        esc = escrows.get(inv.id)
        head = [inv.reference, inv.status, inv.created_at.isoformat(), sellers.get(inv.merchant_id, ""), inv.seller_country,
                inv.buyer_name, inv.buyer_country or "", inv.currency, f"{inv.total:.2f}", inv.payment_mode, inv.incoterm or ""]
        tail = [esc.reference if esc else "", esc.status if esc else "", f"{esc.fee_amount:.2f}" if esc else ""]
        for it in items.get(inv.id) or [None]:
            line = ([it.line_no, it.description, it.hs_code or "", it.origin_country or "", f"{it.quantity.normalize():f}",
                     it.unit or "", f"{it.unit_price:.2f}", f"{(it.quantity * it.unit_price):.2f}"]
                    if it else ["", "", "", "", "", "", "", ""])
            w.writerow(head + line + tail)
    await ctx.audit(db, "trade.report.export", details={"from": start, "to": end, "invoices": len(invoices)})
    name = f"bukkapay-trade-report-{start or 'all'}-{end or 'now'}.csv"
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
