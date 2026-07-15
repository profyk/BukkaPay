from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.user import User
from app.schemas.misc import (
    ContactResponse,
    CreateContactRequest,
    CreatePaymentRequestRequest,
    PaymentRequestResponse,
    PublicUser,
    UpdatePaymentRequestStatusRequest,
)
from app.services import misc_service

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/contacts")
async def list_contacts(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[ContactResponse]:
    contacts = await misc_service.get_contacts(db, user_id)
    return [ContactResponse.model_validate(c) for c in contacts]


@router.post("/contacts", status_code=201)
async def create_contact(
    body: CreateContactRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> ContactResponse:
    contact = await misc_service.create_contact(
        db, user_id, name=body.name, username=body.username, color=body.color, is_favorite=body.is_favorite
    )
    return ContactResponse.model_validate(contact)


async def _with_requester(db: AsyncSession, request) -> PaymentRequestResponse:
    result = await db.execute(select(User).where(User.id == request.user_id))
    requester = result.scalar_one_or_none()
    payload = PaymentRequestResponse.model_validate(request)
    payload.requester = PublicUser.model_validate(requester) if requester else None
    return payload


@router.post("/payment-requests", status_code=201)
async def create_payment_request(
    body: CreatePaymentRequestRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> PaymentRequestResponse:
    request = await misc_service.create_payment_request(
        db,
        user_id,
        amount=body.amount,
        currency=body.currency,
        recipient_name=body.recipient_name,
        recipient_phone=body.recipient_phone,
        status=body.status,
        expires_at=body.expires_at,
    )
    return await _with_requester(db, request)


@router.get("/payment-requests/{request_id}")
async def get_payment_request(request_id: str, db: AsyncSession = Depends(get_db)) -> PaymentRequestResponse:
    request = await misc_service.get_payment_request(db, request_id)
    if request is None:
        raise ApiError("Payment request not found", status_code=404)
    return await _with_requester(db, request)


@router.get("/payment-requests")
async def list_payment_requests(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[PaymentRequestResponse]:
    requests = await misc_service.get_payment_requests_by_user(db, user_id)
    return [PaymentRequestResponse.model_validate(r) for r in requests]


@router.patch("/payment-requests/{request_id}/status")
async def update_payment_request_status(
    request_id: str,
    body: UpdatePaymentRequestStatusRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> PaymentRequestResponse:
    request = await misc_service.update_payment_request_status(db, request_id, body.status)
    if request is None:
        raise ApiError("Payment request not found", status_code=404)
    return PaymentRequestResponse.model_validate(request)
