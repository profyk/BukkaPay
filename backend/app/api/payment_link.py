from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id, get_optional_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.integrations.pdf import generate_invoice_pdf
from app.models.user import User
from app.schemas.payment_link import (
    CreatePaymentLinkRequest,
    InvoicePaymentResponse,
    PaymentLinkResponse,
    PayWalletRequest,
    PayWalletResponse,
)
from app.services import payment_link_service, pin_service

router = APIRouter(prefix="/api", tags=["payment-links"])


def _to_response(link, *, invoice=None, payments=None, sender_name=None, direction=None) -> PaymentLinkResponse:
    payload = PaymentLinkResponse.model_validate(link)
    payload.invoice = invoice
    payload.payments = payments
    payload.sender_name = sender_name
    payload.direction = direction
    payload.payment_url = payment_link_service.payment_url(link.id)
    return payload


@router.post("/payment-links", status_code=201)
async def create_payment_link(
    body: CreatePaymentLinkRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PaymentLinkResponse:
    link, invoice = await payment_link_service.create_payment_link(
        db, user_id, amount=body.amount, currency=body.currency, description=body.description,
        allow_partial_payment=body.allow_partial_payment, minimum_payment=body.minimum_payment,
        type=body.type, region=body.region, sub_region=body.sub_region, destination=body.destination,
        bank_details=body.bank_details, business_name=body.business_name, business_logo=body.business_logo,
        invoice=body.invoice.model_dump(by_alias=True) if body.invoice else None,
    )
    return _to_response(link, invoice=invoice)


@router.get("/payment-links")
async def list_payment_links(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[PaymentLinkResponse]:
    created = await payment_link_service.get_links_by_user(db, user_id)
    received = await payment_link_service.get_saved_links(db, user_id)
    return [
        *[_to_response(l, direction="sent") for l in created],
        *[_to_response(l, direction="received") for l in received],
    ]


@router.post("/payment-links/{link_id}/save")
async def save_payment_link(
    link_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    await payment_link_service.save_link(db, user_id, link.id)
    return {"success": True}


@router.delete("/payment-links/{link_id}/save")
async def unsave_payment_link(
    link_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    await payment_link_service.unsave_link(db, user_id, link_id)
    return {"success": True}


@router.delete("/payment-links/{link_id}")
async def delete_payment_link(
    link_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    if link.sender_id != user_id:
        raise ApiError("You can only delete your own payment links", status_code=403)
    await payment_link_service.delete_payment_link(db, link)
    return {"success": True}


@router.get("/payment-links/{link_id}")
async def get_payment_link(link_id: str, db: AsyncSession = Depends(get_db)) -> PaymentLinkResponse:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    invoice = await payment_link_service.get_invoice_by_link(db, link.id)
    payments = await payment_link_service.get_payments_by_link(db, link.id)
    sender_result = await db.execute(select(User).where(User.id == link.sender_id))
    sender = sender_result.scalar_one_or_none()
    return _to_response(
        link, invoice=invoice, payments=payments,
        sender_name=sender.name if sender else "BukkaPay User",
    )


@router.post("/payment-links/{link_id}/pay-wallet", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def pay_with_wallet(
    link_id: str, body: PayWalletRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PayWalletResponse:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    await pin_service.verify_pin(db, user_id, body.pin)
    result = await payment_link_service.pay_with_wallet(db, link, user_id, body.amount)
    return PayWalletResponse.model_validate(result)


@router.get("/payment-links/{link_id}/invoice/pdf")
async def download_invoice_pdf(link_id: str, db: AsyncSession = Depends(get_db)) -> Response:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    invoice = await payment_link_service.get_invoice_by_link(db, link.id)
    payments = await payment_link_service.get_payments_by_link(db, link.id)
    sender_result = await db.execute(select(User).where(User.id == link.sender_id))
    sender = sender_result.scalar_one_or_none()

    pdf_bytes = generate_invoice_pdf(link=link, invoice=invoice, sender=sender, payments=payments)
    filename = f"invoice-{str(link.id)[:8]}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payment-links/{link_id}/payments")
async def list_link_payments(
    link_id: str, user_id=Depends(get_optional_user_id), db: AsyncSession = Depends(get_db)
) -> list[InvoicePaymentResponse]:
    link = await payment_link_service.get_payment_link(db, link_id)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    if user_id and link.sender_id != user_id:
        raise ApiError("Access denied", status_code=403)
    payments = await payment_link_service.get_payments_by_link(db, link.id)
    return [InvoicePaymentResponse.model_validate(p) for p in payments]


