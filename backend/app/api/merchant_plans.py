"""Merchant plans for businesses (merchant.bukkapay.com → Plan & billing) and
the public catalogue (website pricing page).

Anyone on the team with the finance capability sees the plan, usage and
charges; only the owner changes or cancels it. Plans are paid from the
business balance (see app/plans/service.py).
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.api.merchant_platform import merchant_access
from app.db.deps import get_db
from app.models.plans import MerchantPlanCharge
from app.plans import service as plans
from app.plans.catalogue import LIMIT_KEYS
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api", tags=["merchant-plans"])


class ChoosePlan(CamelModel):
    plan_code: str
    billing_cycle: Literal["monthly", "yearly"] = "monthly"


@router.get("/merchants/{merchant_id}/plan")
async def my_plan(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, role = await merchant_access(db, merchant_id, user_id, "finance")
    currency = merchant.settlement_currency
    plan, sub = await plans.effective_plan(db, merchant)
    catalogue = await plans.list_plans(db, published_only=True)
    charges = (await db.execute(
        select(MerchantPlanCharge).where(MerchantPlanCharge.merchant_id == merchant.id)
        .order_by(MerchantPlanCharge.created_at.desc()).limit(24)
    )).scalars().all()
    return {
        "currency": currency,
        "balance": f"{merchant.wallet_balance:.2f}",
        "canChange": role == "owner",
        "current": plans.plan_out(plan, currency) if plan else None,
        "subscription": plans.sub_out(sub),
        "plans": [plans.plan_out(p, currency) for p in catalogue],
        "usage": await plans.usage(db, merchant),
        "limitLabels": LIMIT_KEYS,
        "charges": [{
            "id": str(c.id), "planCode": c.plan_code, "kind": c.kind, "currency": c.currency,
            "amount": f"{c.amount:.2f}", "credit": f"{c.credit:.2f}", "status": c.status, "reason": c.reason,
            "createdAt": c.created_at.isoformat(),
        } for c in charges],
    }


@router.post("/merchants/{merchant_id}/plan")
async def choose_plan(merchant_id: str, body: ChoosePlan, user_id=Depends(get_current_user_id),
                      db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "owner")
    return await plans.choose(db, merchant, body.plan_code.strip().lower(), body.billing_cycle, user_id=user_id)


@router.post("/merchants/{merchant_id}/plan/cancel")
async def cancel_plan(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "owner")
    return await plans.cancel(db, merchant)


@router.get("/public/merchant-plans")
async def public_plans(currency: str = Query(default="ZAR", min_length=3, max_length=3),
                       db: AsyncSession = Depends(get_db)):
    """Published plans for the website's pricing page."""
    ccy = currency.upper()
    out = []
    for p in await plans.list_plans(db, published_only=True):
        row = plans.plan_out(p, ccy)
        row.pop("updatedBy", None)
        out.append(row)
    return {"currency": ccy, "plans": out}
