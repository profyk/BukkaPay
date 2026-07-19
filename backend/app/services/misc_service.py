import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.misc import Contact, PaymentRequest


async def get_contacts(db: AsyncSession, user_id: uuid.UUID) -> list[Contact]:
    result = await db.execute(select(Contact).where(Contact.user_id == user_id))
    return list(result.scalars().all())


async def create_contact(
    db: AsyncSession, user_id: uuid.UUID, *, name: str, username: str, color: str, is_favorite: bool | None
) -> Contact:
    contact = Contact(
        user_id=user_id, name=name, username=username, color=color, is_favorite=bool(is_favorite)
    )
    db.add(contact)
    await db.flush()
    return contact


async def create_payment_request(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    amount: str,
    currency: str | None,
    recipient_name: str | None,
    recipient_phone: str | None,
    status: str | None,
    expires_at: str | None,
) -> PaymentRequest:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e

    request = PaymentRequest(
        user_id=user_id,
        amount=parsed_amount,
        currency=currency or "ZAR",
        recipient_name=recipient_name,
        recipient_phone=recipient_phone,
        status=status or "pending",
        expires_at=datetime.fromisoformat(expires_at) if expires_at else None,
    )
    db.add(request)
    await db.flush()
    return request


async def get_payment_request(db: AsyncSession, request_id: str) -> PaymentRequest | None:
    try:
        request_uuid = uuid.UUID(request_id)
    except ValueError:
        return None
    result = await db.execute(select(PaymentRequest).where(PaymentRequest.id == request_uuid))
    return result.scalar_one_or_none()


async def get_payment_requests_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[PaymentRequest]:
    result = await db.execute(select(PaymentRequest).where(PaymentRequest.user_id == user_id))
    return list(result.scalars().all())


async def update_payment_request_status(
    db: AsyncSession, request_id: str, status: str
) -> PaymentRequest | None:
    request = await get_payment_request(db, request_id)
    if request is None:
        return None
    request.status = status
    await db.flush()
    return request
