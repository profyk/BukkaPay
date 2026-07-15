from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, admin_auth, is_allowed_admin_origin, super_admin_or_master_key
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMeResponse,
    AdminSetupRequest,
    AdminUserResponse,
    CreateAdminRequest,
    UpdateAdminRequest,
)
from app.services import admin_auth_service as svc

router = APIRouter(tags=["admin-auth"])


@router.post("/setup", status_code=201)
async def setup(
    body: AdminSetupRequest, x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.admin_api_key:
        raise ApiError("ADMIN_API_KEY not configured", status_code=503)
    if not x_admin_token or x_admin_token != settings.admin_api_key:
        raise ApiError("Invalid master key", status_code=401)

    admin = await svc.create_first_super_admin(db, email=body.email, name=body.name, password=body.password)
    return {"message": "Super admin created successfully", "admin": AdminUserResponse.model_validate(admin).model_dump(by_alias=True, mode="json")}


@router.post("/auth/login")
async def login(body: AdminLoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AdminLoginResponse:
    if not is_allowed_admin_origin(request):
        raise ApiError("Admin login is only available from admin.bukkapay.com", status_code=403)
    token, expires_at, admin = await svc.login(db, email=body.email, password=body.password)
    return AdminLoginResponse.model_validate({"token": token, "expiresAt": expires_at, "admin": admin})


@router.get("/auth/me")
async def me(ctx: AdminContext = Depends(admin_auth)) -> AdminMeResponse:
    if ctx.is_master_key:
        return AdminMeResponse.model_validate({"role": "master", "name": "Master Key", "email": None})
    return AdminMeResponse.model_validate(ctx.admin)


@router.post("/auth/logout")
async def logout(
    authorization: str | None = Header(default=None), _ctx: AdminContext = Depends(admin_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    bearer = (authorization or "").removeprefix("Bearer ").strip()
    if bearer:
        await svc.logout(db, bearer)
    return {"success": True}


@router.get("/admins")
async def list_admins(
    _ctx: AdminContext = Depends(super_admin_or_master_key), db: AsyncSession = Depends(get_db)
) -> list[AdminUserResponse]:
    admins = await svc.list_admins(db)
    return [AdminUserResponse.model_validate(a) for a in admins]


@router.post("/admins", status_code=201)
async def create_admin(
    body: CreateAdminRequest, _ctx: AdminContext = Depends(super_admin_or_master_key),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    admin = await svc.create_admin(db, email=body.email, name=body.name, password=body.password, role=body.role)
    return AdminUserResponse.model_validate(admin)


@router.patch("/admins/{admin_id}")
async def update_admin(
    admin_id: str, body: UpdateAdminRequest, _ctx: AdminContext = Depends(super_admin_or_master_key),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    admin = await svc.update_admin(
        db, admin_id, name=body.name, email=body.email, password=body.password, role=body.role,
        is_active=body.is_active,
    )
    return AdminUserResponse.model_validate(admin)


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str, _ctx: AdminContext = Depends(super_admin_or_master_key), db: AsyncSession = Depends(get_db)
) -> dict:
    admin = await svc.delete_admin(db, admin_id)
    return {"success": True, "message": f"Admin {admin.email} deleted"}
