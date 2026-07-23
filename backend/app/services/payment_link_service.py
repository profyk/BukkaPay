import secrets
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.integrations import stitch
from app.models.enums import NotificationType, PaymentLinkStatus, TransactionType
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.services import notification_service
from app.services.stitch_service import STITCH_BANKS

PAYMENT_URL_BASE = "https://app.bukkapay.com/pay"


def payment_url(link_id: uuid.UUID) -> str:
    return f"{PAYMENT_URL_BASE}/{link_id}"


async def create_payment_link(
    db: AsyncSession, user_id: uuid.UUID, *, amount: str, currency: str | None,
    description: str | None, allow_partial_payment: bool | None, minimum_payment: str | None,
    type: str | None, region: str | None, sub_region: str | None, destination: str | None,
    bank_details: dict | None, business_name: str | None, business_logo: str | None,
    invoice: dict | None,
) -> tuple[PaymentLink, Invoice | None]:
    try:
        parsed_amount = Decimal(amount)
    except (InvalidOperation, TypeError) as e:
        raise ApiError("Valid amount is required") from e
    if parsed_amount <= 0:
        raise ApiError("Valid amount is required")

    if destination == "bank":
        bd = bank_details or {}
        bank_id = bd.get("bankId") or bd.get("bank_id")
        account_holder = bd.get("accountHolder") or bd.get("account_holder")
        account_number = bd.get("accountNumber") or bd.get("account_number")
        if not bank_id or bank_id not in {b["id"] for b in STITCH_BANKS}:
            raise ApiError("Select a valid bank to receive this payment")
        if not account_holder or not account_number:
            raise ApiError("Account holder name and account number are required")
        bank_details = {
            "bankId": bank_id, "accountHolder": account_holder, "accountNumber": account_number,
            "accountType": bd.get("accountType") or bd.get("account_type") or "savings",
        }

    link = PaymentLink(
        sender_id=user_id,
        amount=parsed_amount,
        currency=currency or "ZAR",
        description=description,
        allow_partial_payment=bool(allow_partial_payment),
        minimum_payment=Decimal(minimum_payment) if minimum_payment else None,
        type=type or "personal",
        region=region or "local",
        sub_region=sub_region,
        destination=destination or "wallet",
        bank_details=bank_details,
        business_name=business_name,
        business_logo=business_logo,
        remaining_balance=parsed_amount,
    )
    db.add(link)
    await db.flush()

    created_invoice = None
    if invoice and invoice.get("customerName") or (invoice and invoice.get("customer_name")):
        customer_name = invoice.get("customerName") or invoice.get("customer_name")
        raw_items = invoice.get("items") or []
        items = []
        total = Decimal("0")
        for item in raw_items:
            qty = int(item.get("quantity") or 1)
            unit_price = Decimal(str(item.get("unitPrice") or item.get("unit_price") or 0))
            item_total = qty * unit_price
            total += item_total
            items.append({
                "name": item.get("name"), "quantity": qty,
                "unitPrice": float(unit_price), "total": float(item_total),
            })
        created_invoice = Invoice(
            payment_link_id=link.id,
            customer_name=customer_name,
            customer_email=invoice.get("customerEmail") or invoice.get("customer_email"),
            customer_phone=invoice.get("customerPhone") or invoice.get("customer_phone"),
            items=items,
            total_amount=total,
            type=invoice.get("type") or "invoice",
            due_date=datetime.fromisoformat(invoice["dueDate"]) if invoice.get("dueDate") else None,
            notes=invoice.get("notes"),
            attachment=invoice.get("attachment"),
        )
        db.add(created_invoice)
        await db.flush()

    return link, created_invoice


async def get_payment_link(db: AsyncSession, link_id: str) -> PaymentLink | None:
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        return None
    result = await db.execute(select(PaymentLink).where(PaymentLink.id == link_uuid))
    return result.scalar_one_or_none()


async def get_links_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[PaymentLink]:
    result = await db.execute(select(PaymentLink).where(PaymentLink.sender_id == user_id))
    return list(result.scalars().all())


async def get_saved_links(db: AsyncSession, user_id: uuid.UUID) -> list[PaymentLink]:
    result = await db.execute(
        select(PaymentLink)
        .join(SavedPaymentLink, SavedPaymentLink.payment_link_id == PaymentLink.id)
        .where(SavedPaymentLink.user_id == user_id)
    )
    return list(result.scalars().all())


async def save_link(db: AsyncSession, user_id: uuid.UUID, link_id: uuid.UUID) -> None:
    db.add(SavedPaymentLink(user_id=user_id, payment_link_id=link_id))
    await db.flush()


async def unsave_link(db: AsyncSession, user_id: uuid.UUID, link_id: str) -> None:
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        return
    result = await db.execute(
        select(SavedPaymentLink).where(
            SavedPaymentLink.user_id == user_id, SavedPaymentLink.payment_link_id == link_uuid
        )
    )
    saved = result.scalar_one_or_none()
    if saved:
        await db.delete(saved)
        await db.flush()


