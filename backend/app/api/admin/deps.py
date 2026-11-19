"""Admin auth dependencies — two paths, matching admin-routes.ts exactly:
a master API key via `x-admin-token` (machine-to-machine, e.g. ops
scripts), or a personal admin session via `Authorization: Bearer <token>`.
"""

import hmac
from dataclasses import dataclass

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.deps import get_db
from app.governance import audit
from app.governance.permissions import permissions_for
from app.models.admin import AdminUser
from app.services import admin_session_service


@dataclass
class AdminContext:
    is_master_key: bool
    admin: AdminUser | None = None
    ip: str | None = None

    @property
    def role(self) -> str | None:
        return self.admin.role if self.admin else None

    @property
    def permissions(self) -> set[str]:
        return permissions_for(self.role, is_master_key=self.is_master_key)

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    @property
    def actor_id(self) -> str | None:
        return str(self.admin.id) if self.admin else None

    async def audit(self, db: AsyncSession, action: str, *, target_type: str | None = None,
                    target_id=None, details: dict | None = None) -> None:
        await audit.record(
            db, actor_type="master_key" if self.is_master_key else "admin", actor_id=self.actor_id,
            actor_email=self.admin.email if self.admin else None, action=action,
            target_type=target_type, target_id=target_id, details=details, ip=self.ip,
        )


async def admin_auth(
    request: Request,
    x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> AdminContext:
    settings = get_settings()

    if x_admin_token:
        if not settings.admin_api_key:
            raise ApiError("Admin API not configured", status_code=503)
        if not hmac.compare_digest(x_admin_token.encode(), settings.admin_api_key.encode()):
            raise ApiError("Invalid admin token", status_code=401)
        return AdminContext(is_master_key=True, ip=_client_ip(request))

    bearer = (authorization or "").removeprefix("Bearer ").strip()
    if bearer:
        admin_id = await admin_session_service.verify_session(db, bearer)
        if admin_id is None:
            raise ApiError("Invalid or expired admin session", status_code=401)
        result = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
        admin = result.scalar_one_or_none()
        if admin is None or not admin.is_active:
            raise ApiError("Admin account inactive", status_code=401)
        # MFA is mandatory for every privileged account in production: until
        # it's enrolled, the session can only enrol it.
        if (settings.is_production and not admin.mfa_enabled
                and not request.url.path.endswith(("/auth/mfa/setup", "/auth/mfa/confirm", "/auth/me",
                                                    "/auth/logout"))):
            raise ApiError("Set up multi-factor authentication to continue", status_code=403)
        return AdminContext(is_master_key=False, admin=admin, ip=_client_ip(request))

    raise ApiError("Admin authentication required", status_code=401)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


_REDACT = {"password", "pin", "otp", "mfa_code", "mfaCode", "secret", "token", "newPin", "currentPin"}


def _redact(value):
    if isinstance(value, dict):
        return {k: ("[redacted]" if k in _REDACT else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def require(permission: str):
    """Dependency: an authenticated admin holding `permission`.

    Every non-GET request through it is written to the audit log in the same
    database transaction as the action (so it commits iff the action does),
    with the route, path parameters and the redacted request body."""

    async def dependency(
        request: Request, ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
    ) -> AdminContext:
        if not ctx.can(permission):
            raise ApiError(f"Missing permission: {permission}", status_code=403)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            import json

            raw = await request.body()
            try:
                body = json.loads(raw) if raw else None
            except ValueError:
                body = {"_non_json_bytes": len(raw)}
            route = request.scope.get("route")
            params = dict(request.path_params)
            await ctx.audit(
                db, f"{request.method} /api/admin{route.path}" if route is not None
                else f"{request.method} {request.url.path}",
                target_type=next(iter(params), None), target_id=next(iter(params.values()), None),
                details={"permission": permission, "params": params, "body": _redact(body),
                         "query": dict(request.query_params)},
            )
        return ctx

    return dependency


async def super_admin_or_master_key(ctx: AdminContext = Depends(admin_auth)) -> AdminContext:
    if ctx.is_master_key:
        return ctx
    if ctx.role == "super_admin":
        return ctx
    raise ApiError("Super admin or master key required", status_code=403)


def is_allowed_admin_origin(request: Request) -> bool:
    """Admin sign-in is only accepted from the admin panel's own origin(s).

    Exact origin match only: a prefix match would let
    https://admin.bukkapay.com.attacker.example through, and a blanket
    *.vercel.app rule would let anyone's Vercel deployment through. Preview
    deployments that need admin access are listed in ADMIN_ALLOWED_ORIGINS."""
    settings = get_settings()
    if not settings.is_production:
        return True
    origin = request.headers.get("origin", "").rstrip("/")
    if not origin:
        # Non-browser clients (scripts with the master key, tests) send none;
        # a browser always sends Origin on a cross-site POST.
        return True
    allowed = settings.admin_allowed_origins_list or ["https://admin.bukkapay.com"]
    return origin in {o.rstrip("/") for o in allowed}
