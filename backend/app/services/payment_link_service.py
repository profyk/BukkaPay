import secrets
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models.enums import PaymentLinkStatus, TransactionType
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

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

    payer_card.balance = payer_card.balance - pay_amount

    if link.destination == "wallet":
        sender_result = await db.execute(select(WalletCard).where(WalletCard.user_id == link.sender_id))
        sender_cards = list(sender_result.scalars().all())
        if sender_cards:
            sender_cards[0].balance = sender_cards[0].balance + pay_amount

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


async def initialize_card_payment(
    db: AsyncSession, link: PaymentLink, *, email: str, amount: str | None, payer_name: str | None,
) -> dict:
    import httpx

    if link.status == PaymentLinkStatus.PAID:
        raise ApiError("This payment link has already been fully paid")

    remaining = link.remaining_balance if link.remaining_balance is not None else link.amount
    try:
        pay_amount = Decimal(amount) if amount else remaining
    except InvalidOperation as e:
        raise ApiError("Invalid payment amount") from e
    if pay_amount <= 0 or pay_amount > remaining + Decimal("0.01"):
        raise ApiError("Invalid payment amount")

    settings = get_settings()
    if not settings.paystack_secret_key:
        raise ApiError("Card payment not configured. Please contact the business.", status_code=503)

    reference = f"PAY-{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(4).upper()}"
    amount_kobo = round(pay_amount * 100)

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {settings.paystack_secret_key}", "Content-Type": "application/json"},
            json={
                "email": email, "amount": int(amount_kobo), "currency": link.currency,
                "reference": reference,
                "metadata": {"paymentLinkId": str(link.id), "payerName": payer_name or email},
            },
        )
    data = response.json()
    if not data.get("status"):
        raise ApiError(data.get("message") or "Payment initialization failed")

    db.add(InvoicePayment(
        payment_link_id=link.id, amount=pay_amount, currency=link.currency, method="card",
        payer_name=payer_name, payer_email=email, payer_user_id=None, reference=reference,
        gateway="paystack",
    ))
    await db.flush()

    return {"authorizationUrl": data["data"]["authorization_url"], "reference": reference}


async def handle_paystack_webhook(db: AsyncSession, event: str, data: dict) -> None:
    if event != "charge.success":
        return

    reference = data.get("reference")
    result = await db.execute(select(InvoicePayment).where(InvoicePayment.reference == reference))
    payment = result.scalar_one_or_none()
    if payment is None or payment.status == "completed":
        return

    payment.status = "completed"
    payment.gateway_ref = str(data.get("id")) if data.get("id") is not None else None

    link_result = await db.execute(select(PaymentLink).where(PaymentLink.id == payment.payment_link_id))
    link = link_result.scalar_one_or_none()
    if link is None:
        await db.flush()
        return

    new_amount_paid = link.amount_paid + payment.amount
    new_remaining = link.amount - new_amount_paid
    link.amount_paid = new_amount_paid
    link.remaining_balance = max(Decimal("0"), new_remaining)
    link.status = PaymentLinkStatus.PAID if new_remaining <= Decimal("0.01") else PaymentLinkStatus.PARTIAL

    if link.destination == "wallet":
        sender_result = await db.execute(select(WalletCard).where(WalletCard.user_id == link.sender_id))
        sender_cards = list(sender_result.scalars().all())
        if sender_cards:
            sender_cards[0].balance = sender_cards[0].balance + payment.amount

    await db.flush()
