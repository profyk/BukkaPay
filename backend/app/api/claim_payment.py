from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import require
from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.claim_payment import (
    ClaimBankRequest,
    ClaimCashRequest,
    ClaimCashResponse,
    ClaimPaymentMineResponse,
    ClaimPaymentPublicResponse,
    ClaimWalletRequest,
    CreateClaimPaymentRequest,
    CreateClaimPaymentResponse,
    PickupClaimRequest,
    PickupClaimResponse,
    VerifyPinRequest,
)
from app.services import claim_payment_service as svc

router = APIRouter(prefix="/api", tags=["claim-payments"])



@router.post("/claim-payments", status_code=201)
async def create_claim_payment(
    body: CreateClaimPaymentRequest, sender_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> CreateClaimPaymentResponse:
    from app.services import pin_service

    await pin_service.verify_pin(db, sender_id, body.transaction_pin)
    claim = await svc.create_claim(
        db, sender_id, recipient_name=body.recipient_name, recipient_contact=body.recipient_contact,
        amount=body.amount, currency=body.currency, note=body.note, pin=body.pin,
    )
    return CreateClaimPaymentResponse.model_validate({
        "id": claim.id, "claimUrl": f"{get_settings().pay_web_url.rstrip('/')}/claim/{claim.id}", "expiresAt": claim.expires_at,
        "recipientName": claim.recipient_name, "amount": claim.amount, "currency": claim.currency,
    })


@router.get("/claim-payments/mine")
async def my_claims(
    sender_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[ClaimPaymentMineResponse]:
    claims = await svc.get_claims_by_sender(db, sender_id)
    return [ClaimPaymentMineResponse.model_validate(c) for c in claims]


@router.delete("/claim-payments/{claim_id}")
async def cancel_claim(
    claim_id: str, sender_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    claim = await svc.get_claim_owned(db, claim_id, sender_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    await svc.cancel_claim(db, claim)
    return {"success": True, "message": "Claim cancelled and refunded"}


@router.get("/claim-payments/{claim_id}/public", dependencies=[Depends(rate_limit("claim-public", 60, 900))])
async def get_claim_public(claim_id: str, db: AsyncSession = Depends(get_db)) -> ClaimPaymentPublicResponse:
    claim = await svc.get_claim(db, claim_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    svc.ensure_not_expired(claim)
    return ClaimPaymentPublicResponse.model_validate(claim)


@router.post("/claim-payments/{claim_id}/verify-pin", dependencies=[Depends(rate_limit("claim-public", 60, 900))])
async def verify_pin(claim_id: str, body: VerifyPinRequest, db: AsyncSession = Depends(get_db)) -> dict:
    claim = await svc.get_claim(db, claim_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    await svc.verify_pin(db, claim, body.pin)
    return {"success": True, "message": "PIN verified"}


@router.post("/claim-payments/{claim_id}/claim-bank", dependencies=[Depends(rate_limit("claim-public", 60, 900))])
async def claim_bank(claim_id: str, body: ClaimBankRequest, db: AsyncSession = Depends(get_db)) -> dict:
    claim = await svc.get_claim(db, claim_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    message = await svc.claim_via_bank(
        db, claim, pin=body.pin, account_name=body.account_name, bank_name=body.bank_name,
        account_number=body.account_number, branch_code=body.branch_code,
    )
    return {"success": True, "message": message}


@router.post("/claim-payments/{claim_id}/claim-wallet", dependencies=[Depends(rate_limit("claim-public", 60, 900))])
async def claim_wallet(claim_id: str, body: ClaimWalletRequest, db: AsyncSession = Depends(get_db)) -> dict:
    claim = await svc.get_claim(db, claim_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    message = await svc.claim_via_wallet(db, claim, pin=body.pin, email=body.email)
    return {"success": True, "message": message}


@router.post("/claim-payments/{claim_id}/claim-cash", dependencies=[Depends(rate_limit("claim-public", 60, 900))])
async def claim_cash(claim_id: str, body: ClaimCashRequest, db: AsyncSession = Depends(get_db)) -> ClaimCashResponse:
    claim = await svc.get_claim(db, claim_id)
    if claim is None:
        raise ApiError("Claim not found", status_code=404)
    pickup_code = await svc.claim_via_cash(db, claim, pin=body.pin)
    return ClaimCashResponse.model_validate({
        "success": True, "pickupCode": pickup_code, "amount": claim.amount, "currency": claim.currency,
    })


# Confirming a cash hand-over is a staff action: an admin with users.manage.
@router.post("/pickup/claim", dependencies=[Depends(require("users.manage"))])
async def pickup_claim(body: PickupClaimRequest, db: AsyncSession = Depends(get_db)) -> PickupClaimResponse:
    claim = await svc.redeem_pickup_code(db, body.pickup_code)
    return PickupClaimResponse.model_validate({
        "success": True, "amount": claim.amount, "currency": claim.currency,
        "recipientName": claim.recipient_name,
        "message": f"Cash pickup of {claim.currency} {claim.amount} confirmed for {claim.recipient_name}.",
    })
