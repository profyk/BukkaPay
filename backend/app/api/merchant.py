from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id, get_optional_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.merchant import (
    CreateMerchantRequest,
    MerchantAnalyticsResponse,
    MerchantPayInfoResponse,
    MerchantPayRequest,
    MerchantPayResponse,
    MerchantResponse,
    MerchantSubscribeRequest,
    MerchantSubscribeResponse,
    MerchantTransactionResponse,
    MerchantWithdrawRequest,
    MerchantWithdrawResponse,
)
from app.services import merchant_service

router = APIRouter(prefix="/api", tags=["merchants"])


async def _owned_merchant(db: AsyncSession, merchant_id: str, user_id):
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    if merchant.user_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    return merchant


@router.get("/merchants")
async def list_merchants(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[MerchantResponse]:
    merchants = await merchant_service.get_merchants_by_user(db, user_id)
    return [MerchantResponse.model_validate(m) for m in merchants]


@router.get("/merchants/{merchant_id}")
async def get_merchant(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantResponse:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    return MerchantResponse.model_validate(merchant)


@router.post("/merchants", status_code=201)
async def create_merchant(
    body: CreateMerchantRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantResponse:
    merchant = await merchant_service.create_merchant(db, user_id, **body.model_dump())
    return MerchantResponse.model_validate(merchant)


@router.get("/merchants/{merchant_id}/transactions")
async def list_merchant_transactions(
    merchant_id: str,
    limit: int | None = Query(default=None),
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[MerchantTransactionResponse]:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    txs = await merchant_service.get_merchant_transactions(db, merchant.id, limit)
    return [MerchantTransactionResponse.model_validate(t) for t in txs]


@router.get("/merchants/{merchant_id}/analytics")
async def merchant_analytics(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantAnalyticsResponse:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    all_txs = await merchant_service.get_merchant_transactions(db, merchant.id)
    analytics = merchant_service.compute_analytics(all_txs, merchant.daily_limit)
    return MerchantAnalyticsResponse.model_validate(analytics)


@router.delete("/merchants/{merchant_id}")
async def delete_merchant(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    await merchant_service.delete_merchant(db, merchant)
    return {"success": True}


@router.post("/merchants/{merchant_id}/withdraw")
async def withdraw(
    merchant_id: str,
    body: MerchantWithdrawRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantWithdrawResponse:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    result = await merchant_service.withdraw(
        db, merchant, user_id, amount=body.amount, currency=body.currency,
        banking_details=body.banking_details,
    )
    return MerchantWithdrawResponse.model_validate(result)


@router.post("/merchants/{merchant_id}/subscribe")
async def subscribe(
    merchant_id: str,
    body: MerchantSubscribeRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantSubscribeResponse:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    expires_at = await merchant_service.subscribe(db, merchant, body.plan)
    return MerchantSubscribeResponse.model_validate(
        {"success": True, "plan": body.plan, "expiresAt": expires_at}
    )


@router.get("/merchant-pay/{payment_link}")
async def merchant_pay_info(payment_link: str, db: AsyncSession = Depends(get_db)) -> MerchantPayInfoResponse:
    merchant = await merchant_service.get_merchant_by_payment_link(db, payment_link)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    info = await merchant_service.get_pay_info(db, merchant)
    return MerchantPayInfoResponse.model_validate(info)


@router.post("/merchant-pay/{merchant_id}", status_code=201)
async def merchant_pay(
    merchant_id: str,
    body: MerchantPayRequest,
    db: AsyncSession = Depends(get_db),
    user_id=Depends(get_optional_user_id),
) -> MerchantPayResponse:
    if not body.amount:
        raise ApiError("Amount is required")
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)

    transaction, new_balance = await merchant_service.merchant_pay(
        db, merchant, amount=body.amount, payer_id=user_id, payer_name=body.payer_name,
        reference=body.reference,
    )
    return MerchantPayResponse.model_validate({
        "transaction": transaction, "newBalance": f"{new_balance:.2f}",
    })
