"""Merchant platform API (merchant.bukkapay.com): verification (KYB),
dashboard, signed QR codes, checkout links, refunds, settlements, staff
roles, API keys, webhooks, exports — plus the key-authenticated
merchant API for external websites.

Roles: the owner is merchants.user_id. Staff roles: admin (legacy
`manager`), finance, cashier, viewer.
"""

import csv
import hashlib
import io
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.merchants import qr as merchant_qr
from app.merchants import webhooks_out
from app.models.enums import MerchantTransactionStatus, MerchantTransactionType, NotificationType, TransactionType
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant, MerchantTransaction
from app.models.payment_link import PaymentLink
from app.models.platform import MerchantApiKey, MerchantQrCode, MerchantWebhookEndpoint
from app.models.wallet import Transaction, WalletCard
from app.schemas.base import CamelModel
from app.services import merchant_service, notification_service, pin_service

router = APIRouter(prefix="/api", tags=["merchant-platform"])

CAPABILITIES = {
    "view": {"owner", "admin", "manager", "finance", "cashier", "viewer"},
    "collect": {"owner", "admin", "manager", "cashier", "finance"},
    "refund": {"owner", "admin", "manager", "finance"},
    "finance": {"owner", "admin", "manager", "finance"},
    "settings": {"owner", "admin", "manager"},
    "developer": {"owner", "admin", "manager"},
    "owner": {"owner"},
}


async def merchant_access(db: AsyncSession, merchant_id: str, user_id, capability: str) -> tuple[Merchant, str]:
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    if merchant.user_id == user_id:
        role = "owner"
    else:
        staff = await merchant_service.get_staff_membership(db, merchant.id, user_id)
        if staff is None:
            raise ApiError("Forbidden", status_code=403)
        role = str(staff.role.value if hasattr(staff.role, "value") else staff.role)
    if role not in CAPABILITIES[capability]:
        raise ApiError("Your role doesn't allow this", status_code=403)
    return merchant, role


def _money(v) -> str:
    return f"{Decimal(v or 0):.2f}"


# ─── KYB ────────────────────────────────────────────────────────────────────


class Director(CamelModel):
    full_name: str
    id_number: str
    role: str = "director"


class KybDocument(CamelModel):
    type: str  # registration_certificate / proof_of_address / director_id / bank_letter
    url: str


class KybSubmission(CamelModel):
    registration_number: str
    business_address: str
    country_code: str
    business_category: str
    contact_email: str
    contact_phone: str
    directors: list[Director]
    documents: list[KybDocument]


@router.post("/merchants/{merchant_id}/kyb")
async def submit_kyb(merchant_id: str, body: KybSubmission, user_id=Depends(get_current_user_id),
                     db: AsyncSession = Depends(get_db)):
    from app.network import countries

    merchant, _ = await merchant_access(db, merchant_id, user_id, "owner")
    upgrading = merchant.verification_tier == "individual" and merchant.kyb_status == "approved"
    if merchant.kyb_status in ("pending", "approved") and not upgrading:
        raise ApiError(f"Verification is already {merchant.kyb_status}", status_code=409)
    country = await countries.require_operating(db, body.country_code, what="Merchant onboarding")
    if not body.directors:
        raise ApiError("At least one owner/director is required")
    doc_types = {d.type for d in body.documents}
    missing = {"registration_certificate", "proof_of_address", "director_id"} - doc_types
    if missing:
        raise ApiError("Missing documents: " + ", ".join(sorted(missing)))
    merchant.business_reg_number = body.registration_number
    merchant.business_address = body.business_address
    merchant.business_category = body.business_category
    merchant.business_email = body.contact_email
    merchant.business_phone = body.contact_phone
    merchant.country_code = country.code
    merchant.settlement_currency = country.default_currency
    merchant.kyb_details = {
        "directors": [d.model_dump() for d in body.directors],
        "documents": [d.model_dump() for d in body.documents],
    }
    merchant.kyb_status = "pending"
    merchant.kyb_submitted_at = datetime.now(UTC)
    merchant.kyb_rejection_reason = None
    await db.flush()
    return {"kybStatus": merchant.kyb_status, "submittedAt": merchant.kyb_submitted_at.isoformat()}


