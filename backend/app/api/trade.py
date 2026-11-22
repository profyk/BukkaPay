"""Trade & swaps API.

Buyers (personal accounts)   /api/trade/...          pay invoices, escrow, receipts
Suppliers (business)         /api/merchants/{id}/trade-invoices, /escrows
Anyone                       /api/public/trade-invoices/{ref}, /api/public/trade-receipts/{n}/verify
Customers                    /api/swap/quote, /api/swap
Admin                        app.api.admin.trade
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query, Response
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import idempotency, posting
from app.models.trade import EscrowContract, EscrowEvent, TradeInvoice, TradeReceipt
from app.schemas.base import CamelModel
from app.services import pin_service, swap_service
from app.trade import receipts
from app.trade import service as trade

router = APIRouter(tags=["trade"])


def _invoice_out(inv: TradeInvoice, items=None, merchant=None) -> dict:
    out = {
        "reference": inv.reference, "status": inv.status, "currency": inv.currency, "subtotal": f"{inv.subtotal:.2f}",
        "taxTotal": f"{inv.tax_total:.2f}", "total": f"{inv.total:.2f}", "paymentMode": inv.payment_mode,
        "buyerName": inv.buyer_name, "buyerCountry": inv.buyer_country, "sellerCountry": inv.seller_country,
        "incoterm": inv.incoterm, "notes": inv.notes, "dueAt": inv.due_at.isoformat() if inv.due_at else None,
        "expiresAt": inv.expires_at.isoformat() if inv.expires_at else None, "createdAt": inv.created_at.isoformat(),
    }
    if merchant is not None:
        out["seller"] = {"name": merchant.business_name, "country": merchant.country_code,
                         "verified": merchant.kyb_status == "approved"}
    if items is not None:
        out["items"] = [{"lineNo": i.line_no, "description": i.description, "hsCode": i.hs_code,
                         "originCountry": i.origin_country, "quantity": str(i.quantity.normalize()), "unit": i.unit,
                         "unitPrice": str(i.unit_price.normalize()), "lineTotal": f"{i.line_total:.2f}"} for i in items]
    return out


def _contract_out(c: EscrowContract, events=None) -> dict:
    out = {
        "reference": c.reference, "status": c.status, "currency": c.currency, "amount": f"{c.amount:.2f}",
        "feeRate": str(c.fee_rate), "fee": f"{c.fee_amount:.2f}", "sellerReceives": f"{c.amount - c.fee_amount:.2f}",
        "paidFrom": None if not c.buyer_currency else {"currency": c.buyer_currency, "amount": f"{c.buyer_amount:.2f}",
                                                        "rate": str(c.fx_rate)},
        "releaseCondition": c.release_condition, "autoReleaseAt": c.auto_release_at.isoformat() if c.auto_release_at else None,
        "disputeReason": c.dispute_reason, "resolutionNote": c.resolution_note, "createdAt": c.created_at.isoformat(),
    }
    if events is not None:
        out["events"] = [{"event": e.event, "actor": e.actor_type, "note": e.note, "at": e.created_at.isoformat()}
                         for e in events]
    return out


async def _receipts_for(db, *, invoice_id=None, contract_id=None) -> list[dict]:
    conds = []
    if invoice_id:
        conds.append(TradeReceipt.invoice_id == invoice_id)
    if contract_id:
        conds.append(TradeReceipt.escrow_contract_id == contract_id)
    rows = (await db.execute(select(TradeReceipt).where(or_(*conds)).order_by(TradeReceipt.sequence))).scalars()
    return [{"number": r.receipt_number, "kind": r.payload.get("kind"), "issuedAt": r.issued_at.isoformat(),
             "sha256": r.payload_sha256} for r in rows]


# ─── public ─────────────────────────────────────────────────────────────────


@router.get("/api/public/trade-invoices/{reference}", dependencies=[Depends(rate_limit("trade-public", 60, 300))])
async def public_invoice(reference: str, db: AsyncSession = Depends(get_db)) -> dict:
    from app.models.merchant import Merchant

    inv = await trade.get_invoice(db, reference)
    if inv.status in ("draft", "cancelled"):
        raise ApiError("Invoice not found", status_code=404)
    merchant = await db.get(Merchant, inv.merchant_id)
    out = _invoice_out(inv, await trade.invoice_items(db, inv), merchant)
    out.pop("buyerName", None)  # the payment link shows the seller and items, not the buyer's details
    return out


@router.get("/api/public/trade-receipts/{number}/verify", dependencies=[Depends(rate_limit("trade-public", 60, 300))])
async def verify_receipt(number: str, db: AsyncSession = Depends(get_db)) -> dict:
    return await receipts.verify(db, number.upper())


# ─── buyers ─────────────────────────────────────────────────────────────────


class PayInvoiceIn(CamelModel):
    from_card_id: str
    pin: str | None = None
    mode: str = Field(pattern="^(instant|escrow)$")
    release_condition: str = "buyer_confirmation"


@router.post("/api/trade/invoices/{reference}/pay", status_code=201,
             dependencies=[Depends(rate_limit("payment", 30, 60))])
async def pay_invoice(reference: str, body: PayInvoiceIn, user_id=Depends(get_current_user_id),
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                      db: AsyncSession = Depends(get_db)) -> dict:
    if not idempotency_key:
        raise ApiError("An Idempotency-Key header is required", status_code=400)
    await pin_service.verify_pin(db, user_id, body.pin)
    async with idempotency.guard(db, scope=f"trade-pay:{user_id}", key=idempotency_key,
                                 payload={"ref": reference.upper(), **body.model_dump(exclude={"pin"})}) as g:
        if g.replay is not None:
            return g.replay
        if body.mode == "instant":
            inv, receipt = await trade.pay_instant(db, user_id, reference, from_card_id=body.from_card_id)
            result = {"mode": "instant", "invoice": _invoice_out(inv), "receipt": receipt.receipt_number}
        else:
            c = await trade.fund_escrow(db, user_id, reference, from_card_id=body.from_card_id,
                                        idempotency_key=idempotency_key, release_condition=body.release_condition)
            result = {"mode": "escrow", "escrow": _contract_out(c),
                      "receipts": await _receipts_for(db, contract_id=c.id)}
        g.store(result)
    return result


@router.get("/api/trade/escrows")
async def my_escrows(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(EscrowContract).where(EscrowContract.buyer_user_id == user_id)
                             .order_by(EscrowContract.created_at.desc()).limit(100))).scalars()
    return [_contract_out(c) for c in rows]


async def _my_contract(db, user_id, reference, *, lock=False) -> EscrowContract:
    c = await trade.get_contract(db, reference, lock=lock)
    if c.buyer_user_id != user_id:
        raise ApiError("Escrow not found", status_code=404)
    return c


@router.get("/api/trade/escrows/{reference}")
async def my_escrow(reference: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    c = await _my_contract(db, user_id, reference)
    events = (await db.execute(select(EscrowEvent).where(EscrowEvent.contract_id == c.id)
                               .order_by(EscrowEvent.created_at))).scalars().all()
    return {**_contract_out(c, events), "receipts": await _receipts_for(db, contract_id=c.id)}


class PinIn(CamelModel):
    pin: str | None = None


@router.post("/api/trade/escrows/{reference}/confirm", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def confirm_goods(reference: str, body: PinIn, user_id=Depends(get_current_user_id),
                        db: AsyncSession = Depends(get_db)) -> dict:
    """The buyer confirms they received the goods: the supplier is paid."""
    await pin_service.verify_pin(db, user_id, body.pin)
    c = await _my_contract(db, user_id, reference, lock=True)
    c, receipt = await trade.release(db, c, actor_type="buyer", actor_id=str(user_id), event="buyer_confirmed")
    return {**_contract_out(c), "receipt": receipt.receipt_number}


class DisputeIn(CamelModel):
    reason: str


@router.post("/api/trade/escrows/{reference}/dispute")
async def buyer_dispute(reference: str, body: DisputeIn, user_id=Depends(get_current_user_id),
                        db: AsyncSession = Depends(get_db)) -> dict:
    c = await _my_contract(db, user_id, reference, lock=True)
    return _contract_out(await trade.open_dispute(db, c, actor_type="buyer", actor_id=str(user_id), reason=body.reason))


async def _receipt_for_user(db, user_id, number) -> TradeReceipt:
    from app.models.merchant import Merchant
    from app.services import merchant_service

    r = (await db.execute(select(TradeReceipt).where(TradeReceipt.receipt_number == number.upper()))).scalar_one_or_none()
    if r is None:
        raise ApiError("Receipt not found", status_code=404)
    buyer_id = (r.payload.get("buyer") or {}).get("accountId")
    merchant_id = (r.payload.get("seller") or {}).get("merchantId")
    if buyer_id == str(user_id):
        return r
    m = await db.get(Merchant, merchant_id) if merchant_id else None
    if m is not None and (m.user_id == user_id or await merchant_service.get_staff_membership(db, m.id, user_id)):
        return r
    raise ApiError("Receipt not found", status_code=404)


@router.get("/api/trade/receipts/{number}")
async def receipt_json(number: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    r = await _receipt_for_user(db, user_id, number)
    return {"number": r.receipt_number, "payload": r.payload, "sha256": r.payload_sha256,
            "previousSha256": r.previous_sha256}


@router.get("/api/trade/receipts/{number}/pdf")
async def receipt_pdf(number: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> Response:
    r = await _receipt_for_user(db, user_id, number)
    return Response(receipts.render_pdf(r), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{r.receipt_number}.pdf"'})


# ─── suppliers (business accounts) ──────────────────────────────────────────


class ItemIn(CamelModel):
    description: str
    quantity: str
    unit_price: str
    unit: str | None = None
    hs_code: str | None = None
    origin_country: str | None = None


class InvoiceIn(CamelModel):
    buyer_name: str
    buyer_email: str | None = None
    buyer_phone: str | None = None
    buyer_country: str | None = None
    currency: str
    items: list[ItemIn]
    tax_total: str = "0"
    payment_mode: str = "either"
    incoterm: str | None = None
    notes: str | None = None
    due_days: int | None = Field(default=None, ge=1, le=365)
    expires_days: int = Field(default=30, ge=1, le=365)


async def _merchant_access(db, merchant_id, user_id, *, manager=False):
    from app.api.merchant import _accessible_merchant

    return await _accessible_merchant(db, merchant_id, user_id, require_manager=manager)


@router.post("/api/merchants/{merchant_id}/trade-invoices", status_code=201)
async def create_trade_invoice(merchant_id: str, body: InvoiceIn, user_id=Depends(get_current_user_id),
                               db: AsyncSession = Depends(get_db)) -> dict:
    merchant = await _merchant_access(db, merchant_id, user_id, manager=True)
    inv = await trade.create_invoice(
        db, merchant, created_by=user_id, buyer_name=body.buyer_name, currency=body.currency,
        items=[i.model_dump(by_alias=True) for i in body.items], tax_total=body.tax_total,
        buyer_email=body.buyer_email, buyer_phone=body.buyer_phone, buyer_country=body.buyer_country,
        payment_mode=body.payment_mode, incoterm=body.incoterm, notes=body.notes, due_days=body.due_days,
        expires_days=body.expires_days)
    from app.core.config import get_settings

    pay_url = f"{get_settings().app_url.rstrip('/')}/trade/{inv.reference}"
    return {**_invoice_out(inv, await trade.invoice_items(db, inv), merchant), "payUrl": pay_url}


@router.get("/api/merchants/{merchant_id}/trade-invoices")
async def list_trade_invoices(merchant_id: str, status: str | None = Query(default=None),
                              user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[dict]:
    merchant = await _merchant_access(db, merchant_id, user_id)
    stmt = select(TradeInvoice).where(TradeInvoice.merchant_id == merchant.id)
    if status:
        stmt = stmt.where(TradeInvoice.status == status)
    rows = (await db.execute(stmt.order_by(TradeInvoice.created_at.desc()).limit(200))).scalars()
    return [_invoice_out(i) for i in rows]


@router.post("/api/merchants/{merchant_id}/trade-invoices/{reference}/cancel")
async def cancel_trade_invoice(merchant_id: str, reference: str, user_id=Depends(get_current_user_id),
                               db: AsyncSession = Depends(get_db)) -> dict:
    merchant = await _merchant_access(db, merchant_id, user_id, manager=True)
    inv = await trade.get_invoice(db, reference, lock=True)
    if inv.merchant_id != merchant.id:
        raise ApiError("Invoice not found", status_code=404)
    return _invoice_out(await trade.cancel_invoice(db, inv))


@router.get("/api/merchants/{merchant_id}/escrows")
async def merchant_escrows(merchant_id: str, user_id=Depends(get_current_user_id),
                           db: AsyncSession = Depends(get_db)) -> list[dict]:
    merchant = await _merchant_access(db, merchant_id, user_id)
    rows = (await db.execute(select(EscrowContract).where(EscrowContract.merchant_id == merchant.id)
                             .order_by(EscrowContract.created_at.desc()).limit(200))).scalars()
    return [_contract_out(c) for c in rows]


@router.post("/api/merchants/{merchant_id}/escrows/{reference}/dispute")
async def merchant_dispute(merchant_id: str, reference: str, body: DisputeIn, user_id=Depends(get_current_user_id),
                           db: AsyncSession = Depends(get_db)) -> dict:
    merchant = await _merchant_access(db, merchant_id, user_id, manager=True)
    c = await trade.get_contract(db, reference, lock=True)
    if c.merchant_id != merchant.id:
        raise ApiError("Escrow not found", status_code=404)
    return _contract_out(await trade.open_dispute(db, c, actor_type="merchant", actor_id=str(user_id), reason=body.reason))


# ─── currency swaps ─────────────────────────────────────────────────────────


@router.get("/api/swap/quote")
async def swap_quote(from_currency: str = Query(alias="from"), to_currency: str = Query(alias="to"),
                     amount: str = Query(...), user_id=Depends(get_current_user_id),
                     db: AsyncSession = Depends(get_db)) -> dict:
    q = await swap_service.quote(db, from_currency.upper(), to_currency.upper(), posting.parse_amount(amount))
    return {"from": q.from_currency, "to": q.to_currency, "amount": f"{q.amount:.2f}", "rate": str(q.rate),
            "spreadPercent": str(q.spread_pct), "spread": f"{q.spread:.2f}", "receive": f"{q.receive:.2f}"}


class SwapIn(CamelModel):
    from_card_id: str
    to_currency: str
    amount: str
    expected_receive: str | None = None
    pin: str | None = None


@router.post("/api/swap", status_code=201, dependencies=[Depends(rate_limit("payment", 30, 60))])
async def do_swap(body: SwapIn, user_id=Depends(get_current_user_id),
                  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                  db: AsyncSession = Depends(get_db)) -> dict:
    if not idempotency_key:
        raise ApiError("An Idempotency-Key header is required", status_code=400)
    await pin_service.verify_pin(db, user_id, body.pin)
    async with idempotency.guard(db, scope=f"swap:{user_id}", key=idempotency_key,
                                 payload=body.model_dump(exclude={"pin"})) as g:
        if g.replay is not None:
            return g.replay
        q, entry, target = await swap_service.swap(
            db, user_id, from_card_id=body.from_card_id, to_currency=body.to_currency,
            amount=posting.parse_amount(body.amount),
            expected_receive=Decimal(body.expected_receive) if body.expected_receive else None)
        result = {"from": q.from_currency, "to": q.to_currency, "debited": f"{q.amount:.2f}",
                  "received": f"{q.receive:.2f}", "rate": str(q.rate), "spread": f"{q.spread:.2f}",
                  "toCardId": str(target.id), "ledgerReference": entry.reference}
        g.store(result)
    return result
