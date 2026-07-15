from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.deps import get_db
from app.schemas.stitch import (
    BanksResponse,
    PayStitchRequest,
    PayStitchResponse,
    PayStitchVerifyRequest,
    PayStitchVerifyResponse,
    StitchStatusResponse,
    TopupInitiateRequest,
    TopupInitiateResponse,
    TopupVerifyRequest,
    TopupVerifyResponse,
    WithdrawRequest,
    WithdrawResponse,
)
from app.services import stitch_service as svc

router = APIRouter(tags=["stitch"])


@router.get("/api/stitch/banks")
async def list_banks() -> BanksResponse:
    return BanksResponse.model_validate({"banks": svc.list_banks()})


@router.get("/api/stitch/status")
async def status() -> StitchStatusResponse:
    return StitchStatusResponse.model_validate({"configured": svc.get_status()})


@router.post("/api/wallet/topup/stitch")
async def topup_initiate(
    body: TopupInitiateRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TopupInitiateResponse:
    result = await svc.initiate_topup(
        db, user_id, wallet_card_id=body.wallet_card_id, amount=body.amount, currency=body.currency
    )
    return TopupInitiateResponse.model_validate(result)


@router.get("/api/stitch/topup/callback")
async def topup_callback(
    ref: str = Query(default=""), cardId: str | None = Query(default=None),
    id: str | None = Query(default=None), amount: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    url = await svc.topup_callback_redirect(db, ref=ref, card_id=cardId, payment_request_id=id, amount=amount)
    return RedirectResponse(url)


@router.post("/api/wallet/topup/stitch/verify")
async def topup_verify(
    body: TopupVerifyRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TopupVerifyResponse:
    result = await svc.verify_topup(
        db, user_id, payment_request_id=body.payment_request_id, wallet_card_id=body.wallet_card_id,
        amount=body.amount,
    )
    return TopupVerifyResponse.model_validate(result)


@router.post("/api/wallet/withdraw/stitch")
async def withdraw(
    body: WithdrawRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WithdrawResponse:
    result = await svc.withdraw(
        db, user_id, wallet_card_id=body.wallet_card_id, amount=body.amount, currency=body.currency,
        bank_id=body.bank_id, account_number=body.account_number, account_type=body.account_type,
        account_name=body.account_name,
    )
    return WithdrawResponse.model_validate(result)


@router.post("/api/payment-links/{link_id}/pay-stitch")
async def pay_stitch(
    link_id: str, body: PayStitchRequest, db: AsyncSession = Depends(get_db)
) -> PayStitchResponse:
    result = await svc.initiate_payment_link_stitch(
        db, link_id, payer_name=body.payer_name, payer_email=body.payer_email, amount=body.amount
    )
    return PayStitchResponse.model_validate(result)


@router.get("/api/stitch/payment-link/callback")
async def payment_link_callback(
    linkId: str = Query(default=""), ref: str = Query(default=""), id: str | None = Query(default=None),
) -> RedirectResponse:
    url = await svc.payment_link_callback_redirect(link_id=linkId, ref=ref, payment_request_id=id)
    return RedirectResponse(url)


@router.post("/api/payment-links/{link_id}/pay-stitch/verify")
async def pay_stitch_verify(link_id: str, body: PayStitchVerifyRequest) -> PayStitchVerifyResponse:
    status = await svc.verify_payment_link_stitch(body.payment_request_id)
    return PayStitchVerifyResponse.model_validate({"status": status})
