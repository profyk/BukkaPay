"""Admin: merchant plans (Admin panel → Merchant plans).

Admins draft plans, set prices per currency and billing cycle, publish and
retire them. Viewing needs fees.view, changing needs fees.manage; every
change is audited with before/after.

Rules that keep merchants safe:
* Only published plans can be chosen, and only in a currency/cycle that has
  a price. Limits are enforced only once a plan is published.
* The default plan (where every business starts and falls back to) must be
  free, can't be retired, and there is exactly one.
* A retired plan keeps its current subscribers until their period ends; at
  renewal they move to the default plan.
* A plan can be deleted only while it's a draft nobody has ever been on.
"""

import re
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.plans import MerchantPlan, MerchantPlanCharge, MerchantPlanSubscription
from app.plans import service as plans
from app.plans.catalogue import LIMIT_KEYS
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-plans"])

CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,39}$")
CCY_RE = re.compile(r"^[A-Z]{3}$")
BOOL_LIMITS = {"api_access", "priority_support", "custom_branding", "multi_currency", "advanced_insights"}
COUNT_LIMITS = {"staff_seats", "checkout_links", "qr_codes"}


class PlanIn(CamelModel):
    code: str | None = None
    name: str | None = Field(default=None, max_length=80)
    tagline: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    sort_order: int | None = Field(default=None, ge=0, le=10000)
    highlighted: bool | None = None
    trial_days: int | None = Field(default=None, ge=0, le=365)
    prices: dict | None = None
    features: list[str] | None = None
    limits: dict | None = None


def _clean_prices(raw: dict) -> dict:
    out: dict = {}
    for ccy, cycles in (raw or {}).items():
        ccy = str(ccy).upper()
        if not CCY_RE.match(ccy) or not isinstance(cycles, dict):
            raise ApiError(f"Prices: use a 3-letter currency code with monthly/yearly amounts ({ccy})")
        row = {}
        for cycle in ("monthly", "yearly"):
            v = cycles.get(cycle)
            if v is None or str(v).strip() == "":
                continue  # not offered in this cycle yet
            try:
                amount = Decimal(str(v).replace(",", "").strip()).quantize(Decimal("0.01"))
            except InvalidOperation as e:
                raise ApiError(f"Prices: {ccy} {cycle} isn't a number") from e
            if amount < 0 or amount > Decimal("1000000"):
                raise ApiError(f"Prices: {ccy} {cycle} must be between 0 and 1,000,000")
            row[cycle] = f"{amount:.2f}"
        if row:
            out[ccy] = row
    return out


def _clean_limits(raw: dict) -> dict:
    out = {}
    for key, v in (raw or {}).items():
        if key not in LIMIT_KEYS:
            raise ApiError(f"Unknown limit: {key}")
        if key in BOOL_LIMITS:
            out[key] = bool(v)
        elif key in COUNT_LIMITS:
            if v is None or v == "":
                out[key] = None  # unlimited
            else:
                try:
                    n = int(v)
                except (TypeError, ValueError) as e:
                    raise ApiError(f"{LIMIT_KEYS[key]}: enter a whole number, or leave empty for unlimited") from e
                if n < 0 or n > 100000:
                    raise ApiError(f"{LIMIT_KEYS[key]}: 0 to 100,000")
                out[key] = n
        elif key == "settlement":
            if v not in ("weekly", "daily", "instant"):
                raise ApiError("Payout schedule must be weekly, daily or instant")
            out[key] = v
        elif key == "fee_discount_bps":
            n = int(v or 0)
            if not 0 <= n <= 500:
                raise ApiError("Fee discount: 0 to 500 basis points")
            out[key] = n
    return out


def _clean_features(raw: list[str]) -> list[str]:
    feats = [" ".join(str(f).split()) for f in raw if str(f).strip()]
    if len(feats) > 20 or any(len(f) > 140 for f in feats):
        raise ApiError("Features: at most 20 lines of up to 140 characters")
    return feats


def _is_free(plan: MerchantPlan) -> bool:
    return all(Decimal(v) == 0 for cycles in (plan.prices or {}).values() for v in cycles.values())


