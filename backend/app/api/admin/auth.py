import hmac

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import (
    AdminContext,
    admin_auth,
    is_allowed_admin_origin,
    require,
)
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.admin import (
    AcceptInviteRequest,
    AdminInviteResponse,
    AdminLoginRequest,
    AdminLoginResponse,
    AdminMeResponse,
    AdminSetupRequest,
    AdminUserResponse,
    CreateAdminRequest,
    CreateInviteRequest,
    InviteLinkResponse,
    PublicInviteResponse,
    UpdateAdminRequest,
)
from app.schemas.base import CamelModel
from app.services import admin_auth_service as svc

router = APIRouter(tags=["admin-auth"])


def _only_owner_appoints_ceo(ctx: AdminContext, role: str | None) -> None:
    from app.governance.owner import is_owner_email

    if role == "ceo" and not (ctx.admin is not None and is_owner_email(ctx.admin.email)):
        raise ApiError("Only the platform owner can appoint a CEO", status_code=403)


@router.post("/setup", status_code=201, dependencies=[Depends(rate_limit("admin-setup", 5, 3600))])
async def setup(
    body: AdminSetupRequest, x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    settings = get_settings()
    if not settings.admin_api_key:
        raise ApiError("ADMIN_API_KEY not configured", status_code=503)
    if not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), settings.admin_api_key.encode()):
        raise ApiError("Invalid master key", status_code=401)

    admin = await svc.create_first_super_admin(db, email=body.email, name=body.name, password=body.password)
    return {"message": "Super admin created successfully", "admin": AdminUserResponse.model_validate(admin).model_dump(by_alias=True, mode="json")}


