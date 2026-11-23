import secrets
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.integrations import stitch
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.enums import PaymentLinkStatus, TransactionType
from app.models.payment_link import Invoice, InvoicePayment, PaymentLink, SavedPaymentLink
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees
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
    parsed_amount = posting.parse_amount(amount or "")
    from app.reference import currencies

    currency = (await currencies.require_wallet_currency(db, currency or "ZAR")).code

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
        total = Decimal(0)
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


async def has_payments(db: AsyncSession, link: PaymentLink) -> bool:
    if (link.amount_paid or 0) > 0:
        return True
    found = await db.execute(select(InvoicePayment.id).where(InvoicePayment.payment_link_id == link.id).limit(1))
    return found.first() is not None


async def delete_payment_link(db: AsyncSession, link: PaymentLink) -> None:
    """Only a link nobody has paid can be deleted. Once money has moved, the
    link and its payments are financial records: cancel it instead."""
    if await has_payments(db, link):
        raise ApiError("This link has received payments, so it can't be deleted. Cancel it to stop new payments; "
                       "its history is kept.", status_code=409)
    await db.delete(link)
    await db.flush()


async def cancel_payment_link(db: AsyncSession, link: PaymentLink) -> PaymentLink:
    """Stop a link accepting payments. Money already received stays received."""
    locked = await lock_link(db, link.id)
    if locked.status == PaymentLinkStatus.PAID:
        raise ApiError("This link is already fully paid", status_code=409)
    if locked.status != PaymentLinkStatus.CANCELLED:
        locked.status = PaymentLinkStatus.CANCELLED
        await db.flush()
    return locked


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


