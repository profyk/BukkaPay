"""Cash agents and the customer's account plan.

Customer (BukkaPay app):
    GET  /api/pricing/my-plan                     monthly fee, free months, this month's status
    GET  /api/agents                              active agents (by country / city)
    GET  /api/agents/cash-out/quote               fee for a cash withdrawal
    POST /api/agents/cash-out                     PIN → one-time 8-digit code (shown once)
    POST /api/agents/cash-out/{id}/cancel         unused code → money back
    GET  /api/agents/transactions                 my cash-ins and cash-outs

Agent (merchant dashboard; the agent is a KYB-approved merchant):
    GET  /api/merchants/{id}/agent                agent profile + float
    POST /api/merchants/{id}/agent                apply / update details (owner/admin)
    POST /api/merchants/{id}/agent/cash-in        customer hands over cash (PIN)
    POST /api/merchants/{id}/agent/cash-out       customer's code → hand over cash
    GET  /api/merchants/{id}/agent/transactions
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents import service
from app.api.deps import get_current_user_id
from app.api.merchant_platform import merchant_access
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.merchant import Merchant
from app.models.revenue import Agent, AgentTransaction
from app.models.user import User
from app.models.wallet import WalletCard
from app.pricing import service as pricing
from app.schemas.base import CamelModel
from app.services import pin_service, wallet_service

router = APIRouter(prefix="/api", tags=["agents"])


def _agent(a: Agent, *, public: bool = True) -> dict:
    out = {"id": str(a.id), "name": a.display_name, "address": a.address, "city": a.city, "country": a.country,
           "currency": a.currency, "phone": a.phone, "openingHours": a.opening_hours,
           "latitude": str(a.latitude) if a.latitude is not None else None,
           "longitude": str(a.longitude) if a.longitude is not None else None}
    if not public:
        out |= {"status": a.status, "dailyLimit": f"{a.daily_limit:.2f}",
                "approvedAt": a.approved_at.isoformat() if a.approved_at else None}
    return out


def _tx(t: AgentTransaction, *, for_agent: bool = False) -> dict:
    out = {"id": str(t.id), "reference": t.reference, "kind": t.kind, "status": t.status, "currency": t.currency,
           "amount": f"{t.amount:.2f}", "fee": f"{t.fee:.2f}", "createdAt": t.created_at.isoformat(),
           "expiresAt": t.expires_at.isoformat() if t.expires_at else None,
           "completedAt": t.completed_at.isoformat() if t.completed_at else None}
    if for_agent:
        out["commission"] = f"{t.commission:.2f}"
    return out


def _amount(value: str) -> Decimal:
    return posting.parse_amount(value)


async def _user(db: AsyncSession, user_id) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise ApiError("Not found", status_code=404)
    return user


async def _own_wallet(db: AsyncSession, user_id, wallet_id: str) -> WalletCard:
    try:
        wid = uuid.UUID(wallet_id)
    except ValueError as e:
        raise ApiError("Wallet not found", status_code=404) from e
    wallet = await db.get(WalletCard, wid)
    if wallet is None or wallet.user_id != user_id:
        raise ApiError("Wallet not found", status_code=404)
    return wallet


# ─── customer ───────────────────────────────────────────────────────────────


@router.get("/pricing/my-plan")
async def my_plan(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await pricing.my_plan(db, await _user(db, user_id))


@router.get("/agents")
async def list_agents(country: str | None = Query(default=None, max_length=2), city: str | None = Query(default=None),
                      user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    if country is None:
        country = (await _user(db, user_id)).residence_country
    return [_agent(a) for a in await service.nearby(db, country=country, city=city)]


@router.get("/agents/cash-out/quote")
async def quote_cash_out(wallet_id: str = Query(alias="walletId"), amount: str = Query(),
                         user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await _user(db, user_id)
    wallet = await _own_wallet(db, user_id, wallet_id)
    value = _amount(amount)
    fee = await service.quote_cash_out(db, user, wallet, value)
    return {"currency": wallet.currency, "amount": f"{value:.2f}", "fee": f"{fee:.2f}",
            "total": f"{value + fee:.2f}"}


class CashOutIn(CamelModel):
    wallet_id: str
    amount: str
    pin: str | None = None


@router.post("/agents/cash-out", status_code=201, dependencies=[Depends(rate_limit("agent-cash-out", 10, 60))])
async def request_cash_out(body: CashOutIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    await pin_service.verify_pin(db, user_id, body.pin)
    user = await _user(db, user_id)
    wallet = await _own_wallet(db, user_id, body.wallet_id)
    tx, code = await service.request_cash_out(db, user, wallet, _amount(body.amount))
    # The code is returned once and never stored in plain text.
    return {**_tx(tx), "code": code}


@router.post("/agents/cash-out/{tx_id}/cancel")
async def cancel_cash_out(tx_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    tx = await service.cancel_cash_out(db, await _user(db, user_id), tx_id)
    return _tx(tx)


@router.get("/agents/transactions")
async def my_agent_transactions(limit: int = Query(default=50, le=200), user_id=Depends(get_current_user_id),
                                db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AgentTransaction).where(AgentTransaction.user_id == user_id)
                             .order_by(AgentTransaction.created_at.desc()).limit(limit))).scalars()
    return [_tx(t) for t in rows]


# ─── agent (merchant dashboard) ─────────────────────────────────────────────


class AgentIn(CamelModel):
    display_name: str = Field(min_length=2, max_length=80)
    address: str = Field(min_length=5, max_length=300)
    city: str | None = Field(default=None, max_length=60)
    phone: str | None = Field(default=None, max_length=20)
    opening_hours: str | None = Field(default=None, max_length=80)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


async def _float(db: AsyncSession, merchant: Merchant, currency: str) -> str:
    acct = await ledger_accounts.merchant_account(db, merchant, currency)
    return f"{acct.balance:.2f}"


@router.get("/merchants/{merchant_id}/agent")
async def get_agent(merchant_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    agent = (await db.execute(select(Agent).where(Agent.merchant_id == merchant.id))).scalar_one_or_none()
    if agent is None:
        return {"agent": None, "eligible": merchant.kyb_status == "approved"}
    return {"agent": _agent(agent, public=False), "float": await _float(db, merchant, agent.currency),
            "todayVolume": f"{await service.volume_today(db, agent):.2f}"}


@router.post("/merchants/{merchant_id}/agent", status_code=201)
async def apply_agent(merchant_id: str, body: AgentIn, user_id=Depends(get_current_user_id),
                      db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "settings")
    agent = await service.apply(db, merchant, display_name=body.display_name, address=body.address, city=body.city,
                                phone=body.phone, opening_hours=body.opening_hours, latitude=body.latitude,
                                longitude=body.longitude)
    return _agent(agent, public=False)


class CashInIn(CamelModel):
    customer: str = Field(min_length=3, description="The customer's wallet ID, username, email or phone")
    amount: str
    pin: str | None = None


@router.post("/merchants/{merchant_id}/agent/cash-in", status_code=201,
             dependencies=[Depends(rate_limit("agent-cash-in", 30, 60))])
async def agent_cash_in(merchant_id: str, body: CashInIn, user_id=Depends(get_current_user_id),
                        db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    await pin_service.verify_pin(db, user_id, body.pin)
    agent = await service.agent_for_merchant(db, merchant)
    customer = await wallet_service.lookup_recipient(db, body.customer.strip())
    if customer is None or customer.account_type != "personal":
        raise ApiError("No BukkaPay customer found for that wallet ID", status_code=404)
    tx = await service.cash_in(db, agent, customer=customer, amount=_amount(body.amount), served_by=user_id)
    return {**_tx(tx, for_agent=True), "customerName": customer.name}


class CodeIn(CamelModel):
    code: str = Field(min_length=8, max_length=12)


@router.post("/merchants/{merchant_id}/agent/cash-out", dependencies=[Depends(rate_limit("agent-code", 20, 60))])
async def agent_cash_out(merchant_id: str, body: CodeIn, user_id=Depends(get_current_user_id),
                         db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "collect")
    agent = await service.agent_for_merchant(db, merchant)
    tx = await service.complete_cash_out(db, agent, code=body.code, served_by=user_id)
    return _tx(tx, for_agent=True)


@router.get("/merchants/{merchant_id}/agent/transactions")
async def agent_transactions(merchant_id: str, limit: int = Query(default=50, le=200),
                             user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    agent = await service.agent_for_merchant(db, merchant, require_active=False)
    rows = (await db.execute(select(AgentTransaction).where(AgentTransaction.agent_id == agent.id)
                             .order_by(AgentTransaction.created_at.desc()).limit(limit))).scalars()
    return [_tx(t, for_agent=True) for t in rows]
