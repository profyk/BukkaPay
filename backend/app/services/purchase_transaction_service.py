import secrets
import time
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.misc import PurchaseTransaction


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
    if limit:
        stmt = stmt.limit(limit)
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
    return transaction


async def update_metadata(db: AsyncSession, transaction: PurchaseTransaction, metadata: dict) -> PurchaseTransaction:
    merged = {**(transaction.meta or {}), **metadata}
    transaction.meta = merged
    await db.flush()
    return transaction
