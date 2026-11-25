"""Analytics for customers (BukkaPay app) and merchants (merchant dashboard)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics import service
from app.api.deps import get_current_user_id
from app.api.merchant_platform import merchant_access
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.user import User

router = APIRouter(prefix="/api", tags=["analytics"])


@router.get("/analytics")
async def my_analytics(days: int = Query(default=30, ge=7, le=365), currency: str | None = Query(default=None),
                       user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if user is None:
        raise ApiError("Not found", status_code=404)
    return await service.customer(db, user, days=days, currency=currency)


@router.get("/merchants/{merchant_id}/insights")
async def merchant_analytics(merchant_id: str, days: int = Query(default=30, ge=7, le=365),
                             user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    merchant, _ = await merchant_access(db, merchant_id, user_id, "view")
    return await service.merchant(db, merchant, days=days)
