"""Account deletion from the app (Google Play / App Store requirement).

GET  /api/account/closure-check   what stops the account closing right now
POST /api/account/close           PIN + typed confirmation → account closed
"""

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import account_closure, pin_service

router = APIRouter(prefix="/api/account", tags=["account"])


@router.get("/closure-check")
async def closure_check(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    problems = await account_closure.blockers(db, user)
    return {"canClose": not problems, "blockers": problems, "retentionYears": account_closure.RETENTION_YEARS}


class CloseIn(CamelModel):
    pin: str | None = None
    confirm: str = Field(max_length=20)
    reason: str | None = Field(default=None, max_length=500)


@router.post("/close", dependencies=[Depends(rate_limit("account-close", 5, 3600))])
async def close_account(body: CloseIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    if body.confirm.strip().upper() != "DELETE":
        raise ApiError('Type DELETE to confirm')
    await pin_service.verify_pin(db, user_id, body.pin)
    user = await db.get(User, user_id)
    await account_closure.close(db, user, by="customer", reason=body.reason)
    return {"closed": True}
