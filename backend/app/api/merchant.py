from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.enums import MerchantStaffRole
from app.schemas.merchant import (
    BankOption,
    CreateMerchantRequest,
    InviteStaffRequest,
    InviteStaffResponse,
    LinkStaffRequest,
    MerchantAnalyticsResponse,
    MerchantPayInfoResponse,
    MerchantPayRequest,
    MerchantPayResponse,
    MerchantResponse,
    MerchantStaffResponse,
    MerchantSubscribeRequest,
    MerchantSubscribeResponse,
    MerchantTransactionResponse,
    MerchantWithdrawRequest,
    MerchantWithdrawResponse,
    UpdateMerchantBankingRequest,
    UpdateMerchantRequest,
    UpdateStaffRoleRequest,
)
from app.services import merchant_service
from app.services.stitch_service import STITCH_BANKS

router = APIRouter(prefix="/api", tags=["merchants"])


async def _owned_merchant(db: AsyncSession, merchant_id: str, user_id):
    """Owner-only access, for actions staff should never be able to do:
    editing business/banking details, withdrawing, managing staff, or
    deleting the merchant."""
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    if merchant.user_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    return merchant


async def _accessible_merchant(db: AsyncSession, merchant_id: str, user_id, *, require_manager: bool = False):
    """Owner or active staff can view the dashboard/analytics/transactions
    and print QR slips. require_manager narrows that to owner + manager
    role staff (e.g. inviting/removing other staff) — cashiers can't."""
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)
    if merchant.user_id == user_id:
        return merchant
    staff = await merchant_service.get_staff_membership(db, merchant.id, user_id)
    if staff is None:
        raise ApiError("Forbidden", status_code=403)
    if require_manager and staff.role not in (MerchantStaffRole.MANAGER, MerchantStaffRole.ADMIN):
        raise ApiError("Forbidden", status_code=403)
    return merchant


