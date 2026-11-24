import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.merchant import BillingLink, Merchant
from app.models.payment_link import PaymentLink
from app.services import merchant_service


async def get_links_by_merchant_ids(db: AsyncSession, merchant_ids: list[uuid.UUID]) -> list[BillingLink]:
    if not merchant_ids:
        return []
    result = await db.execute(
        select(BillingLink)
        .where(BillingLink.merchant_id.in_(merchant_ids))
        .order_by(BillingLink.created_at.desc())
    )
    return list(result.scalars().all())


async def get_link(db: AsyncSession, link_id: str) -> BillingLink | None:
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        return None
    result = await db.execute(select(BillingLink).where(BillingLink.id == link_uuid))
    return result.scalar_one_or_none()


async def create_billing_link(
    db: AsyncSession, user_id: uuid.UUID, *, merchant_id: str, biller_name: str, bill_type: str | None,
    description: str | None, amount: str, currency: str | None, account_number: str | None,
    billing_period: str | None, due_date: str | None, attachments: list | None, recipients: list | None,
) -> BillingLink:
    if not merchant_id or not biller_name or not amount:
        raise ApiError("merchantId, billerName and amount are required")

    try:
        merchant_uuid = uuid.UUID(merchant_id)
    except ValueError as e:
        raise ApiError("Merchant not found", status_code=404) from e
    merchant_result = await db.execute(select(Merchant).where(Merchant.id == merchant_uuid))
    merchant = merchant_result.scalar_one_or_none()
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    if merchant.user_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    merchant_service.require_can_transact(merchant)

    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e

    link = BillingLink(
        merchant_id=merchant.id, biller_name=biller_name, bill_type=bill_type or "other",
        description=description, amount=parsed_amount, currency=currency or "ZAR",
        account_number=account_number, billing_period=billing_period,
        due_date=datetime.fromisoformat(due_date) if due_date else None,
        attachments=attachments or [], recipients=recipients or [],
    )
    db.add(link)
    await db.flush()

    # The bill is paid through a merchant checkout link, so the money settles
    # to the merchant's ledger account. Created in the same transaction: a
    # bill with no way to pay it is never saved.
    payment_link = PaymentLink(
        sender_id=user_id, merchant_id=merchant.id, amount=parsed_amount, currency=link.currency,
        description=f"{biller_name} — {billing_period or 'Bill'}", remaining_balance=parsed_amount,
        type="business", destination="wallet", business_name=merchant.business_name,
        link_type="billing", status="pending",
    )
    db.add(payment_link)
    await db.flush()
    link.payment_link_id = payment_link.id
    await db.flush()

    return link


def pay_url(link: BillingLink) -> str | None:
    from app.services.payment_link_service import payment_url

    return payment_url(link.payment_link_id) if link.payment_link_id else None


async def get_link_with_owner_check(db: AsyncSession, link_id: str, user_id: uuid.UUID) -> BillingLink:
    link = await get_link(db, link_id)
    if link is None:
        raise ApiError("Not found", status_code=404)
    merchant_result = await db.execute(select(Merchant).where(Merchant.id == link.merchant_id))
    merchant = merchant_result.scalar_one_or_none()
    if merchant is None or merchant.user_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    return link


async def update_status(db: AsyncSession, link: BillingLink, status: str) -> BillingLink:
    from app.models.enums import BillingLinkStatus

    if status not in {s.value for s in BillingLinkStatus}:
        raise ApiError("Status must be active, paused or archived")
    link.status = status
    await db.flush()
    return link


async def delete_link(db: AsyncSession, link: BillingLink) -> None:
    await db.delete(link)
    await db.flush()
