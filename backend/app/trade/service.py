"""AfCFTA trade: invoices, instant supplier payments and escrow.

Ledger recipes (each currency balances on its own):

  pay instant   Dr buyer wallet  total          Cr merchant (total − fee) + SYS_REVENUE_MERCHANT_FEES (fee)
  fund escrow   Dr buyer wallet  total          Cr SYS_TRADE_ESCROW_<CCY> total
  release       Dr SYS_TRADE_ESCROW  amount     Cr merchant (amount − fee) + SYS_REVENUE_ESCROW_FEES (fee)
  refund        Dr SYS_TRADE_ESCROW  amount     Cr buyer wallet (invoice currency)

A buyer paying from a wallet in another currency goes through the FX pools
first (app.services.swap_service.fx_legs), in the same journal entry.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.merchant import Merchant
from app.models.trade import EscrowContract, EscrowEvent, TradeInvoice, TradeInvoiceItem
from app.models.user import User
from app.models.wallet import WalletCard
from app.network import fees
from app.trade import receipts

CENT = Decimal("0.01")
FOUR = Decimal("0.0001")
ESCROW_DEFAULT_RATE = Decimal("0.0100")      # 1.0% when no fee rule is configured
ESCROW_MIN_RATE, ESCROW_MAX_RATE = Decimal("0.0100"), Decimal("0.0150")
AUTO_RELEASE_DAYS = 14
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _ref(prefix: str) -> str:
    return prefix + "-" + "".join(secrets.choice(_ALPHABET) for _ in range(8))


def _d(v, field: str, places: Decimal = CENT) -> Decimal:
    try:
        d = Decimal(str(v))
    except Exception as e:
        raise ApiError(f"{field} must be a number") from e
    if not d.is_finite():
        raise ApiError(f"{field} must be a number")
    return d.quantize(places, rounding=ROUND_HALF_UP)


# ─── invoices ───────────────────────────────────────────────────────────────


async def create_invoice(db: AsyncSession, merchant: Merchant, *, created_by: uuid.UUID, buyer_name: str,
                         currency: str, items: list[dict], tax_total="0", buyer_email: str | None = None,
                         buyer_phone: str | None = None, buyer_country: str | None = None,
                         payment_mode: str = "either", incoterm: str | None = None, notes: str | None = None,
                         due_days: int | None = None, expires_days: int = 30) -> TradeInvoice:
    from app.reference import currencies
    from app.services.merchant_service import require_can_transact

    require_can_transact(merchant)
    currency = (currency or "").upper()
    await currencies.require_wallet_currency(db, currency)
    if payment_mode not in ("instant", "escrow", "either"):
        raise ApiError("payment_mode must be instant, escrow or either")
    if not buyer_name.strip():
        raise ApiError("Enter the buyer's name")
    if not 1 <= len(items) <= 100:
        raise ApiError("An invoice needs between 1 and 100 items")
    lines, subtotal = [], Decimal("0.00")
    for i, it in enumerate(items, start=1):
        qty = _d(it.get("quantity"), f"Item {i} quantity", FOUR)
        price = _d(it.get("unitPrice", it.get("unit_price")), f"Item {i} unit price", FOUR)
        desc = (it.get("description") or "").strip()
        if not desc or qty <= 0 or price < 0:
            raise ApiError(f"Item {i}: a description, a quantity above 0 and a price are required")
        total = (qty * price).quantize(CENT, rounding=ROUND_HALF_UP)
        subtotal += total
        lines.append(TradeInvoiceItem(line_no=i, description=desc[:300], hs_code=(it.get("hsCode") or None),
                                      origin_country=(it.get("originCountry") or None), quantity=qty,
                                      unit=(it.get("unit") or None), unit_price=price, line_total=total))
    tax = _d(tax_total or "0", "Tax")
    if tax < 0:
        raise ApiError("Tax can't be negative")
    grand = subtotal + tax
    if grand <= 0:
        raise ApiError("The invoice total must be above zero")
    now = datetime.now(UTC)
    inv = TradeInvoice(
        reference=_ref("TINV"), merchant_id=merchant.id, buyer_name=buyer_name.strip()[:200], buyer_email=buyer_email,
        buyer_phone=buyer_phone, buyer_country=(buyer_country or None), seller_country=merchant.country_code,
        currency=currency, subtotal=subtotal, tax_total=tax, total=grand, payment_mode=payment_mode, status="issued",
        incoterm=(incoterm or None), notes=notes, due_at=now + timedelta(days=due_days) if due_days else None,
        expires_at=now + timedelta(days=expires_days), created_by_user_id=created_by,
    )
    db.add(inv)
    await db.flush()
    for line in lines:
        line.invoice_id = inv.id
        db.add(line)
    await db.flush()
    return inv


async def get_invoice(db: AsyncSession, reference: str, *, lock: bool = False) -> TradeInvoice:
    stmt = select(TradeInvoice).where(TradeInvoice.reference == (reference or "").upper())
    if lock:
        stmt = stmt.with_for_update()
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise ApiError("Invoice not found", status_code=404)
    return inv


async def invoice_items(db: AsyncSession, invoice: TradeInvoice) -> list[TradeInvoiceItem]:
    return list((await db.execute(select(TradeInvoiceItem).where(TradeInvoiceItem.invoice_id == invoice.id)
                                  .order_by(TradeInvoiceItem.line_no))).scalars())


async def cancel_invoice(db: AsyncSession, invoice: TradeInvoice) -> TradeInvoice:
    if invoice.status not in ("issued", "draft"):
        raise ApiError("Only unpaid invoices can be cancelled", status_code=409)
    invoice.status = "cancelled"
    await db.flush()
    return invoice


def _payable(invoice: TradeInvoice, mode: str) -> None:
    if invoice.status != "issued":
        raise ApiError("This invoice can't be paid (it's " + invoice.status.replace("_", " ") + ")", status_code=409)
    if invoice.expires_at and invoice.expires_at <= datetime.now(UTC):
        raise ApiError("This invoice has expired. Ask the supplier for a new one.", status_code=410)
    if invoice.payment_mode != "either" and invoice.payment_mode != mode:
        raise ApiError(f"This supplier only accepts {invoice.payment_mode} payment for this invoice")


async def _buyer_source(db: AsyncSession, buyer_id: uuid.UUID, card_id: str) -> WalletCard:
    try:
        cid = uuid.UUID(card_id)
    except ValueError as e:
        raise ApiError("Wallet not found", status_code=404) from e
    card = (await db.execute(select(WalletCard).where(WalletCard.id == cid, WalletCard.user_id == buyer_id)
                             .with_for_update())).scalar_one_or_none()
    if card is None:
        raise ApiError("Wallet not found", status_code=404)
    if card.frozen or card.blocked or card.flagged:
        raise ApiError("This wallet is restricted", status_code=403)
    return card


async def _debit_legs(db: AsyncSession, source: WalletCard, currency: str, total: Decimal):
    """Legs that take `total` of `currency` from the buyer (converting from
    another currency if needed). Returns (legs, buyer_amount, rate)."""
    if source.currency == currency:
        from app.ledger import funds

        await funds.require(db, source, total, what="pay this invoice")
        return [posting.debit(await ledger_accounts.wallet_account(db, source), total)], total, None
    from app.services import swap_service

    q = await swap_service.quote_for_target(db, source.currency, currency, total)
    from app.ledger import funds

    await funds.require(db, source, q.amount, what="pay this invoice")
    return await swap_service.fx_legs(db, q, source=source), q.amount, q.rate


async def _parties(db: AsyncSession, buyer_id: uuid.UUID, invoice: TradeInvoice) -> tuple[User, Merchant]:
    buyer = await db.get(User, buyer_id)
    if buyer is None or buyer.frozen:
        raise ApiError("Your account is restricted", status_code=403)
    merchant = await db.get(Merchant, invoice.merchant_id)
    from app.services.merchant_service import require_can_transact

    require_can_transact(merchant)
    if merchant.user_id == buyer_id:
        raise ApiError("You can't pay your own business's invoice")
    return buyer, merchant


async def pay_instant(db: AsyncSession, buyer_id: uuid.UUID, reference: str, *, from_card_id: str):
    invoice = await get_invoice(db, reference, lock=True)
    _payable(invoice, "instant")
    buyer, merchant = await _parties(db, buyer_id, invoice)
    source = await _buyer_source(db, buyer_id, from_card_id)
    fee = await fees.compute(db, "merchant_payment", invoice.total, currency=invoice.currency,
                             country=merchant.country_code, merchant_category=str(merchant.business_type))
    legs, paid, rate = await _debit_legs(db, source, invoice.currency, invoice.total)
    legs += [posting.credit(await ledger_accounts.merchant_account(db, merchant, invoice.currency), invoice.total - fee.fee),
             posting.credit(await chart.sys_account(db, "SYS_REVENUE_MERCHANT_FEES", invoice.currency), fee.fee)]
    entry = await posting.post(
        db, kind="trade_instant_payment", description=f"Trade invoice {invoice.reference} paid",
        legs=legs, details={"invoice": invoice.reference, "merchant_id": str(merchant.id), "buyer_id": str(buyer_id),
                            "fee": str(fee.fee), "fee_breakdown": fee.breakdown, "paid_from": source.currency,
                            "paid_amount": str(paid), "rate": str(rate) if rate else None})
    invoice.status, invoice.buyer_user_id = "paid", buyer_id
    await db.flush()
    receipt = await receipts.issue(db, invoice=invoice, entry=entry, buyer=buyer, merchant=merchant,
                                   kind="instant_payment", amount=invoice.total, currency=invoice.currency,
                                   fee=fee.fee, buyer_amount=paid if rate else None,
                                   buyer_currency=source.currency if rate else None, fx_rate=rate)
    return invoice, receipt


async def _escrow_fee(db: AsyncSession, merchant: Merchant, currency: str, amount: Decimal) -> tuple[Decimal, Decimal]:
    rule = await fees.compute(db, "trade_escrow", amount, currency=currency, country=merchant.country_code)
    rate = (rule.fee / amount).quantize(FOUR, rounding=ROUND_HALF_UP) if rule.rule_id else ESCROW_DEFAULT_RATE
    rate = min(max(rate, ESCROW_MIN_RATE), ESCROW_MAX_RATE)  # always 1.0–1.5%
    return rate, (amount * rate).quantize(CENT, rounding=ROUND_HALF_UP)


async def fund_escrow(db: AsyncSession, buyer_id: uuid.UUID, reference: str, *, from_card_id: str,
                      idempotency_key: str, release_condition: str = "buyer_confirmation") -> EscrowContract:
    if not idempotency_key:
        raise ApiError("An Idempotency-Key header is required", status_code=400)
    existing = (await db.execute(select(EscrowContract).where(
        EscrowContract.buyer_user_id == buyer_id, EscrowContract.idempotency_key == idempotency_key))).scalar_one_or_none()
    if existing is not None:
        return existing  # a retried request returns the same contract, never a second charge
    if release_condition not in ("buyer_confirmation", "delivery_verified"):
        raise ApiError("release_condition must be buyer_confirmation or delivery_verified")
    invoice = await get_invoice(db, reference, lock=True)
    _payable(invoice, "escrow")
    buyer, merchant = await _parties(db, buyer_id, invoice)
    source = await _buyer_source(db, buyer_id, from_card_id)
    rate_fee, fee = await _escrow_fee(db, merchant, invoice.currency, invoice.total)
    legs, paid, fx = await _debit_legs(db, source, invoice.currency, invoice.total)
    legs.append(posting.credit(await chart.sys_account(db, "SYS_TRADE_ESCROW", invoice.currency), invoice.total))
    entry = await posting.post(
        db, kind="trade_escrow_funded", description=f"Escrow for trade invoice {invoice.reference}",
        legs=legs, details={"invoice": invoice.reference, "merchant_id": str(merchant.id), "buyer_id": str(buyer_id),
                            "paid_from": source.currency, "paid_amount": str(paid), "rate": str(fx) if fx else None})
    contract = EscrowContract(
        reference=_ref("ESC"), invoice_id=invoice.id, buyer_user_id=buyer_id, merchant_id=merchant.id,
        currency=invoice.currency, amount=invoice.total, fee_rate=rate_fee, fee_amount=fee,
        buyer_currency=source.currency if fx else None, buyer_amount=paid if fx else None, fx_rate=fx,
        status="funded", release_condition=release_condition,
        auto_release_at=datetime.now(UTC) + timedelta(days=AUTO_RELEASE_DAYS), funded_entry_id=entry.id,
        idempotency_key=idempotency_key,
    )
    db.add(contract)
    invoice.status, invoice.buyer_user_id = "in_escrow", buyer_id
    await db.flush()
    db.add(EscrowEvent(contract_id=contract.id, event="funded", actor_type="buyer", actor_id=str(buyer_id),
                       details={"ledger": entry.reference}))
    await receipts.issue(db, invoice=invoice, contract=contract, entry=entry, buyer=buyer, merchant=merchant,
                         kind="escrow_funded", amount=invoice.total, currency=invoice.currency,
                         buyer_amount=paid if fx else None, buyer_currency=source.currency if fx else None, fx_rate=fx)
    await db.flush()
    return contract


async def get_contract(db: AsyncSession, reference: str, *, lock: bool = False) -> EscrowContract:
    stmt = select(EscrowContract).where(EscrowContract.reference == (reference or "").upper())
    if lock:
        stmt = stmt.with_for_update()
    c = (await db.execute(stmt)).scalar_one_or_none()
    if c is None:
        raise ApiError("Escrow not found", status_code=404)
    return c


async def release(db: AsyncSession, contract: EscrowContract, *, actor_type: str, actor_id: str | None,
                  event: str, note: str | None = None):
    if contract.status not in ("funded", "disputed"):
        raise ApiError(f"This escrow is already {contract.status}", status_code=409)
    if contract.status == "disputed" and actor_type != "admin":
        raise ApiError("This escrow is under dispute — BukkaPay's trade desk will resolve it", status_code=409)
    merchant = await db.get(Merchant, contract.merchant_id)
    buyer = await db.get(User, contract.buyer_user_id)
    net = contract.amount - contract.fee_amount
    entry = await posting.post(
        db, kind="trade_escrow_released", description=f"Escrow {contract.reference} released",
        legs=[posting.debit(await chart.sys_account(db, "SYS_TRADE_ESCROW", contract.currency), contract.amount),
              posting.credit(await ledger_accounts.merchant_account(db, merchant, contract.currency), net),
              posting.credit(await chart.sys_account(db, "SYS_REVENUE_ESCROW_FEES", contract.currency), contract.fee_amount)],
        details={"escrow": contract.reference, "merchant_id": str(merchant.id), "fee": str(contract.fee_amount)})
    contract.status, contract.settled_entry_id = "released", entry.id
    if event.startswith("resolved"):
        contract.resolved_by, contract.resolution_note = actor_id, note
    invoice = await db.get(TradeInvoice, contract.invoice_id) if contract.invoice_id else None
    if invoice is not None:
        invoice.status = "released"
    await db.flush()
    db.add(EscrowEvent(contract_id=contract.id, event=event, actor_type=actor_type, actor_id=actor_id, note=note,
                       details={"ledger": entry.reference}))
    receipt = await receipts.issue(db, invoice=invoice, contract=contract, entry=entry, buyer=buyer, merchant=merchant,
                                   kind="escrow_released", amount=contract.amount, currency=contract.currency,
                                   fee=contract.fee_amount)
    await db.flush()
    return contract, receipt


async def refund(db: AsyncSession, contract: EscrowContract, *, actor_type: str, actor_id: str | None,
                 event: str, note: str | None = None):
    if contract.status not in ("funded", "disputed"):
        raise ApiError(f"This escrow is already {contract.status}", status_code=409)
    if contract.status == "disputed" and actor_type != "admin":
        raise ApiError("This escrow is under dispute — BukkaPay's trade desk will resolve it", status_code=409)
    from app.services.wallet_service import get_or_create_currency_card

    merchant = await db.get(Merchant, contract.merchant_id)
    buyer = await db.get(User, contract.buyer_user_id)
    card = await get_or_create_currency_card(db, buyer.id, contract.currency)
    entry = await posting.post(
        db, kind="trade_escrow_refunded", description=f"Escrow {contract.reference} refunded",
        legs=[posting.debit(await chart.sys_account(db, "SYS_TRADE_ESCROW", contract.currency), contract.amount),
              posting.credit(await ledger_accounts.wallet_account(db, card), contract.amount)],
        details={"escrow": contract.reference, "buyer_id": str(buyer.id)})
    contract.status, contract.settled_entry_id = "refunded", entry.id
    contract.resolved_by, contract.resolution_note = actor_id, note
    invoice = await db.get(TradeInvoice, contract.invoice_id) if contract.invoice_id else None
    if invoice is not None:
        invoice.status = "refunded"
    await db.flush()
    db.add(EscrowEvent(contract_id=contract.id, event=event, actor_type=actor_type, actor_id=actor_id, note=note,
                       details={"ledger": entry.reference}))
    receipt = await receipts.issue(db, invoice=invoice, contract=contract, entry=entry, buyer=buyer, merchant=merchant,
                                   kind="escrow_refunded", amount=contract.amount, currency=contract.currency)
    await db.flush()
    return contract, receipt


async def open_dispute(db: AsyncSession, contract: EscrowContract, *, actor_type: str, actor_id: str, reason: str):
    if contract.status != "funded":
        raise ApiError("Only a funded escrow can be disputed", status_code=409)
    if len((reason or "").strip()) < 10:
        raise ApiError("Describe the problem (at least 10 characters)")
    contract.status, contract.dispute_reason, contract.disputed_at = "disputed", reason.strip()[:2000], datetime.now(UTC)
    invoice = await db.get(TradeInvoice, contract.invoice_id) if contract.invoice_id else None
    if invoice is not None:
        invoice.status = "disputed"
    await db.flush()
    db.add(EscrowEvent(contract_id=contract.id, event="disputed", actor_type=actor_type, actor_id=actor_id,
                       note=reason.strip()[:2000]))
    await db.flush()
    return contract


async def release_due(db: AsyncSession, now: datetime | None = None) -> int:
    """Auto-release funded (undisputed) escrows past their release date."""
    now = now or datetime.now(UTC)
    due = list((await db.execute(select(EscrowContract).where(
        EscrowContract.status == "funded", EscrowContract.auto_release_at <= now).with_for_update(skip_locked=True)
        .limit(200))).scalars())
    for c in due:
        await release(db, c, actor_type="system", actor_id=None, event="auto_released")
    return len(due)