async def _stats(db: AsyncSession) -> dict:
    live = (await db.execute(
        select(MerchantPlanSubscription.plan_code, MerchantPlanSubscription.currency,
               MerchantPlanSubscription.billing_cycle, func.count(), func.sum(MerchantPlanSubscription.price))
        .where(MerchantPlanSubscription.status.in_(plans.LIVE))
        .group_by(MerchantPlanSubscription.plan_code, MerchantPlanSubscription.currency,
                  MerchantPlanSubscription.billing_cycle)
    )).all()
    out: dict = {}
    for code, ccy, cycle, n, total in live:
        s = out.setdefault(code, {"subscribers": 0, "mrr": {}})
        s["subscribers"] += n
        monthly = Decimal(total or 0) / (12 if cycle == "yearly" else 1)
        s["mrr"][ccy] = f"{Decimal(s['mrr'].get(ccy, '0')) + monthly:.2f}"
    return out


@router.get("/merchant-plans")
async def list_plans(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    stats = await _stats(db)
    past_due = (await db.execute(select(func.count()).select_from(MerchantPlanSubscription)
                                 .where(MerchantPlanSubscription.status == "past_due"))).scalar() or 0
    rows = []
    for p in await plans.list_plans(db):
        row = plans.plan_out(p)
        row.update(stats.get(p.code, {"subscribers": 0, "mrr": {}}))
        rows.append(row)
    return {"plans": rows, "limitLabels": LIMIT_KEYS, "pastDue": past_due}


@router.get("/merchant-plans/charges")
async def recent_charges(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    from app.models.merchant import Merchant

    rows = (await db.execute(
        select(MerchantPlanCharge, Merchant.business_name).join(Merchant, Merchant.id == MerchantPlanCharge.merchant_id)
        .order_by(MerchantPlanCharge.created_at.desc()).limit(100)
    )).all()
    return [{"id": str(c.id), "merchantId": str(c.merchant_id), "businessName": name, "planCode": c.plan_code,
             "kind": c.kind, "currency": c.currency, "amount": f"{c.amount:.2f}", "credit": f"{c.credit:.2f}",
             "status": c.status, "reason": c.reason, "createdAt": c.created_at.isoformat()} for c, name in rows]


@router.post("/merchant-plans", status_code=201)
async def create_plan(body: PlanIn, ctx: AdminContext = Depends(require("fees.manage")),
                      db: AsyncSession = Depends(get_db)):
    code = (body.code or "").strip().lower()
    if not CODE_RE.match(code):
        raise ApiError("Code: 2-40 lowercase letters, numbers, dashes or underscores (e.g. growth)")
    if await plans.get_plan(db, code):
        raise ApiError("A plan with this code already exists", status_code=409)
    name = " ".join((body.name or "").split())
    if len(name) < 2:
        raise ApiError("Give the plan a name")
    plan = MerchantPlan(
        code=code, name=name, tagline=body.tagline, description=body.description, status="draft",
        sort_order=body.sort_order or 0, highlighted=bool(body.highlighted), trial_days=body.trial_days or 0,
        prices=_clean_prices(body.prices or {}), features=_clean_features(body.features or []),
        limits=_clean_limits(body.limits or {}), updated_by=ctx.actor_id or "master_key",
    )
    db.add(plan)
    await db.flush()
    await ctx.audit(db, "merchant_plan.created", target_type="merchant_plan", target_id=code,
                    details={"after": plans.plan_out(plan)})
    return plans.plan_out(plan)


@router.patch("/merchant-plans/{code}")
async def update_plan(code: str, body: PlanIn, ctx: AdminContext = Depends(require("fees.manage")),
                      db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    before = plans.plan_out(plan)
    if body.name is not None:
        name = " ".join(body.name.split())
        if len(name) < 2:
            raise ApiError("Give the plan a name")
        plan.name = name
    for attr in ("tagline", "description", "sort_order", "highlighted", "trial_days"):
        v = getattr(body, attr)
        if v is not None:
            setattr(plan, attr, v)
    if body.prices is not None:
        plan.prices = _clean_prices(body.prices)
    if body.features is not None:
        plan.features = _clean_features(body.features)
    if body.limits is not None:
        plan.limits = {**(plan.limits or {}), **_clean_limits(body.limits)}
    if plan.is_default and not _is_free(plan):
        raise ApiError("The default plan must be free: set its prices to 0 or make another plan the default")
    if plan.status == "published" and not plan.prices:
        raise ApiError("A published plan needs at least one price")
    plan.updated_by = ctx.actor_id or "master_key"
    await db.flush()
    await db.refresh(plan)
    await ctx.audit(db, "merchant_plan.updated", target_type="merchant_plan", target_id=plan.code,
                    details={"before": before, "after": plans.plan_out(plan)})
    return plans.plan_out(plan)


@router.post("/merchant-plans/{code}/publish")
async def publish(code: str, ctx: AdminContext = Depends(require("fees.manage")), db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    if not plan.prices:
        raise ApiError("Set at least one price (currency and monthly or yearly) before publishing")
    if plan.is_default and not _is_free(plan):
        raise ApiError("The default plan must be free")
    return await _set_status(db, ctx, plan, "published")


@router.post("/merchant-plans/{code}/unpublish")
async def unpublish(code: str, ctx: AdminContext = Depends(require("fees.manage")), db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    if await _live_count(db, plan.code):
        raise ApiError("Businesses are on this plan: retire it instead, so they keep it until their period ends",
                       status_code=409)
    if plan.is_default:
        raise ApiError("Make another plan the default first", status_code=409)
    return await _set_status(db, ctx, plan, "draft")


@router.post("/merchant-plans/{code}/retire")
async def retire(code: str, ctx: AdminContext = Depends(require("fees.manage")), db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    if plan.is_default:
        raise ApiError("The default plan can't be retired: make another plan the default first", status_code=409)
    return await _set_status(db, ctx, plan, "retired")


@router.post("/merchant-plans/{code}/default")
async def make_default(code: str, ctx: AdminContext = Depends(require("fees.manage")),
                       db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    if not _is_free(plan) or not plan.prices:
        raise ApiError("Only a free plan (all prices 0) can be the default")
    if plan.status == "retired":
        raise ApiError("A retired plan can't be the default")
    await db.execute(update(MerchantPlan).where(MerchantPlan.code != plan.code).values(is_default=False))
    plan.is_default = True
    plan.updated_by = ctx.actor_id or "master_key"
    await db.flush()
    await ctx.audit(db, "merchant_plan.default_set", target_type="merchant_plan", target_id=plan.code, details={})
    return plans.plan_out(plan)


@router.delete("/merchant-plans/{code}")
async def delete_plan(code: str, ctx: AdminContext = Depends(require("fees.manage")),
                      db: AsyncSession = Depends(get_db)):
    plan = await _get(db, code)
    ever = (await db.execute(select(func.count()).select_from(MerchantPlanSubscription)
                             .where(MerchantPlanSubscription.plan_code == plan.code))).scalar() or 0
    if plan.status != "draft" or ever or plan.is_default:
        raise ApiError("Only a draft nobody has ever been on can be deleted: retire it instead", status_code=409)
    before = plans.plan_out(plan)
    await db.delete(plan)
    await db.flush()
    await ctx.audit(db, "merchant_plan.deleted", target_type="merchant_plan", target_id=code, details={"before": before})
    return {"deleted": code}


async def _get(db: AsyncSession, code: str) -> MerchantPlan:
    plan = await plans.get_plan(db, code.strip().lower())
    if plan is None:
        raise ApiError("Plan not found", status_code=404)
    return plan


async def _live_count(db: AsyncSession, code: str) -> int:
    return (await db.execute(select(func.count()).select_from(MerchantPlanSubscription).where(
        MerchantPlanSubscription.plan_code == code, MerchantPlanSubscription.status.in_(plans.LIVE)))).scalar() or 0


async def _set_status(db: AsyncSession, ctx: AdminContext, plan: MerchantPlan, status: str) -> dict:
    before = plan.status
    plan.status = status
    plan.updated_by = ctx.actor_id or "master_key"
    await db.flush()
    await db.refresh(plan)
    await ctx.audit(db, f"merchant_plan.{status}", target_type="merchant_plan", target_id=plan.code,
                    details={"before": before, "after": status})
    return plans.plan_out(plan)