async def lock_link(db: AsyncSession, link_id: uuid.UUID) -> PaymentLink:
    """Row-lock the link so two concurrent payments can't both pass the
    remaining-balance check."""
    link = (
        await db.execute(
            select(PaymentLink).where(PaymentLink.id == link_id).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    return link


def validate_link_amount(link: PaymentLink, amount: str | Decimal | None) -> Decimal:
    from datetime import UTC

    if link.expires_at is not None and link.expires_at <= datetime.now(UTC):
        raise ApiError("This payment link has expired", status_code=410)
    if link.status not in (PaymentLinkStatus.PENDING, PaymentLinkStatus.PARTIAL):
        if link.status == PaymentLinkStatus.PAID:
            raise ApiError("This payment link has already been fully paid")
        raise ApiError("This payment link is no longer active")
    remaining = link.remaining_balance if link.remaining_balance is not None else link.amount
    pay_amount = posting.parse_amount(amount) if amount else posting.money(remaining)
    if pay_amount > remaining:
        raise ApiError("Amount exceeds remaining balance")
    if pay_amount < remaining and not link.allow_partial_payment:
        raise ApiError("This link must be paid in full")
    if link.allow_partial_payment and link.minimum_payment and pay_amount < min(link.minimum_payment, remaining):
        raise ApiError(f"Minimum payment is {link.currency} {link.minimum_payment}")
    return pay_amount


async def settle_link_payment(
    db: AsyncSession, link: PaymentLink, pay_amount: Decimal, *, source: posting.Leg, method: str,
    payer_name: str | None, payer_email: str | None, payer_user_id: uuid.UUID | None,
    reference: str | None = None,
) -> dict:
    """Book a confirmed payment of ``pay_amount`` (already debited via
    ``source``) to the link's destination, in one journal entry.

    destination="wallet" credits the link creator's wallet in the link's
    currency. destination="bank" pays out through a Stitch disbursement to
    the bank details on the link; the money leaves BukkaPay's Stitch
    account, so the credit side is the Stitch clearing account."""
    if link.destination == "bank":
        if not stitch.is_stitch_payments_configured():
            raise ApiError("Bank payouts are not yet available. Please contact support.", status_code=503)
        bd = link.bank_details or {}
        payout_ref = f"LINK-{str(link.id)[:8].upper()}-{secrets.token_hex(4).upper()}"
        await stitch.create_disbursement(
            amount=float(pay_amount), currency=link.currency, reference=payout_ref,
            recipient_name=bd.get("accountHolder"), bank_id=bd.get("bankId"),
            account_number=bd.get("accountNumber"), account_type=bd.get("accountType") or "savings",
        )
        destination_leg = posting.credit(
            await ledger_accounts.provider_clearing(db, "stitch", link.currency), pay_amount
        )
        details = {"payout_reference": payout_ref}
    elif link.merchant_id is not None:
        from app.merchants import webhooks_out
        from app.models.merchant import Merchant
        from app.services.merchant_service import check_collection_cap, require_can_transact

        merchant = await db.get(Merchant, link.merchant_id)
        require_can_transact(merchant)
        await check_collection_cap(db, merchant, pay_amount)
        fee = await fees.compute(db, "merchant_payment", pay_amount, currency=link.currency,
                                 country=merchant.country_code, method=method)
        destination_leg = [
            posting.credit(await ledger_accounts.merchant_account(db, merchant, link.currency), pay_amount - fee.fee),
            posting.credit(await chart.sys_account(db, "SYS_REVENUE_MERCHANT_FEES", link.currency), fee.fee),
        ]
        details = {"merchant_id": str(merchant.id), "fee_breakdown": fee.breakdown}
        await webhooks_out.emit(db, merchant.id, "payment_link.paid", {
            "paymentLinkId": str(link.id), "amount": str(pay_amount), "fee": str(fee.fee),
            "currency": link.currency, "method": method,
        })
    else:
        from app.services.wallet_service import get_or_create_currency_card

        owner_card = await get_or_create_currency_card(db, link.sender_id, link.currency)
        owner = await db.get(User, link.sender_id)
        fee = await fees.compute(db, "payment_link", pay_amount, currency=link.currency,
                                 country=owner.residence_country if owner else None, method=method)
        net = pay_amount - fee.fee
        destination_leg = [
            posting.credit(await ledger_accounts.wallet_account(db, owner_card), net),
            posting.credit(await ledger_accounts.fee_revenue(db, link.currency), fee.fee),
        ]
        details = {"owner_card_id": str(owner_card.id), "fee_breakdown": fee.breakdown}
        db.add(Transaction(
            user_id=link.sender_id, card_id=owner_card.id,
            title=f"Payment link paid by {payer_name or 'a payer'}",
            category="payment", amount=net, type=TransactionType.CREDIT, icon="link", fee_amount=fee.fee,
        ))

    reference = reference or f"PAY-{int(datetime.now().timestamp() * 1000)}-{secrets.token_hex(4).upper()}"
    entry = await posting.post(
        db, kind="payment_link_payment",
        description=f"Payment link {link.id} paid via {method}",
        legs=[source, *(destination_leg if isinstance(destination_leg, list) else [destination_leg])],
        details={"payment_link_id": str(link.id), "method": method, "reference": reference, **details},
    )

    db.add(InvoicePayment(
        payment_link_id=link.id, amount=pay_amount, currency=link.currency, method=method,
        payer_name=payer_name, payer_email=payer_email, payer_user_id=payer_user_id, reference=reference,
    ))
    new_amount_paid = link.amount_paid + pay_amount
    new_remaining = link.amount - new_amount_paid
    new_status = PaymentLinkStatus.PAID if new_remaining <= 0 else PaymentLinkStatus.PARTIAL
    link.amount_paid = new_amount_paid
    link.remaining_balance = max(Decimal(0), new_remaining)
    link.status = new_status
    await db.flush()
    return {
        "success": True,
        "amountPaid": f"{new_amount_paid:.2f}",
        "remaining": f"{max(Decimal(0), new_remaining):.2f}",
        "status": new_status.value,
        "reference": entry.reference,
    }


async def pay_with_wallet(db: AsyncSession, link: PaymentLink, user_id: uuid.UUID, amount: str | None) -> dict:
    link = await lock_link(db, link.id)
    pay_amount = validate_link_amount(link, amount)

    result = await db.execute(
        select(WalletCard).where(WalletCard.user_id == user_id, WalletCard.currency == link.currency)
        .order_by(WalletCard.is_default.desc(), WalletCard.created_at)
    )
    payer_card = result.scalars().first()
    if payer_card is None:
        raise ApiError(f"You need a {link.currency} wallet to pay this link")
    if payer_card.frozen or payer_card.blocked or payer_card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    if payer_card.balance < pay_amount:
        raise ApiError("Insufficient wallet balance")

    payer = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    outcome = await settle_link_payment(
        db, link, pay_amount,
        source=posting.debit(await ledger_accounts.wallet_account(db, payer_card), pay_amount),
        method="wallet",
        payer_name=payer.name if payer else None, payer_email=payer.email if payer else None,
        payer_user_id=user_id,
    )
    db.add(Transaction(
        user_id=user_id, card_id=payer_card.id, title=f"Payment link {link.description or ''}".strip(),
        category="payment", amount=pay_amount, type=TransactionType.DEBIT, icon="link",
    ))
    await db.flush()
    return outcome


# No card/Paystack payment path here on purpose: payment links only settle
# via a BukkaPay wallet balance or a real Stitch instant-EFT payment now —
# neither ever puts raw card details anywhere near this app or its logs.
# The Paystack card-checkout flow and its webhook confirmation used to live
# here; both are removed along with the "Debit / Credit Card" option on the
# public pay-link page.