async def delete_payment_link(db: AsyncSession, link: PaymentLink) -> None:
    await db.delete(link)
    await db.flush()


async def get_invoice_by_link(db: AsyncSession, link_id: uuid.UUID) -> Invoice | None:
    result = await db.execute(select(Invoice).where(Invoice.payment_link_id == link_id))
    return result.scalar_one_or_none()


async def get_payments_by_link(db: AsyncSession, link_id: uuid.UUID) -> list[InvoicePayment]:
    result = await db.execute(
        select(InvoicePayment)
        .where(InvoicePayment.payment_link_id == link_id)
        .order_by(InvoicePayment.created_at.desc())
    )
    return list(result.scalars().all())


async def _settle_link_destination(db: AsyncSession, link: PaymentLink, amount: Decimal) -> None:
    """Route a confirmed payment to wherever the link actually says it
    should go. destination="wallet" credits the link creator's BukkaPay
    wallet. destination="bank" pays out via a real Stitch disbursement to
    the bank details saved on the link — previously this branch did
    nothing at all, so the payer's money was silently destroyed instead of
    reaching anyone."""
    if link.destination == "bank":
        if not stitch.is_stitch_payments_configured():
            raise ApiError("Bank payouts are not yet available. Please contact support.", status_code=503)
        bd = link.bank_details or {}
        reference = f"LINK-{str(link.id)[:8].upper()}-{secrets.token_hex(4).upper()}"
        await stitch.create_disbursement(
            amount=float(amount), currency=link.currency, reference=reference,
            recipient_name=bd.get("accountHolder"), bank_id=bd.get("bankId"),
            account_number=bd.get("accountNumber"), account_type=bd.get("accountType") or "savings",
        )
    else:
        sender_result = await db.execute(select(WalletCard).where(WalletCard.user_id == link.sender_id))
        sender_cards = list(sender_result.scalars().all())
        if sender_cards:
            sender_cards[0].balance = sender_cards[0].balance + amount


async def pay_with_wallet(db: AsyncSession, link: PaymentLink, user_id: uuid.UUID, amount: str | None) -> dict:
    if link.status == PaymentLinkStatus.PAID:
        raise ApiError("This payment link has already been fully paid")

    remaining = link.remaining_balance if link.remaining_balance is not None else link.amount
    try:
        pay_amount = Decimal(amount) if amount else remaining
    except InvalidOperation as e:
        raise ApiError("Invalid payment amount") from e
    if pay_amount <= 0:
        raise ApiError("Invalid payment amount")
    if pay_amount > remaining + Decimal("0.01"):
        raise ApiError("Amount exceeds remaining balance")
    if link.allow_partial_payment and link.minimum_payment:
        if pay_amount < link.minimum_payment - Decimal("0.01"):
            raise ApiError(f"Minimum payment is {link.currency} {link.minimum_payment}")

    result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    payer_cards = list(result.scalars().all())
    if not payer_cards:
        raise ApiError("No wallet card found")
    payer_card = payer_cards[0]
    if payer_card.balance < pay_amount:
        raise ApiError("Insufficient wallet balance")

    # Settle to the link's real destination before touching the payer's
    # balance, so a bank-payout failure (e.g. Stitch not configured) raises
    # cleanly with nothing changed yet, instead of debiting the payer and
    # then losing the money.
    await _settle_link_destination(db, link, pay_amount)
    payer_card.balance = payer_card.balance - pay_amount

    payer_result = await db.execute(select(User).where(User.id == user_id))
    payer = payer_result.scalar_one_or_none()

    reference = f"PAY-{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(4).upper()}"
    db.add(InvoicePayment(
        payment_link_id=link.id, amount=pay_amount, currency=link.currency, method="wallet",
        payer_name=payer.name if payer else None, payer_email=payer.email if payer else None,
        payer_user_id=user_id, reference=reference,
    ))

    new_amount_paid = link.amount_paid + pay_amount
    new_remaining = link.amount - new_amount_paid
    new_status = PaymentLinkStatus.PAID if new_remaining <= Decimal("0.01") else PaymentLinkStatus.PARTIAL
    link.amount_paid = new_amount_paid
    link.remaining_balance = max(Decimal("0"), new_remaining)
    link.status = new_status

    db.add(Transaction(
        user_id=user_id, title=f"Payment to {payer.name if payer else 'Recipient'}",
        category="payment", amount=pay_amount, type=TransactionType.DEBIT, icon="link",
    ))
    await db.flush()

    return {
        "success": True,
        "amountPaid": f"{new_amount_paid:.2f}",
        "remaining": f"{max(Decimal('0'), new_remaining):.2f}",
        "status": new_status.value,
    }


# No card/Paystack payment path here on purpose: payment links only settle
# via a BukkaPay wallet balance or a real Stitch instant-EFT payment now —
# neither ever puts raw card details anywhere near this app or its logs.
# The Paystack card-checkout flow and its webhook confirmation used to live
# here; both are removed along with the "Debit / Credit Card" option on the
# public pay-link page.
