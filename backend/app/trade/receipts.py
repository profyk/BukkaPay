"""AfCFTA Trade & Payment Receipts: tamper-evident, hash-chained.

Each receipt's payload is canonical JSON (sorted keys, no spaces) and
includes the previous receipt's hash. `payload_sha256` = SHA-256 of that
JSON. Receipts are append-only in the database; anyone can verify one by
recomputing its hash and checking it links to its predecessor.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trade import TradeReceipt

_LOCK_KEY = 7_311_001  # pg advisory lock: one receipt issued at a time, so the chain never forks


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def digest(payload: dict) -> str:
    return hashlib.sha256(canonical(payload).encode("utf-8")).hexdigest()


async def issue(db: AsyncSession, *, invoice=None, contract=None, entry, buyer, merchant, kind: str,
                amount, currency: str, buyer_amount=None, buyer_currency: str | None = None,
                fx_rate=None, fee=None) -> TradeReceipt:
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})
    last = (await db.execute(select(TradeReceipt).order_by(TradeReceipt.sequence.desc()).limit(1))).scalar_one_or_none()
    seq = (last.sequence + 1) if last else 1
    now = datetime.now(UTC)
    number = f"BKR-{now.year}-{seq:06d}"
    payload = {
        "receipt": number,
        "sequence": seq,
        "issuedAt": now.isoformat(),
        "kind": kind,  # instant_payment | escrow_funded | escrow_released | escrow_refunded
        "buyer": {"name": buyer.name, "country": buyer.residence_country, "kycLevel": buyer.kyc_level,
                  "accountId": str(buyer.id)},
        "seller": {"name": merchant.business_name, "country": merchant.country_code,
                   "verification": merchant.kyb_status, "merchantId": str(merchant.id)},
        "invoice": None if invoice is None else {
            "reference": invoice.reference, "currency": invoice.currency, "subtotal": f"{invoice.subtotal:.2f}",
            "tax": f"{invoice.tax_total:.2f}", "total": f"{invoice.total:.2f}", "incoterm": invoice.incoterm,
        },
        "escrow": None if contract is None else {"reference": contract.reference, "status": contract.status},
        "amount": f"{amount:.2f}",
        "currency": currency,
        "fee": None if fee is None else f"{fee:.2f}",
        "paidFrom": None if buyer_currency is None else {"currency": buyer_currency, "amount": f"{buyer_amount:.2f}",
                                                         "rate": str(fx_rate)},
        "ledgerReference": entry.reference,
        "previousHash": last.payload_sha256 if last else None,
    }
    receipt = TradeReceipt(
        receipt_number=number, sequence=seq, invoice_id=invoice.id if invoice else None,
        escrow_contract_id=contract.id if contract else None, journal_entry_id=entry.id,
        payload=payload, payload_sha256=digest(payload), previous_sha256=payload["previousHash"], issued_at=now,
    )
    db.add(receipt)
    await db.flush()
    return receipt


async def verify(db: AsyncSession, number: str) -> dict:
    r = (await db.execute(select(TradeReceipt).where(TradeReceipt.receipt_number == number))).scalar_one_or_none()
    if r is None:
        return {"receipt": number, "found": False, "valid": False}
    intact = digest(r.payload) == r.payload_sha256
    linked = True
    if r.sequence > 1:
        prev = (await db.execute(select(TradeReceipt).where(TradeReceipt.sequence == r.sequence - 1))).scalar_one_or_none()
        linked = prev is not None and prev.payload_sha256 == r.previous_sha256
    return {"receipt": number, "found": True, "valid": intact and linked, "hashIntact": intact, "chainLinked": linked,
            "sha256": r.payload_sha256, "issuedAt": r.issued_at.isoformat(), "kind": r.payload.get("kind"),
            "amount": r.payload.get("amount"), "currency": r.payload.get("currency"),
            "seller": (r.payload.get("seller") or {}).get("name"), "buyer": (r.payload.get("buyer") or {}).get("name")}


def render_pdf(receipt: TradeReceipt) -> bytes:
    """A one-page, printable receipt for border posts and customs."""
    import io

    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    p = receipt.payload
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    violet, ink, muted = HexColor("#7C3AED"), HexColor("#1A1A2E"), HexColor("#6B7280")
    c.setFillColor(violet)
    c.rect(0, h - 90, w, 90, stroke=0, fill=1)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(40, h - 50, "BukkaPay")
    c.setFont("Helvetica", 11)
    c.drawString(40, h - 70, "AfCFTA Trade & Payment Receipt")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(w - 40, h - 50, p["receipt"])
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 40, h - 68, p["issuedAt"][:19].replace("T", " ") + " UTC")

    y = h - 130

    def row(label: str, value: str, bold: bool = False):
        nonlocal y
        c.setFillColor(muted)
        c.setFont("Helvetica", 9)
        c.drawString(40, y, label)
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11)
        c.drawString(190, y, value)
        y -= 22

    kinds = {"instant_payment": "Instant supplier payment", "escrow_funded": "Escrow funded (held by BukkaPay)",
             "escrow_released": "Escrow released to seller", "escrow_refunded": "Escrow refunded to buyer"}
    row("Type", kinds.get(p["kind"], p["kind"]), bold=True)
    row("Buyer", f"{p['buyer']['name']} ({p['buyer']['country'] or '—'}, KYC level {p['buyer']['kycLevel']})")
    row("Seller", f"{p['seller']['name']} ({p['seller']['country'] or '—'}, verification {p['seller']['verification']})")
    if p.get("invoice"):
        inv = p["invoice"]
        row("Invoice", f"{inv['reference']} · {inv['currency']} {inv['total']}" + (f" · {inv['incoterm']}" if inv.get("incoterm") else ""))
    if p.get("escrow"):
        row("Escrow", p["escrow"]["reference"])
    row("Amount", f"{p['currency']} {p['amount']}", bold=True)
    if p.get("fee"):
        row("Fee", f"{p['currency']} {p['fee']}")
    if p.get("paidFrom"):
        pf = p["paidFrom"]
        row("Paid from", f"{pf['currency']} {pf['amount']} at 1 {pf['currency']} = {pf['rate']} {p['currency']}")
    row("Ledger reference", p["ledgerReference"])

    y -= 10
    c.setFillColor(muted)
    c.setFont("Helvetica", 8)
    c.drawString(40, y, "Integrity (SHA-256):")
    c.setFont("Courier", 8)
    c.drawString(40, y - 12, receipt.payload_sha256)
    c.setFont("Helvetica", 8)
    c.drawString(40, y - 30, "Previous receipt:")
    c.setFont("Courier", 8)
    c.drawString(40, y - 42, receipt.previous_sha256 or "— (first receipt)")
    c.setFont("Helvetica", 8)
    c.drawString(40, 60, f"Verify this receipt: https://api.bukkapay.com/api/public/trade-receipts/{p['receipt']}/verify")
    c.drawString(40, 46, "BukkaPay provides payment technology; funds are safeguarded by licensed local institutions.")
    c.showPage()
    c.save()
    return buf.getvalue()
