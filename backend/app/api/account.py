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
    return {"canClose": not problems, "blockers": problems, "retentionYears": account_closure.RETENTION_YEARS,
            "confirmWith": "pin" if user.transaction_pin is not None else "password" if user.password else "set_pin"}


@router.get("/limits")
async def get_limits(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """The limits the customer set, per wallet currency, and today's spending."""
    from sqlalchemy import select

    from app.models.wallet import WalletCard
    from app.network import limits

    user = await db.get(User, user_id)
    currencies = sorted({c for (c,) in (await db.execute(select(WalletCard.currency).where(
        WalletCard.user_id == user_id))).all()})
    return {"increaseDelayHours": int(limits.INCREASE_DELAY.total_seconds() // 3600),
            "wallets": [{"currency": c, **limits.personal_limits(user, c),
                         "spentToday": f"{await limits.spent_today(db, user_id, c):.2f}"} for c in currencies]}


class LimitsIn(CamelModel):
    currency: str = Field(min_length=3, max_length=3)
    per_payment: str | None = None
    daily: str | None = None
    pin: str | None = None


@router.put("/limits", dependencies=[Depends(rate_limit("limits", 20, 3600))])
async def set_limits(body: LimitsIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Lowering applies now; raising (or removing) a limit applies after 24 hours. PIN required."""
    from decimal import Decimal, InvalidOperation

    from app.network import limits

    await pin_service.verify_pin(db, user_id, body.pin)

    def amount(v: str | None):
        if v in (None, ""):
            return None
        try:
            d = Decimal(str(v)).quantize(Decimal("0.01"))
        except InvalidOperation as e:
            raise ApiError("Enter limits as amounts, e.g. 1000") from e
        if d <= 0:
            raise ApiError("Limits must be more than zero (leave empty for no limit)")
        return d

    per, daily = amount(body.per_payment), amount(body.daily)
    if per is not None and daily is not None and per > daily:
        raise ApiError("The per-payment limit can't be higher than the daily limit")
    user = await db.get(User, user_id)
    stored = limits.set_personal_limits(user, body.currency.upper(), per, daily)
    await db.flush()
    return {"currency": body.currency.upper(), **limits.personal_limits(user, body.currency.upper()),
            "pending": stored.get("pending")}


class CloseIn(CamelModel):
    pin: str | None = None
    password: str | None = Field(default=None, max_length=200)
    confirm: str = Field(max_length=20)
    reason: str | None = Field(default=None, max_length=500)


@router.post("/close", dependencies=[Depends(rate_limit("account-close", 5, 3600))])
async def close_account(body: CloseIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Confirmed with the transaction PIN, or — for accounts without a PIN
    (e.g. web-only business owners) — the account password."""
    if body.confirm.strip().upper() != "DELETE":
        raise ApiError('Type DELETE to confirm')
    user = await db.get(User, user_id)
    if user.transaction_pin is not None:
        await pin_service.verify_pin(db, user_id, body.pin)
    elif user.password:
        from app.core.security import verify_secret

        if not body.password or not verify_secret(body.password, user.password)[0]:
            raise ApiError("Your password is incorrect", status_code=401)
    else:
        raise ApiError("Set a transaction PIN (Profile → Security) to confirm deleting your account", status_code=403)
    await account_closure.close(db, user, by="customer", reason=body.reason)
    return {"closed": True}