@router.get("/merchants")
async def list_merchants(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[MerchantResponse]:
    merchants = await merchant_service.get_merchants_by_user(db, user_id)
    return [MerchantResponse.model_validate(m) for m in merchants]


@router.get("/merchants/banks")
async def list_banks() -> list[BankOption]:
    return [BankOption.model_validate(b) for b in STITCH_BANKS]


@router.get("/merchants/{merchant_id}")
async def get_merchant(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantResponse:
    merchant = await _accessible_merchant(db, merchant_id, user_id)
    return MerchantResponse.model_validate(merchant)


@router.post("/merchants", status_code=201)
async def create_merchant(
    body: CreateMerchantRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantResponse:
    merchant = await merchant_service.create_merchant(db, user_id, **body.model_dump())
    return MerchantResponse.model_validate(merchant)


@router.patch("/merchants/{merchant_id}")
async def update_merchant(
    merchant_id: str, body: UpdateMerchantRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantResponse:
    merchant = await _owned_merchant(db, merchant_id, user_id)
    updated = await merchant_service.update_merchant(db, merchant, **body.model_dump())
    return MerchantResponse.model_validate(updated)


@router.patch("/merchants/{merchant_id}/banking")
async def update_banking(
    merchant_id: str, body: UpdateMerchantBankingRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantResponse:
    from app.models.enums import NotificationType
    from app.services import notification_service, pin_service

    merchant = await _owned_merchant(db, merchant_id, user_id)
    # Payout-account changes are the classic takeover target: PIN first.
    await pin_service.verify_pin(db, user_id, body.pin)
    updated = await merchant_service.update_banking_details(
        db, merchant, bank_id=body.bank_id, account_holder=body.account_holder,
        account_number=body.account_number, account_type=body.account_type,
    )
    await notification_service.create_notification(
        db, merchant.user_id, NotificationType.INFO, "Payout bank account changed",
        f"Payouts for {merchant.business_name} now go to {updated.bank_name} account ending "
        f"{(updated.account_number or '')[-4:]}. If this wasn't you, contact BukkaPay support immediately.",
        related_id=str(merchant.id), related_type="merchant_banking",
    )
    return MerchantResponse.model_validate(updated)


@router.get("/merchants/{merchant_id}/transactions")
async def list_merchant_transactions(
    merchant_id: str,
    limit: int | None = Query(default=100),
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[MerchantTransactionResponse]:
    merchant = await _accessible_merchant(db, merchant_id, user_id)
    txs = await merchant_service.get_merchant_transactions(db, merchant.id, limit)
    return [MerchantTransactionResponse.model_validate(t) for t in txs]


@router.get("/merchants/{merchant_id}/analytics")
async def merchant_analytics(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantAnalyticsResponse:
    merchant = await _accessible_merchant(db, merchant_id, user_id)
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


@router.get("/merchants/{merchant_id}/staff")
async def list_staff(
    merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[MerchantStaffResponse]:
    merchant = await _accessible_merchant(db, merchant_id, user_id)
    staff = await merchant_service.list_staff(db, merchant.id)
    return [MerchantStaffResponse.model_validate(s) for s in staff]


@router.post("/merchants/{merchant_id}/staff", status_code=201)
async def invite_staff(
    merchant_id: str, body: InviteStaffRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> InviteStaffResponse:
    merchant = await _accessible_merchant(db, merchant_id, user_id, require_manager=True)
    from app.plans import service as plans

    if await plans.limits_for(db, merchant):
        await plans.enforce_limit(db, merchant, "staff_seats", (await plans.usage(db, merchant))["staff_seats"])
    staff = await merchant_service.invite_staff(db, merchant.id, name=body.name, role=body.role)
    invite_link = f"{get_settings().app_url}/staff-invite/{staff.invite_code}"
    return InviteStaffResponse.model_validate({"staff": staff, "inviteLink": invite_link})


@router.post("/merchants/staff/link")
async def link_staff(
    body: LinkStaffRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> MerchantStaffResponse:
    staff = await merchant_service.link_staff(db, user_id, body.invite_code)
    return MerchantStaffResponse.model_validate(staff)


@router.patch("/merchants/{merchant_id}/staff/{staff_id}")
async def update_staff_role(
    merchant_id: str, staff_id: str, body: UpdateStaffRoleRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantStaffResponse:
    merchant = await _accessible_merchant(db, merchant_id, user_id, require_manager=True)
    target = await merchant_service.get_staff_by_id(db, merchant.id, staff_id)
    if target is None:
        raise ApiError("Staff member not found", status_code=404)
    updated = await merchant_service.update_staff_role(db, target, body.role)
    return MerchantStaffResponse.model_validate(updated)


@router.delete("/merchants/{merchant_id}/staff/{staff_id}")
async def remove_staff(
    merchant_id: str, staff_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    merchant = await _accessible_merchant(db, merchant_id, user_id, require_manager=True)
    target = await merchant_service.get_staff_by_id(db, merchant.id, staff_id)
    if target is None:
        raise ApiError("Staff member not found", status_code=404)
    await merchant_service.remove_staff(db, target)
    return {"success": True}


@router.post("/merchants/{merchant_id}/withdraw")
async def withdraw(
    merchant_id: str,
    body: MerchantWithdrawRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantWithdrawResponse:
    from app.api.merchant_platform import merchant_access

    merchant, _ = await merchant_access(db, merchant_id, user_id, "finance")
    result = await merchant_service.withdraw(
        db, merchant, user_id, amount=body.amount, currency=body.currency, pin=body.pin,
    )
    return MerchantWithdrawResponse.model_validate(result)


@router.post("/merchants/{merchant_id}/subscribe")
async def subscribe(
    merchant_id: str,
    body: MerchantSubscribeRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> MerchantSubscribeResponse:
    """Older clients. Goes through the plan catalogue: published plans only,
    paid from the business balance (it used to switch plans for free)."""
    from app.plans import service as plans

    merchant = await _owned_merchant(db, merchant_id, user_id)
    plan = await plans.get_plan(db, (body.plan or "").strip().lower())
    if plan is None or plan.status != "published":
        raise ApiError("Invalid plan")
    result = await plans.choose(db, merchant, plan.code, "monthly", user_id=user_id)
    sub = result["subscription"] or {}
    return MerchantSubscribeResponse.model_validate(
        {"success": True, "plan": plan.code, "expiresAt": sub.get("periodEnd")}
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
    user_id=Depends(get_current_user_id),
) -> MerchantPayResponse:
    from app.services import pin_service

    if not body.amount:
        raise ApiError("Amount is required")
    await pin_service.verify_pin(db, user_id, body.pin)
    merchant = await merchant_service.get_merchant(db, merchant_id)
    if merchant is None:
        raise ApiError("Merchant not found", status_code=404)

    transaction, new_balance = await merchant_service.merchant_pay(
        db, merchant, amount=body.amount, payer_id=user_id, payer_name=body.payer_name,
        reference=body.reference, qr_payload=body.qr_payload,
    )
    return MerchantPayResponse.model_validate({
        "transaction": transaction, "newBalance": f"{new_balance:.2f}",
    })
