from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.db.deps import get_db
from app.schemas.admin import (
    AdminClaimsListResponse,
    AdminMerchantsListResponse,
    AdminStatsResponse,
    AdminVirtualCardsListResponse,
    AuditLogsResponse,
    PlatformWalletResponse,
    SavingsGroupsListResponse,
    UpdatePricingRequest,
)
from app.services import admin_platform_service as svc
from app.services import platform_wallet_service

router = APIRouter(tags=["admin-platform"])


def _pages(total: int, limit: int) -> int:
    return -(-total // limit)


@router.get("/stats")
async def get_stats(_ctx: AdminContext = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)) -> AdminStatsResponse:
    stats = await svc.get_stats(db)
    return AdminStatsResponse.model_validate(stats)


@router.get("/merchants")
async def list_merchants(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    _ctx: AdminContext = Depends(require("merchants.view")), db: AsyncSession = Depends(get_db),
) -> AdminMerchantsListResponse:
    rows, total = await svc.list_merchants(db, page=page, limit=limit)
    merchants = [
        {**{c.name: getattr(m, c.name) for c in m.__table__.columns}, "user": user}
        for m, user in rows
    ]
    return AdminMerchantsListResponse.model_validate({
        "merchants": merchants,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


@router.get("/virtual-cards")
async def list_virtual_cards(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    _ctx: AdminContext = Depends(require("wallets.view")), db: AsyncSession = Depends(get_db),
) -> AdminVirtualCardsListResponse:
    rows, total = await svc.list_virtual_cards(db, page=page, limit=limit)
    cards = [
        {**{c.name: getattr(vc, c.name) for c in vc.__table__.columns}, "user": user}
        for vc, user in rows
    ]
    return AdminVirtualCardsListResponse.model_validate({
        "virtualCards": cards,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


@router.get("/stokvels")
async def list_savings_groups(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    _ctx: AdminContext = Depends(require("transactions.view")), db: AsyncSession = Depends(get_db),
) -> SavingsGroupsListResponse:
    rows, total = await svc.list_savings_groups(db, page=page, limit=limit)
    return SavingsGroupsListResponse.model_validate({
        "stokvels": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })


@router.get("/pricing")
async def get_pricing(_ctx: AdminContext = Depends(require("fees.view"))) -> dict:
    return await svc.get_pricing()


@router.patch("/pricing")
async def update_pricing(
    body: UpdatePricingRequest, _ctx: AdminContext = Depends(require("fees.manage"))
) -> dict:
    return await svc.update_pricing(body.category, body.values)


@router.get("/platform-wallet")
async def get_platform_wallet(
    _ctx: AdminContext = Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)
) -> PlatformWalletResponse:
    cards = await platform_wallet_service.get_balances(db)
    return PlatformWalletResponse.model_validate({
        "balances": [{"currency": c.currency, "balance": c.balance} for c in cards],
    })


@router.get("/audit-logs")
async def audit_logs(_ctx: AdminContext = Depends(require("audit.view"))) -> AuditLogsResponse:
    # Placeholder — no audit_logs table yet, matching the Node stub exactly.
    return AuditLogsResponse.model_validate({"logs": [], "pagination": {"page": 1, "limit": 50, "total": 0, "pages": 0}})


@router.get("/claims")
async def list_claims(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    _ctx: AdminContext = Depends(require("transactions.view")), db: AsyncSession = Depends(get_db),
) -> AdminClaimsListResponse:
    rows, total = await svc.list_claims(db, page=page, limit=limit)
    return AdminClaimsListResponse.model_validate({
        "claims": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "pages": _pages(total, limit)},
    })
