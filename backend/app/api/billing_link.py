from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.deps import get_db
from app.schemas.billing_link import (
    BillingLinkResponse,
    CreateBillingLinkRequest,
    UpdateBillingLinkStatusRequest,
)
from app.services import billing_link_service as svc
from app.services import merchant_service

router = APIRouter(prefix="/api/billing-links", tags=["billing-links"])


def _to_response(link) -> BillingLinkResponse:
    payload = BillingLinkResponse.model_validate(link)
    payload.pay_url = svc.pay_url(link)
    return payload


@router.get("")
async def list_billing_links(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[BillingLinkResponse]:
    merchants = await merchant_service.get_merchants_by_user(db, user_id)
    if not merchants:
        return []
    links = await svc.get_links_by_merchant_ids(db, [m.id for m in merchants])
    return [_to_response(l) for l in links]


@router.post("", status_code=201)
async def create_billing_link(
    body: CreateBillingLinkRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> BillingLinkResponse:
    link = await svc.create_billing_link(
        db, user_id, merchant_id=body.merchant_id, biller_name=body.biller_name, bill_type=body.bill_type,
        description=body.description, amount=body.amount, currency=body.currency,
        account_number=body.account_number, billing_period=body.billing_period, due_date=body.due_date,
        attachments=body.attachments, recipients=body.recipients,
    )
    return _to_response(link)


@router.get("/{link_id}")
async def get_billing_link(
    link_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> BillingLinkResponse:
    link = await svc.get_link_with_owner_check(db, link_id, user_id)
    return _to_response(link)


@router.patch("/{link_id}/status")
async def update_billing_link_status(
    link_id: str, body: UpdateBillingLinkStatusRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    link = await svc.get_link_with_owner_check(db, link_id, user_id)
    await svc.update_status(db, link, body.status)
    return {"success": True}


@router.delete("/{link_id}")
async def delete_billing_link(
    link_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    link = await svc.get_link_with_owner_check(db, link_id, user_id)
    await svc.delete_link(db, link)
    return {"success": True}