@router.post("/auth/login", dependencies=[Depends(rate_limit("admin-login", 10, 900))])
async def login(body: AdminLoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AdminLoginResponse:
    if not is_allowed_admin_origin(request):
        raise ApiError("Admin login is only available from admin.bukkapay.com", status_code=403)
    token, expires_at, admin = await svc.login(db, email=body.email, password=body.password, otp=body.otp)
    return AdminLoginResponse.model_validate({"token": token, "expiresAt": expires_at, "admin": admin})


@router.post("/auth/mfa/setup")
async def setup_mfa(
    ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    if ctx.is_master_key or ctx.admin is None:
        raise ApiError("Personal admin session required", status_code=401)
    return await svc.setup_mfa(db, admin_id=str(ctx.admin.id))


class MfaConfirmRequest(CamelModel):
    otp: str


@router.post("/auth/mfa/confirm")
async def confirm_mfa(
    body: MfaConfirmRequest, ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> dict:
    if ctx.is_master_key or ctx.admin is None:
        raise ApiError("Personal admin session required", status_code=401)
    return await svc.confirm_mfa(db, admin_id=str(ctx.admin.id), otp=body.otp)


@router.get("/auth/me")
async def me(ctx: AdminContext = Depends(admin_auth)) -> AdminMeResponse:
    perms = sorted(ctx.permissions)
    if ctx.is_master_key:
        return AdminMeResponse.model_validate({"role": "master", "name": "Master Key", "email": None,
                                               "permissions": perms, "mfaEnabled": True})
    return AdminMeResponse.model_validate({
        "id": str(ctx.admin.id), "role": ctx.admin.role, "name": ctx.admin.name, "email": ctx.admin.email,
        "permissions": perms, "mfaEnabled": ctx.admin.mfa_enabled,
    })


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
    _ctx: AdminContext = Depends(require("admins.manage")), db: AsyncSession = Depends(get_db)
) -> list[AdminUserResponse]:
    admins = await svc.list_admins(db)
    return [AdminUserResponse.model_validate(a) for a in admins]


@router.post("/admins", status_code=201)
async def create_admin(
    body: CreateAdminRequest, _ctx: AdminContext = Depends(require("admins.manage")),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    _only_owner_appoints_ceo(_ctx, body.role)
    admin = await svc.create_admin(db, email=body.email, name=body.name, password=body.password, role=body.role)
    return AdminUserResponse.model_validate(admin)


@router.patch("/admins/{admin_id}")
async def update_admin(
    admin_id: str, body: UpdateAdminRequest, _ctx: AdminContext = Depends(require("admins.manage")),
    db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    _only_owner_appoints_ceo(_ctx, body.role)
    admin = await svc.update_admin(
        db, admin_id, name=body.name, email=body.email, password=body.password, role=body.role,
        is_active=body.is_active,
    )
    return AdminUserResponse.model_validate(admin)


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str, _ctx: AdminContext = Depends(require("admins.manage")), db: AsyncSession = Depends(get_db)
) -> dict:
    admin = await svc.delete_admin(db, admin_id)
    return {"success": True, "message": f"Admin {admin.email} deleted"}


# ─── Invitations ────────────────────────────────────────────────────────────


def _invite_out(invite) -> AdminInviteResponse:
    return AdminInviteResponse.model_validate({
        "id": invite.id, "email": invite.email, "name": invite.name, "role": str(invite.role),
        "status": svc.invite_status(invite), "expiresAt": invite.expires_at, "createdAt": invite.created_at,
    })


@router.post("/owner-invite", status_code=201, dependencies=[Depends(rate_limit("owner-invite", 5, 3600))])
async def owner_invite(ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)) -> dict:
    """Email the platform owner a super-admin setup/reset link. Requires the
    server's master key; the link is never returned, only emailed."""
    if not ctx.is_master_key:
        raise ApiError("Master key required", status_code=403)
    invite, _link, sent = await svc.create_owner_invite(db)
    if not sent:
        raise ApiError("Email delivery failed; the invitation was not sent", status_code=502)
    return {"sent": True, "to": invite.email, "expiresAt": invite.expires_at.isoformat()}


@router.get("/invites")
async def list_invites(
    _ctx: AdminContext = Depends(require("admins.manage")), db: AsyncSession = Depends(get_db),
) -> list[AdminInviteResponse]:
    return [_invite_out(i) for i in await svc.list_invites(db)]


@router.post("/invites", status_code=201)
async def create_invite(
    body: CreateInviteRequest, ctx: AdminContext = Depends(require("admins.manage")),
    db: AsyncSession = Depends(get_db),
) -> InviteLinkResponse:
    _only_owner_appoints_ceo(ctx, body.role)
    invite, link, sent = await svc.create_invite(
        db, email=body.email, name=body.name, role=body.role, invited_by=ctx.admin,
    )
    return InviteLinkResponse.model_validate({"invite": _invite_out(invite), "link": link, "emailSent": sent})


@router.post("/invites/{invite_id}/resend")
async def resend_invite(
    invite_id: str, ctx: AdminContext = Depends(require("admins.manage")), db: AsyncSession = Depends(get_db),
) -> InviteLinkResponse:
    invite, link, sent = await svc.resend_invite(db, invite_id, by=ctx.admin)
    return InviteLinkResponse.model_validate({"invite": _invite_out(invite), "link": link, "emailSent": sent})


@router.delete("/invites/{invite_id}")
async def revoke_invite(
    invite_id: str, _ctx: AdminContext = Depends(require("admins.manage")), db: AsyncSession = Depends(get_db),
) -> AdminInviteResponse:
    return _invite_out(await svc.revoke_invite(db, invite_id))


# Public: the invited person opens the emailed link (no session yet).


@router.get("/invitations/{token}", dependencies=[Depends(rate_limit("admin-invite", 30, 900))])
async def view_invitation(token: str, db: AsyncSession = Depends(get_db)) -> PublicInviteResponse:
    from app.governance.permissions import ROLE_LABELS

    invite = await svc.invite_for_token(db, token)
    return PublicInviteResponse.model_validate({
        "email": invite.email, "name": invite.name, "role": str(invite.role),
        "roleLabel": ROLE_LABELS.get(str(invite.role), str(invite.role)), "expiresAt": invite.expires_at,
    })


@router.post("/invitations/{token}/mfa", dependencies=[Depends(rate_limit("admin-invite", 30, 900))])
async def invitation_mfa(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    data = await svc.start_invite_mfa(db, token)
    return {"secret": data["secret"], "otpauthUri": data["otpauth_uri"]}


@router.post("/invitations/{token}/accept", status_code=201,
             dependencies=[Depends(rate_limit("admin-invite", 30, 900))])
async def accept_invitation(
    token: str, body: AcceptInviteRequest, db: AsyncSession = Depends(get_db),
) -> AdminUserResponse:
    admin = await svc.accept_invite(db, token=token, password=body.password, name=body.name, otp=body.otp)
    return AdminUserResponse.model_validate(admin)
