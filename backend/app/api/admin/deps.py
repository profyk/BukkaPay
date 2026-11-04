"""Admin auth dependencies — two paths, matching admin-routes.ts exactly:
a master API key via `x-admin-token` (machine-to-machine, e.g. ops
scripts), or a personal admin session via `Authorization: Bearer <token>`.
"""

from dataclasses import dataclass

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.admin import AdminUser
from app.services import admin_session_service


@dataclass
class AdminContext:
    is_master_key: bool
    admin: AdminUser | None = None

    @property
    def role(self) -> str | None:
        return self.admin.role if self.admin else None


async def admin_auth(
    x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> AdminContext:
    settings = get_settings()

    if x_admin_token:
        if not settings.admin_api_key:
            raise ApiError("Admin API not configured", status_code=503)
        if x_admin_token != settings.admin_api_key:
            raise ApiError("Invalid admin token", status_code=401)
        return AdminContext(is_master_key=True)

    bearer = (authorization or "").removeprefix("Bearer ").strip()
    if bearer:
        admin_id = await admin_session_service.verify_session(db, bearer)
        if admin_id is None:
            raise ApiError("Invalid or expired admin session", status_code=401)
        result = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
        admin = result.scalar_one_or_none()
        if admin is None or not admin.is_active:
            raise ApiError("Admin account inactive", status_code=401)
        return AdminContext(is_master_key=False, admin=admin)

    raise ApiError("Admin authentication required", status_code=401)


async def super_admin_or_master_key(ctx: AdminContext = Depends(admin_auth)) -> AdminContext:
    if ctx.is_master_key:
        return ctx
    if ctx.role == "super_admin":
        return ctx
    raise ApiError("Super admin or master key required", status_code=403)


def is_allowed_admin_origin(request: Request) -> bool:
    settings = get_settings()
    if not settings.is_production:
        return True
    origin = request.headers.get("origin", "")
    if not origin:
        return True
    allowed = settings.admin_allowed_origins_list or ["https://admin.bukkapay.com"]
    if origin.endswith((".vercel.app", ".netlify.app")):
        return True
    return any(origin.startswith(o) for o in allowed)