@router.post("/merchants/{merchant_id}/kyb/individual")
async def verify_individual(merchant_id: str, user_id=Depends(get_current_user_id),
                            db: AsyncSession = Depends(get_db)):
    """Street vendors, tuck shops, individual landlords: no business
    documents. The owner's verified ID (KYC level 2) is the check, and
    collections are capped by the "merchant_individual" limit."""
    merchant, _ = await merchant_access(db, merchant_id, user_id, "owner")
    if merchant.kyb_status == "pending":
        raise ApiError("Business verification is already under review", status_code=409)
    await merchant_service.verify_as_individual(db, merchant)
    return {"kybStatus": merchant.kyb_status, "verificationTier": merchant.verification_tier}


# ─── Dashboard & reporting ─────────────────────────────────────────────────


@router.get("/merchants/{merchant_id}/dashboard")
async def dashboard(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, role = await merchant_access(db, merchant_id, user_id, "view")
    now = datetime.now(UTC)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = day_start.replace(day=1)

    async def total(type_, status, since=None):
        stmt = select(func.coalesce(func.sum(MerchantTransaction.amount), 0), func.count()).where(
            MerchantTransaction.merchant_id == merchant.id, MerchantTransaction.type == type_,
            MerchantTransaction.status == status)
        if since:
            stmt = stmt.where(MerchantTransaction.created_at >= since)
        amount, count = (await db.execute(stmt)).one()
        return Decimal(amount), count

    sales_all, count_all = await total(MerchantTransactionType.PAYMENT, MerchantTransactionStatus.COMPLETED)
    sales_today, count_today = await total(MerchantTransactionType.PAYMENT, MerchantTransactionStatus.COMPLETED,
                                           day_start)
    sales_month, count_month = await total(MerchantTransactionType.PAYMENT, MerchantTransactionStatus.COMPLETED,
                                           month_start)
    pending_amount, pending_count = await total(MerchantTransactionType.PAYMENT, MerchantTransactionStatus.PENDING)
    failed_amount, failed_count = await total(MerchantTransactionType.PAYMENT, MerchantTransactionStatus.FAILED)
    refunds, refund_count = await total(MerchantTransactionType.REFUND, MerchantTransactionStatus.COMPLETED)
    payouts_pending, _ = await total(MerchantTransactionType.WITHDRAWAL, MerchantTransactionStatus.PENDING)
    payouts_done, _ = await total(MerchantTransactionType.WITHDRAWAL, MerchantTransactionStatus.COMPLETED)

    fees_paid = (await db.execute(
        select(func.coalesce(func.sum(JournalLine.credit), 0)).join(JournalEntry).join(
            LedgerAccount, LedgerAccount.id == JournalLine.account_id).where(
            JournalEntry.kind.in_(("merchant_payment", "payment_link_payment")),
            JournalEntry.details["merchant_id"].astext == str(merchant.id),
            LedgerAccount.code.like("revenue:fees:%")))).scalar_one()
    # Balances per currency, straight from the ledger.
    balances = [{"currency": a.currency, "available": _money(a.balance)} for a in (await db.execute(
        select(LedgerAccount).where(LedgerAccount.code.like(f"merchant:{merchant.id}:%")))).scalars()]
    if not balances:
        balances = [{"currency": merchant.settlement_currency, "available": "0.00"}]

    since = day_start - timedelta(days=29)
    daily = (await db.execute(
        select(func.date(MerchantTransaction.created_at), func.sum(MerchantTransaction.amount), func.count())
        .where(MerchantTransaction.merchant_id == merchant.id, MerchantTransaction.created_at >= since,
               MerchantTransaction.type == MerchantTransactionType.PAYMENT,
               MerchantTransaction.status == MerchantTransactionStatus.COMPLETED)
        .group_by(func.date(MerchantTransaction.created_at)).order_by(func.date(MerchantTransaction.created_at))
    )).all()
    recent = (await db.execute(select(MerchantTransaction).where(MerchantTransaction.merchant_id == merchant.id)
                               .order_by(MerchantTransaction.created_at.desc()).limit(10))).scalars().all()
    customers = (await db.execute(select(func.count(func.distinct(MerchantTransaction.payer_id))).where(
        MerchantTransaction.merchant_id == merchant.id))).scalar_one()
    ccy = merchant.settlement_currency
    return {
        "merchant": {"id": str(merchant.id), "businessName": merchant.business_name,
                     "kybStatus": merchant.kyb_status, "verificationTier": merchant.verification_tier,
                     "kybRejectionReason": merchant.kyb_rejection_reason,
                     "country": merchant.country_code, "settlementCurrency": ccy, "role": role,
                     "isActive": merchant.is_active},
        "currency": ccy,
        "totals": {
            "totalSales": _money(sales_all), "transactionCount": count_all,
            "todaySales": _money(sales_today), "todayCount": count_today,
            "monthSales": _money(sales_month), "monthCount": count_month,
            "pendingPayments": _money(pending_amount), "pendingCount": pending_count,
            "failedPayments": _money(failed_amount), "failedCount": failed_count,
            "refunds": _money(refunds), "refundCount": refund_count, "feesPaid": _money(fees_paid),
            "uniqueCustomers": customers,
        },
        "settlement": {"balances": balances, "payoutsPending": _money(payouts_pending),
                       "paidOut": _money(payouts_done)},
        "daily": [{"date": str(d), "sales": _money(a), "count": c} for d, a, c in daily],
        "recent": [_tx(t) for t in recent],
    }


def _tx(t: MerchantTransaction) -> dict:
    return {"id": str(t.id), "type": t.type.value if hasattr(t.type, "value") else t.type,
            "status": t.status.value if hasattr(t.status, "value") else t.status, "amount": _money(t.amount),
            "payerName": t.payer_name, "reference": t.reference, "createdAt": t.created_at.isoformat()}


@router.get("/merchants/{merchant_id}/transactions/search")
async def search_transactions(
    merchant_id: str, q: str | None = Query(default=None), type: str | None = Query(default=None),
    status: str | None = Query(default=None), date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"), page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, le=200), user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    stmt = select(MerchantTransaction).where(MerchantTransaction.merchant_id == merchant.id)
    if q:
        stmt = stmt.where((MerchantTransaction.reference.ilike(f"%{q}%")) |
                          (MerchantTransaction.payer_name.ilike(f"%{q}%")))
    if type:
        stmt = stmt.where(MerchantTransaction.type == type)
    if status:
        stmt = stmt.where(MerchantTransaction.status == status)
    if date_from:
        stmt = stmt.where(MerchantTransaction.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        stmt = stmt.where(MerchantTransaction.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(MerchantTransaction.created_at.desc())
                             .limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"transactions": [_tx(t) for t in rows], "total": total, "page": page}


@router.get("/merchants/{merchant_id}/transactions.csv")
async def export_transactions(merchant_id: str, user_id=Depends(get_current_user_id),
                              db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "finance")
    rows = (await db.execute(select(MerchantTransaction).where(MerchantTransaction.merchant_id == merchant.id)
                             .order_by(MerchantTransaction.created_at))).scalars().all()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["id", "date", "type", "status", "amount", "currency", "payer", "reference"])
    for t in rows:
        d = _tx(t)
        writer.writerow([d["id"], d["createdAt"], d["type"], d["status"], d["amount"],
                         merchant.settlement_currency, d["payerName"], d["reference"]])
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="bukkapay-{merchant.id}.csv"'})


@router.get("/merchants/{merchant_id}/settlements")
async def settlements(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Payouts with their status. Funds are only 'settled' once the payout is
    confirmed; until then they show as pending."""
    merchant, _ = await merchant_access(db, merchant_id, user_id, "finance")
    payouts = (await db.execute(select(MerchantTransaction).where(
        MerchantTransaction.merchant_id == merchant.id,
        MerchantTransaction.type == MerchantTransactionType.WITHDRAWAL).order_by(
        MerchantTransaction.created_at.desc()))).scalars().all()
    entries = {e.details.get("reference"): e for e in (await db.execute(select(JournalEntry).where(
        JournalEntry.kind == "merchant_withdrawal",
        JournalEntry.details["merchant_id"].astext == str(merchant.id)))).scalars()}
    out = []
    for p in payouts:
        entry = entries.get(p.reference)
        fee = Decimal(0)
        if entry is not None:
            fee = sum((line.credit for line in entry.lines if line.credit and line.line_no == 3), Decimal(0))
        out.append({**_tx(p), "fee": _money(fee), "net": _money(p.amount),
                    "settlementStatus": "settled" if p.status == MerchantTransactionStatus.COMPLETED else (
                        "failed" if p.status == MerchantTransactionStatus.FAILED else "pending"),
                    "providerReference": p.reference, "currency": merchant.settlement_currency})
    return out


# ─── QR codes ───────────────────────────────────────────────────────────────


class QrIn(CamelModel):
    kind: str = "static"
    amount: Decimal | None = None
    reference: str | None = None
    label: str | None = None
    expires_in_minutes: int | None = None


def _qr(q: MerchantQrCode) -> dict:
    return {"id": str(q.id), "kind": q.kind, "label": q.label, "amount": _money(q.amount) if q.amount else None,
            "currency": q.currency, "reference": q.reference, "status": q.status,
            "expiresAt": q.expires_at.isoformat() if q.expires_at else None,
            "payload": merchant_qr.payload_for(q), "createdAt": q.created_at.isoformat()}


@router.post("/merchants/{merchant_id}/qr", status_code=201)
async def create_qr(merchant_id: str, body: QrIn, user_id=Depends(get_current_user_id),
                    db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    merchant_service.require_can_transact(merchant)
    if body.kind not in ("static", "dynamic"):
        raise ApiError("kind must be static or dynamic")
    amount = None
    expires = None
    if body.kind == "dynamic":
        if body.amount is None:
            raise ApiError("A dynamic QR needs an amount")
        amount = posting.parse_amount(body.amount)
        expires = datetime.now(UTC) + timedelta(minutes=body.expires_in_minutes or 15)
    elif body.amount is not None:
        raise ApiError("A static QR has no fixed amount (the customer enters it)")
    qr = MerchantQrCode(merchant_id=merchant.id, kind=body.kind, label=body.label, amount=amount,
                        currency=merchant.settlement_currency, reference=body.reference or
                        ("ORD-" + secrets.token_hex(4).upper() if body.kind == "dynamic" else None),
                        status="active", expires_at=expires)
    db.add(qr)
    await db.flush()
    await db.refresh(qr)
    return _qr(qr)


@router.get("/merchants/{merchant_id}/qr")
async def list_qr(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    rows = (await db.execute(select(MerchantQrCode).where(MerchantQrCode.merchant_id == merchant.id)
                             .order_by(MerchantQrCode.created_at.desc()).limit(200))).scalars()
    return [_qr(q) for q in rows]


@router.post("/merchants/{merchant_id}/qr/{qr_id}/cancel")
async def cancel_qr(merchant_id: str, qr_id: str, user_id=Depends(get_current_user_id),
                    db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    qr = await db.get(MerchantQrCode, uuid.UUID(qr_id))
    if qr is None or qr.merchant_id != merchant.id:
        raise ApiError("QR not found", status_code=404)
    if qr.status == "active":
        qr.status = "cancelled"
    await db.flush()
    return _qr(qr)


class QrPayIn(CamelModel):
    payload: str
    amount: str | None = None
    pin: str | None = None


@router.post("/qr/pay", status_code=201, dependencies=[Depends(rate_limit("payment", 30, 60))])
async def pay_qr(body: QrPayIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Customer scan-and-pay. Static QRs take the amount the customer typed;
    dynamic QRs always charge the stored amount."""
    await pin_service.verify_pin(db, user_id, body.pin)
    qr, merchant = await merchant_qr.resolve(db, body.payload)
    tx, _ = await merchant_service.merchant_pay(db, merchant, amount=body.amount, payer_id=user_id,
                                                payer_name=None, reference=None, qr_payload=body.payload)
    return {"success": True, "transactionId": str(tx.id), "amount": _money(tx.amount), "currency": qr.currency,
            "merchant": merchant.business_name, "reference": tx.reference, "status": "completed"}


# ─── Refunds ────────────────────────────────────────────────────────────────


class RefundIn(CamelModel):
    amount: str | None = None
    reason: str
    pin: str | None = None


@router.post("/merchants/{merchant_id}/transactions/{transaction_id}/refund", status_code=201)
async def refund(merchant_id: str, transaction_id: str, body: RefundIn, user_id=Depends(get_current_user_id),
                 db: AsyncSession = Depends(get_db)):
    """Refund (full or partial) to the customer's wallet, paid from the
    merchant's balance. The original fee is not returned to the merchant."""
    merchant, _ = await merchant_access(db, merchant_id, user_id, "refund")
    await pin_service.verify_pin(db, user_id, body.pin)
    original = (await db.execute(select(MerchantTransaction).where(
        MerchantTransaction.id == uuid.UUID(transaction_id), MerchantTransaction.merchant_id == merchant.id)
        .with_for_update())).scalar_one_or_none()
    if original is None or original.type != MerchantTransactionType.PAYMENT:
        raise ApiError("Payment not found", status_code=404)
    if original.payer_id is None:
        raise ApiError("This payment has no BukkaPay customer to refund to")
    already = (await db.execute(select(func.coalesce(func.sum(MerchantTransaction.amount), 0)).where(
        MerchantTransaction.merchant_id == merchant.id, MerchantTransaction.type == MerchantTransactionType.REFUND,
        MerchantTransaction.reference == f"REFUND:{original.id}"))).scalar_one()
    amount = posting.parse_amount(body.amount) if body.amount else original.amount - Decimal(already)
    if amount <= 0 or Decimal(already) + amount > original.amount:
        raise ApiError("Refund exceeds the refundable amount")
    currency = merchant.settlement_currency
    card = (await db.execute(select(WalletCard).where(WalletCard.user_id == original.payer_id,
                                                      WalletCard.currency == currency))).scalars().first()
    if card is None:
        from app.services.wallet_service import get_or_create_currency_card

        card = await get_or_create_currency_card(db, original.payer_id, currency)
    refund_tx = MerchantTransaction(merchant_id=merchant.id, payer_id=original.payer_id,
                                    payer_name=original.payer_name, amount=amount,
                                    type=MerchantTransactionType.REFUND,
                                    status=MerchantTransactionStatus.COMPLETED, reference=f"REFUND:{original.id}")
    db.add(refund_tx)
    await db.flush()
    entry = await posting.post(
        db, kind="merchant_refund", description=f"Refund of {original.id}: {body.reason}"[:500],
        legs=[posting.debit(await ledger_accounts.merchant_account(db, merchant, currency), amount),
              posting.credit(await ledger_accounts.wallet_account(db, card), amount)],
        details={"merchant_id": str(merchant.id), "original_transaction_id": str(original.id),
                 "reason": body.reason},
        insufficient_message="Your business balance is too low for this refund",
    )
    db.add(Transaction(user_id=original.payer_id, card_id=card.id, title=f"Refund from {merchant.business_name}",
                       category="refund", amount=amount, type=TransactionType.CREDIT, icon="refresh-cw"))
    await notification_service.create_notification(
        db, original.payer_id, NotificationType.SUCCESS, "Refund received",
        f"{merchant.business_name} refunded {currency} {amount:.2f}", related_type="refund")
    await webhooks_out.emit(db, merchant.id, "refund.succeeded", {
        "refundId": str(refund_tx.id), "paymentId": str(original.id), "amount": str(amount), "currency": currency})
    await db.flush()
    return {"refundId": str(refund_tx.id), "amount": _money(amount), "currency": currency,
            "ledgerReference": entry.reference}


# ─── Checkout links (merchant payment links) ───────────────────────────────


class CheckoutLinkIn(CamelModel):
    amount: str
    description: str | None = None
    allow_partial_payment: bool = False
    expires_in_hours: int | None = None
    customer_reference: str | None = None


async def _create_checkout_link(db: AsyncSession, merchant: Merchant, body: CheckoutLinkIn) -> PaymentLink:
    merchant_service.require_can_transact(merchant)
    amount = posting.parse_amount(body.amount)
    link = PaymentLink(sender_id=merchant.user_id, merchant_id=merchant.id, amount=amount,
                       currency=merchant.settlement_currency, description=body.description,
                       allow_partial_payment=body.allow_partial_payment, type="business", region="local",
                       destination="wallet", business_name=merchant.business_name,
                       business_logo=merchant.business_logo, remaining_balance=amount, amount_paid=Decimal(0),
                       expires_at=(datetime.now(UTC) + timedelta(hours=body.expires_in_hours))
                       if body.expires_in_hours else None)
    db.add(link)
    await db.flush()
    await db.refresh(link)
    return link


def _link(link: PaymentLink) -> dict:
    from app.services.payment_link_service import payment_url

    return {"id": str(link.id), "url": payment_url(link.id), "amount": _money(link.amount),
            "currency": link.currency, "amountPaid": _money(link.amount_paid),
            "status": link.status.value if hasattr(link.status, "value") else link.status,
            "description": link.description, "expiresAt": link.expires_at.isoformat() if link.expires_at else None,
            "createdAt": link.created_at.isoformat()}


@router.post("/merchants/{merchant_id}/checkout-links", status_code=201)
async def create_checkout_link(merchant_id: str, body: CheckoutLinkIn, user_id=Depends(get_current_user_id),
                               db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    return _link(await _create_checkout_link(db, merchant, body))


@router.get("/merchants/{merchant_id}/checkout-links")
async def list_checkout_links(merchant_id: str, user_id=Depends(get_current_user_id),
                              db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    rows = (await db.execute(select(PaymentLink).where(PaymentLink.merchant_id == merchant.id)
                             .order_by(PaymentLink.created_at.desc()).limit(200))).scalars()
    return [_link(link) for link in rows]


@router.post("/merchants/{merchant_id}/checkout-links/{link_id}/cancel")
async def cancel_checkout_link(merchant_id: str, link_id: str, user_id=Depends(get_current_user_id),
                               db: AsyncSession = Depends(get_db)):
    from app.models.enums import PaymentLinkStatus

    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    link = await db.get(PaymentLink, uuid.UUID(link_id))
    if link is None or link.merchant_id != merchant.id:
        raise ApiError("Link not found", status_code=404)
    if link.status != PaymentLinkStatus.PENDING:
        raise ApiError("Only unpaid links can be cancelled", status_code=409)
    link.status = PaymentLinkStatus.CANCELLED
    await db.flush()
    return _link(link)


# ─── API keys & webhooks ────────────────────────────────────────────────────


class ApiKeyIn(CamelModel):
    label: str | None = None


@router.post("/merchants/{merchant_id}/api-keys", status_code=201)
async def create_api_key(merchant_id: str, body: ApiKeyIn, user_id=Depends(get_current_user_id),
                         db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    prefix = secrets.token_hex(6)
    secret = secrets.token_urlsafe(32)
    db.add(MerchantApiKey(merchant_id=merchant.id, prefix=prefix,
                          key_hash=hashlib.sha256(secret.encode()).hexdigest(), label=body.label))
    await db.flush()
    return {"key": f"bkp_{prefix}_{secret}", "prefix": prefix,
            "note": "Store this key now — it is shown only once."}


@router.get("/merchants/{merchant_id}/api-keys")
async def list_api_keys(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    rows = (await db.execute(select(MerchantApiKey).where(MerchantApiKey.merchant_id == merchant.id))).scalars()
    return [{"id": str(k.id), "prefix": k.prefix, "label": k.label, "createdAt": k.created_at.isoformat(),
             "revokedAt": k.revoked_at.isoformat() if k.revoked_at else None,
             "lastUsedAt": k.last_used_at.isoformat() if k.last_used_at else None} for k in rows]


@router.delete("/merchants/{merchant_id}/api-keys/{key_id}")
async def revoke_api_key(merchant_id: str, key_id: str, user_id=Depends(get_current_user_id),
                         db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    key = await db.get(MerchantApiKey, uuid.UUID(key_id))
    if key is None or key.merchant_id != merchant.id:
        raise ApiError("Key not found", status_code=404)
    key.revoked_at = datetime.now(UTC)
    await db.flush()
    return {"success": True}


class WebhookIn(CamelModel):
    url: str
    events: list[str] = []


@router.post("/merchants/{merchant_id}/webhooks", status_code=201)
async def create_webhook(merchant_id: str, body: WebhookIn, user_id=Depends(get_current_user_id),
                         db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    if not body.url.startswith("https://"):
        raise ApiError("Webhook URLs must use https")
    unknown = set(body.events) - set(webhooks_out.EVENTS)
    if unknown:
        raise ApiError(f"Unknown events: {', '.join(sorted(unknown))}")
    endpoint = MerchantWebhookEndpoint(merchant_id=merchant.id, url=body.url, events=body.events,
                                       secret="whsec_" + secrets.token_urlsafe(24), active=True)
    db.add(endpoint)
    await db.flush()
    return {"id": str(endpoint.id), "url": endpoint.url, "events": endpoint.events, "secret": endpoint.secret}


@router.get("/merchants/{merchant_id}/webhooks")
async def list_webhooks(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    rows = (await db.execute(select(MerchantWebhookEndpoint).where(
        MerchantWebhookEndpoint.merchant_id == merchant.id))).scalars()
    return [{"id": str(e.id), "url": e.url, "events": e.events, "active": e.active} for e in rows]


@router.delete("/merchants/{merchant_id}/webhooks/{endpoint_id}")
async def delete_webhook(merchant_id: str, endpoint_id: str, user_id=Depends(get_current_user_id),
                         db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "developer")
    ep = await db.get(MerchantWebhookEndpoint, uuid.UUID(endpoint_id))
    if ep is None or ep.merchant_id != merchant.id:
        raise ApiError("Endpoint not found", status_code=404)
    ep.active = False
    await db.flush()
    return {"success": True}


# ─── External merchant API (API-key auth) ──────────────────────────────────


async def api_key_merchant(authorization: str | None = Header(default=None),
                           db: AsyncSession = Depends(get_db)) -> Merchant:
    token = (authorization or "").removeprefix("Bearer ").strip()
    try:
        _, prefix, secret = token.split("_", 2)
    except ValueError as e:
        raise ApiError("Invalid API key", status_code=401) from e
    key = (await db.execute(select(MerchantApiKey).where(MerchantApiKey.prefix == prefix))).scalar_one_or_none()
    if key is None or key.revoked_at is not None or not secrets.compare_digest(
            key.key_hash, hashlib.sha256(secret.encode()).hexdigest()):
        raise ApiError("Invalid API key", status_code=401)
    key.last_used_at = datetime.now(UTC)
    merchant = await db.get(Merchant, key.merchant_id)
    if merchant is None:
        raise ApiError("Invalid API key", status_code=401)
    return merchant


@router.post("/merchant-api/checkout-links", status_code=201,
             dependencies=[Depends(rate_limit("merchant-api", 120, 60))])
async def api_create_checkout_link(body: CheckoutLinkIn, merchant: Merchant = Depends(api_key_merchant),
                                   db: AsyncSession = Depends(get_db)):
    return _link(await _create_checkout_link(db, merchant, body))


@router.get("/merchant-api/checkout-links/{link_id}")
async def api_get_checkout_link(link_id: str, merchant: Merchant = Depends(api_key_merchant),
                                db: AsyncSession = Depends(get_db)):
    link = await db.get(PaymentLink, uuid.UUID(link_id))
    if link is None or link.merchant_id != merchant.id:
        raise ApiError("Link not found", status_code=404)
    return _link(link)


@router.get("/merchant-memberships")
async def memberships(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Every business the signed-in user can open, with their role."""
    out = []
    for m in await merchant_service.get_merchants_by_user(db, user_id):
        _, role = await merchant_access(db, str(m.id), user_id, "view")
        out.append({"id": str(m.id), "businessName": m.business_name, "role": role, "kybStatus": m.kyb_status,
                    "verificationTier": m.verification_tier,
                    "country": m.country_code, "currency": m.settlement_currency, "isActive": m.is_active,
                    "logo": m.business_logo})
    return out
