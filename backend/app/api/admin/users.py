from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, admin_auth
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.admin import (
    AdminUserDetailResponse,
    AdminUserRow,
    BroadcastRequest,
    BroadcastResponse,
    FreezeUserRequest,
    KycListResponse,
    KycRejectRequest,
    NotifyUserRequest,
    UpdateUserRequest,
    UsersListResponse,
    VerifyUserRequest,
)
from app.services import admin_user_service as svc

router = APIRouter(tags=["admin-users"])


def _user_row(user, status: str | None = None) -> AdminUserRow:
    row = AdminUserRow.model_validate(user)
    row.status = status if status is not None else ("frozen" if user.frozen else "active")
    return row


@router.get("/users")
async def list_users(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    q: str | None = Query(default=None), frozen: bool | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> UsersListResponse:
    users, total = await svc.list_users(db, page=page, limit=limit, q=q, frozen=frozen)
    return UsersListResponse.model_validate({
        "users": [_user_row(u) for u in users],
        "pagination": {"page": page, "limit": limit, "total": total, "pages": -(-total // limit)},
    })


@router.get("/users/{user_id}")
async def get_user(
    user_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> AdminUserDetailResponse:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    detail = await svc.get_user_detail(db, user)
    detail["user"] = _user_row(user)
    return AdminUserDetailResponse.model_validate(detail)


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str, body: UpdateUserRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> AdminUserRow:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    updated = await svc.update_user(db, user, name=body.name, email=body.email, phone=body.phone, verified=body.verified)
    return _user_row(updated)


@router.patch("/users/{user_id}/freeze")
async def freeze_user(
    user_id: str, body: FreezeUserRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    frozen = body.frozen is not False
    updated = await svc.set_frozen(db, user, frozen)
    return {"success": True, "frozen": frozen, "user": _user_row(updated).model_dump(by_alias=True, mode="json")}


@router.patch("/users/{user_id}/verify")
async def verify_user(
    user_id: str, body: VerifyUserRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    verified = body.verified is not False
    updated = await svc.set_verified(db, user, verified)
    return {"success": True, "verified": verified, "user": _user_row(updated).model_dump(by_alias=True, mode="json")}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    username = user.username
    await svc.delete_user(db, user)
    return {"success": True, "message": f"User {username} deleted"}


@router.post("/users/{user_id}/notify", status_code=201)
async def notify_user(
    user_id: str, body: NotifyUserRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    await svc.notify_user(db, user, type=body.type, title=body.title, message=body.message)
    return {"success": True}


@router.post("/broadcast")
async def broadcast(
    body: BroadcastRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> BroadcastResponse:
    sent = await svc.broadcast(db, type=body.type, title=body.title, message=body.message)
    return BroadcastResponse.model_validate({"success": True, "sent": sent})


@router.get("/kyc")
async def list_kyc(
    page: int = Query(default=1, ge=1), limit: int = Query(default=50, ge=1, le=100),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> KycListResponse:
    rows, total = await svc.list_kyc(db, page=page, limit=limit)
    return KycListResponse.model_validate({
        "kyc": rows, "pagination": {"page": page, "limit": limit, "total": total, "pages": -(-total // limit)},
    })


@router.post("/kyc/{user_id}/approve")
async def approve_kyc(
    user_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    updated = await svc.approve_kyc(db, user)
    return {"success": True, "user": _user_row(updated).model_dump(by_alias=True, mode="json")}


@router.post("/kyc/{user_id}/reject")
async def reject_kyc(
    user_id: str, body: KycRejectRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    user = await svc.get_user(db, user_id)
    if user is None:
        raise ApiError("User not found", status_code=404)
    reason = await svc.reject_kyc(db, user, body.reason)
    return {"success": True, "reason": reason}
