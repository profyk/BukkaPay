import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import PaymentRequestStatus
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
    db: AsyncSession, user_id: uuid.UUID, *, amount: str, currency: str | None, recipient_name: str | None,
    recipient_phone: str | None, payer: str | None = None, description: str | None = None,
    expires_in_hours: int | None = 72,
) -> PaymentRequest:
    from datetime import UTC, timedelta

    from app.ledger import posting
    from app.models.enums import NotificationType
    from app.models.user import User
    from app.reference import currencies
    from app.services import notification_service, wallet_service

    parsed_amount = posting.parse_amount(amount)
    requester = await db.get(User, user_id)
    currency = (await currencies.require_wallet_currency(db, currency or "ZAR")).code
    payer_user = None
    if payer:
        payer_user = await wallet_service.lookup_recipient(db, payer)
        if payer_user is None:
            raise ApiError("No BukkaPay user found for that wallet ID or username", status_code=404)
        if payer_user.id == user_id:
            raise ApiError("You can't request money from yourself")
    request = PaymentRequest(
        user_id=user_id, amount=parsed_amount, currency=currency,
        recipient_name=recipient_name or (payer_user.name if payer_user else None),
        recipient_phone=recipient_phone, status="pending", description=description,
        payer_user_id=payer_user.id if payer_user else None,
        expires_at=datetime.now(UTC) + timedelta(hours=expires_in_hours) if expires_in_hours else None,
    )
    db.add(request)
    await db.flush()
    if payer_user is not None:
        await notification_service.create_notification(
            db, payer_user.id, NotificationType.INFO, "Payment request",
            f"{requester.name} requested {currency} {parsed_amount:.2f}"
            + (f" for {description}" if description else ""),
            related_id=str(request.id), related_type="payment_request",
        )
    return request


async def pay_payment_request(db: AsyncSession, request_id: str, payer_id: uuid.UUID, *, from_card_id: str) -> dict:
    """Pay a request: a normal domestic transfer to the requester, then the
    request is marked paid with the transfer reference. Row-locked so it can
    only be paid once."""
    from datetime import UTC

    from app.models.enums import NotificationType
    from app.models.user import User
    from app.services import notification_service, wallet_service

    try:
        rid = uuid.UUID(request_id)
    except ValueError as e:
        raise ApiError("Payment request not found", status_code=404) from e
    request = (await db.execute(select(PaymentRequest).where(PaymentRequest.id == rid).with_for_update())
               ).scalar_one_or_none()
    if request is None:
        raise ApiError("Payment request not found", status_code=404)
    if request.status != PaymentRequestStatus.PENDING:
        raise ApiError(f"This request is {request.status.value if hasattr(request.status, 'value') else request.status}",
                       status_code=409)
    if request.expires_at is not None and request.expires_at <= datetime.now(UTC):
        request.status = PaymentRequestStatus.EXPIRED
        await db.flush()
        raise ApiError("This request has expired", status_code=410)
    if request.payer_user_id is not None and request.payer_user_id != payer_id:
        raise ApiError("This request was sent to someone else", status_code=403)
    if request.user_id == payer_id:
        raise ApiError("You can't pay your own request")
    card = await wallet_service.get_wallet_card(db, from_card_id, payer_id)
    if card is None or card.currency != request.currency:
        raise ApiError(f"Choose a {request.currency} wallet to pay this request")
    requester = await db.get(User, request.user_id)
    result = await wallet_service.send_money(db, payer_id, from_card_id=from_card_id,
                                             to_user_id=requester.wallet_id, amount=str(request.amount))
    request.status = PaymentRequestStatus.PAID
    request.paid_by_user_id = payer_id
    request.paid_at = datetime.now(UTC)
    request.transfer_reference = result["reference"]
    await notification_service.create_notification(
        db, request.user_id, NotificationType.SUCCESS, "Request paid",
        f"Your request for {request.currency} {request.amount:.2f} was paid",
        related_id=str(request.id), related_type="payment_request",
    )
    await db.flush()
    return result


async def cancel_payment_request(db: AsyncSession, request_id: str, user_id: uuid.UUID) -> PaymentRequest:
    request = await get_payment_request(db, request_id)
    if request is None or request.user_id != user_id:
        raise ApiError("Payment request not found", status_code=404)
    if request.status != PaymentRequestStatus.PENDING:
        raise ApiError("Only pending requests can be cancelled", status_code=409)
    request.status = PaymentRequestStatus.CANCELLED
    await db.flush()
    return request


async def decline_payment_request(db: AsyncSession, request_id: str, user_id: uuid.UUID) -> PaymentRequest:
    request = await get_payment_request(db, request_id)
    if request is None or request.payer_user_id != user_id:
        raise ApiError("Payment request not found", status_code=404)
    if request.status != PaymentRequestStatus.PENDING:
        raise ApiError("Only pending requests can be declined", status_code=409)
    request.status = PaymentRequestStatus.DECLINED
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


