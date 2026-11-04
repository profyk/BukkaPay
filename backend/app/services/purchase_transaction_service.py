import secrets
import time
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import NotificationType
from app.models.misc import PurchaseTransaction
from app.services import notification_service

MAX_PURCHASE_TRANSACTIONS_PAGE_SIZE = 100


async def get_transactions_by_user(
    db: AsyncSession, user_id: uuid.UUID, *, category: str | None = None, status: str | None = None,
    start_date: datetime | None = None, end_date: datetime | None = None,
    limit: int | None = None, offset: int | None = None,
) -> list[PurchaseTransaction]:
    stmt = select(PurchaseTransaction).where(PurchaseTransaction.user_id == user_id)
    if category:
        stmt = stmt.where(PurchaseTransaction.category == category)
    if status:
        stmt = stmt.where(PurchaseTransaction.status == status)
    if start_date:
        stmt = stmt.where(PurchaseTransaction.created_at >= start_date)
    if end_date:
        stmt = stmt.where(PurchaseTransaction.created_at <= end_date)
    stmt = stmt.order_by(PurchaseTransaction.created_at.desc())
    if offset:
        stmt = stmt.offset(offset)
    stmt = stmt.limit(min(limit, MAX_PURCHASE_TRANSACTIONS_PAGE_SIZE) if limit else MAX_PURCHASE_TRANSACTIONS_PAGE_SIZE)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_transaction(db: AsyncSession, transaction_id: str) -> PurchaseTransaction | None:
    try:
        transaction_uuid = uuid.UUID(transaction_id)
    except ValueError:
        return None
    result = await db.execute(select(PurchaseTransaction).where(PurchaseTransaction.id == transaction_uuid))
    return result.scalar_one_or_none()


async def create_transaction(
    db: AsyncSession, user_id: uuid.UUID, *, category: str, merchant_name: str, amount: str,
    currency: str | None, status: str | None, metadata: dict | None,
) -> PurchaseTransaction:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Missing required fields: category, merchantName, amount") from e

    reference = f"TXN-{int(time.time() * 1000)}-{secrets.token_hex(4).upper()}"
    transaction = PurchaseTransaction(
        user_id=user_id, category=category, merchant_name=merchant_name, amount=parsed_amount,
        currency=currency or "ZAR", status=status or "success", reference=reference, meta=metadata,
    )
    db.add(transaction)
    await db.flush()

    # Every other transaction-creating path (wallet transfers, rent, travel
    # bookings) notifies the user — this generic purchase path (topups, gift
    # cards, virtual cards, and anything else posted straight to
    # /api/purchase-transactions) never did, so those purchases were
    # invisible on the Notifications screen even though they're real
    # transactions.
    is_credit = category == "topup"
    formatted = f"{currency or 'ZAR'} {parsed_amount:,.2f}"
    await notification_service.create_notification(
        db, user_id,
        NotificationType.SUCCESS if is_credit else NotificationType.INFO,
        "Money Received" if is_credit else "Purchase Successful",
        f"{merchant_name} — {formatted}",
        related_id=str(transaction.id),
        related_type="purchase_transaction",
    )
    return transaction


async def update_metadata(db: AsyncSession, transaction: PurchaseTransaction, metadata: dict) -> PurchaseTransaction:
    merged = {**(transaction.meta or {}), **metadata}
    transaction.meta = merged
    await db.flush()
    return transaction
