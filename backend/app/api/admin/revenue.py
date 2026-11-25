"""Admin: revenue, pricing policy, monthly account fees and cash agents.

Prices themselves are fee rules (/network/fees, products such as
`account_monthly` and `cash_out`). This adds the policy around them
(waivers, agent commission), a fee simulator, the revenue report and agent
approval.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import service as agents
from app.api.admin.deps import AdminContext, require
from app.api.admin.network import row
from app.core.errors import ApiError
from app.db.deps import get_db
from app.ledger import posting
from app.models.platform import FEE_PRODUCTS
from app.models.revenue import AccountFeeCharge, Agent, AgentTransaction
from app.pricing import service as pricing
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-revenue"])


@router.get("/revenue")
async def revenue(days: int = Query(default=30, ge=1, le=366), _=Depends(require("fees.view")),
                  db: AsyncSession = Depends(get_db)):
    since = datetime.now(UTC) - timedelta(days=days)
    return {"since": since.isoformat(), "streams": await pricing.revenue_report(db, since=since)}


@router.get("/analytics")
async def platform_analytics(days: int = Query(default=30, ge=7, le=365), _=Depends(require("dashboard.view")),
                             db: AsyncSession = Depends(get_db)):
    """Growth, activity, volume, revenue, reach and KYC funnel, per currency."""
    from app.analytics import service

    return await service.platform(db, days=days)


@router.get("/pricing/settings")
async def get_settings(_=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    return {key: await pricing.get_setting(db, key) for key in pricing.DEFAULTS}


@router.patch("/pricing/settings/{key}")
async def update_setting(key: str, changes: dict, ctx: AdminContext = Depends(require("fees.manage")),
                         db: AsyncSession = Depends(get_db)):
    before = await pricing.get_setting(db, key) if key in pricing.DEFAULTS else None
    after = await pricing.set_setting(db, key, changes, actor=ctx.actor_id or "master_key")
    await ctx.audit(db, "pricing.setting_updated", target_type="pricing_setting", target_id=key,
                    details={"before": before, "after": after})
    return after


class SimulateIn(CamelModel):
    product: str
    amount: str = "0"
    currency: str = Field(min_length=3, max_length=3)
    country: str | None = Field(default=None, max_length=2)
    method: str | None = None
    customer_type: Literal["personal", "business"] | None = None


@router.post("/pricing/simulate")
async def simulate(body: SimulateIn, _=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    if body.product not in FEE_PRODUCTS:
        raise ApiError(f"Unknown product. Use one of: {', '.join(FEE_PRODUCTS)}")
    try:
        amount = Decimal(body.amount or "0").quantize(Decimal("0.01"))
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if amount < 0:
        raise ApiError("Invalid amount")
    return await pricing.simulate(db, product=body.product, amount=amount, currency=body.currency.upper(),
                                  country=body.country.upper() if body.country else None, method=body.method,
                                  customer_type=body.customer_type)


@router.get("/account-fees")
async def account_fees(period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
                       status: Literal["charged", "due", "waived"] | None = None,
                       limit: int = Query(default=100, le=500),
                       _=Depends(require("fees.view")), db: AsyncSession = Depends(get_db)):
    period = period or pricing.period_of(datetime.now(UTC))
    summary = (await db.execute(
        select(AccountFeeCharge.status, AccountFeeCharge.reason, AccountFeeCharge.currency, func.count(),
               func.coalesce(func.sum(AccountFeeCharge.amount), 0))
        .where(AccountFeeCharge.period == period)
        .group_by(AccountFeeCharge.status, AccountFeeCharge.reason, AccountFeeCharge.currency)
    )).all()
    q = select(AccountFeeCharge).where(AccountFeeCharge.period == period)
    if status:
        q = q.where(AccountFeeCharge.status == status)
    rows = (await db.execute(q.order_by(AccountFeeCharge.updated_at.desc()).limit(limit))).scalars()
    return {
        "period": period,
        "summary": [{"status": s, "reason": r, "currency": c, "count": n, "amount": f"{a:.2f}"}
                    for s, r, c, n, a in summary],
        "items": [row(x) for x in rows],
    }


# ─── agents ─────────────────────────────────────────────────────────────────


@router.get("/agents")
async def list_agents(status: Literal["pending", "active", "suspended"] | None = None,
                      _=Depends(require("merchants.view")), db: AsyncSession = Depends(get_db)):
    q = select(Agent).order_by(Agent.created_at.desc()).limit(500)
    if status:
        q = q.where(Agent.status == status)
    return [row(a) for a in (await db.execute(q)).scalars()]


class AgentPatch(CamelModel):
    status: Literal["pending", "active", "suspended"] | None = None
    daily_limit: str | None = None


def _agent_id(agent_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(agent_id)
    except ValueError as e:
        raise ApiError("Agent not found", status_code=404) from e


@router.patch("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentPatch, ctx: AdminContext = Depends(require("merchants.manage")),
                       db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, _agent_id(agent_id), with_for_update=True)
    if agent is None:
        raise ApiError("Agent not found", status_code=404)
    before = {"status": agent.status, "dailyLimit": f"{agent.daily_limit:.2f}"}
    if body.status == "active":
        from app.models.merchant import Merchant

        merchant = await db.get(Merchant, agent.merchant_id)
        if merchant is None or merchant.kyb_status != "approved":
            raise ApiError("The business behind this agent isn't verified", status_code=409)
    if body.status:
        await agents.set_status(db, agent, body.status, actor=ctx.actor_id or "master_key")
    if body.daily_limit is not None:
        agent.daily_limit = posting.parse_amount(body.daily_limit, field="daily limit")
    await db.flush()
    await ctx.audit(db, "agent.updated", target_type="agent", target_id=str(agent.id),
                    details={"before": before, "after": {"status": agent.status,
                                                         "dailyLimit": f"{agent.daily_limit:.2f}"}})
    return row(agent)


@router.get("/agents/{agent_id}/transactions")
async def agent_transactions(agent_id: str, limit: int = Query(default=100, le=500),
                             _=Depends(require("transactions.view")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AgentTransaction).where(AgentTransaction.agent_id == _agent_id(agent_id))
                             .order_by(AgentTransaction.created_at.desc()).limit(limit))).scalars()
    # never the code hash, even to admins
    return [{k: v for k, v in row(t).items() if k != "codeHash"} for t in rows]
