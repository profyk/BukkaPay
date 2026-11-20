import hashlib
import html
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business.mfa import generate_totp_secret, verify_totp
from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.governance.owner import is_owner_email
from app.models.admin import AdminInvite, AdminUser
from app.services import admin_session_service


async def create_first_super_admin(db: AsyncSession, *, email: str, name: str, password: str) -> AdminUser:
    if not is_owner_email(email):
        raise ApiError("Only the platform owner can be the super admin", status_code=403)
    existing = await db.execute(select(AdminUser).where(AdminUser.role == "super_admin").limit(1))
    if existing.scalar_one_or_none() is not None:
        raise ApiError("The super admin already exists. Invite other admins from the admin panel.", status_code=409)

    if len(password) < 8:
        raise ApiError("Password must be at least 8 characters")

    admin = AdminUser(
        email=email.lower().strip(), name=name, password=hash_secret(password),
        role="super_admin", is_active=True,
    )
    db.add(admin)
    await db.flush()
    return admin


async def login(db: AsyncSession, *, email: str, password: str, otp: str | None = None) -> tuple[str, datetime, AdminUser]:
    result = await db.execute(select(AdminUser).where(AdminUser.email == email.lower().strip()))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise ApiError("Invalid email or password", status_code=401)
    if not admin.is_active:
        raise ApiError("Admin account is deactivated", status_code=403)

    valid, _ = verify_secret(password, admin.password)
    if not valid:
        raise ApiError("Invalid email or password", status_code=401)

    if admin.mfa_enabled:
        if not admin.mfa_secret:
            raise ApiError("MFA is enabled but no secret is configured", status_code=403)
        if otp is None or not verify_totp(admin.mfa_secret, otp):
            raise ApiError("MFA verification required", status_code=401)

    token, expires_at = await admin_session_service.issue_session(db, admin.id)
    admin.last_login_at = datetime.now(UTC)
    await db.flush()
    return token, expires_at, admin


async def setup_mfa(db: AsyncSession, *, admin_id: str) -> dict:
    try:
        admin_uuid = uuid.UUID(admin_id)
    except ValueError as exc:
        raise ApiError("Admin not found", status_code=404) from exc

    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_uuid))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise ApiError("Admin not found", status_code=404)
    if admin.mfa_enabled:
        raise ApiError("MFA is already enabled. Ask a super admin to reset it.", status_code=409)

    secret = generate_totp_secret()
    admin.mfa_secret = secret
    # Not enabled until the admin proves they enrolled it (confirm_mfa).
    admin.mfa_enabled = False
    await db.flush()
    return {
        "secret": secret,
        "otpauth_uri": f"otpauth://totp/BukkaPay:{admin.email}?secret={secret}&issuer=BukkaPay",
    }


async def logout(db: AsyncSession, token: str) -> None:
    await admin_session_service.revoke_session(db, token)


async def list_admins(db: AsyncSession) -> list[AdminUser]:
    result = await db.execute(select(AdminUser).order_by(AdminUser.created_at.desc()))
    return list(result.scalars().all())


async def create_admin(db: AsyncSession, *, email: str, name: str, password: str, role: str | None) -> AdminUser:
    role = role or "admin"
    from app.governance.permissions import ROLE_PERMISSIONS

    _check_assignable_role(role, ROLE_PERMISSIONS)

    existing = await db.execute(select(AdminUser).where(AdminUser.email == email.lower().strip()))
    if existing.scalar_one_or_none() is not None:
        raise ApiError("An admin with this email already exists", status_code=409)
    await _ensure_not_customer_email(db, email)

    admin = AdminUser(email=email.lower().strip(), name=name, password=hash_secret(password), role=role)
    db.add(admin)
    await db.flush()
    return admin


async def update_admin(
    db: AsyncSession, admin_id: str, *, name: str | None, email: str | None, password: str | None,
    role: str | None, is_active: bool | None,
) -> AdminUser:
    try:
        admin_uuid = uuid.UUID(admin_id)
    except ValueError as e:
        raise ApiError("Admin not found", status_code=404) from e
    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_uuid))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise ApiError("Admin not found", status_code=404)

    if name is None and email is None and password is None and role is None and is_active is None:
        raise ApiError("No fields to update")

    owner = is_owner_email(admin.email)
    if owner:
        if email is not None and not is_owner_email(email):
            raise ApiError("The platform owner's email cannot be changed", status_code=403)
        if role is not None and role != "super_admin":
            raise ApiError("The platform owner is always the super admin", status_code=403)
        if is_active is False:
            raise ApiError("The platform owner cannot be suspended", status_code=403)

    if name is not None:
        admin.name = name
    if email is not None and not owner:
        if is_owner_email(email):
            raise ApiError("That email belongs to the platform owner", status_code=403)
        admin.email = email.lower().strip()
    if role is not None and not owner:
        from app.governance.permissions import ROLE_PERMISSIONS

        _check_assignable_role(role, ROLE_PERMISSIONS)
        admin.role = role
    if is_active is not None:
        admin.is_active = is_active
    if password:
        admin.password = hash_secret(password)

    await db.flush()
    return admin


async def delete_admin(db: AsyncSession, admin_id: str) -> AdminUser:
    try:
        admin_uuid = uuid.UUID(admin_id)
    except ValueError as e:
        raise ApiError("Admin not found", status_code=404) from e
    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_uuid))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise ApiError("Admin not found", status_code=404)
    if is_owner_email(admin.email):
        raise ApiError("The platform owner cannot be deleted", status_code=403)
    await db.delete(admin)
    await db.flush()
    return admin


async def confirm_mfa(db: AsyncSession, *, admin_id: str, otp: str) -> dict:
    admin = (await db.execute(select(AdminUser).where(AdminUser.id == uuid.UUID(admin_id)))).scalar_one()
    if admin.mfa_enabled:
        raise ApiError("MFA is already enabled", status_code=409)
    if not admin.mfa_secret or not verify_totp(admin.mfa_secret, otp):
        raise ApiError("Invalid code", status_code=400)
    admin.mfa_enabled = True
    await db.flush()
    return {"mfaEnabled": True}


def _check_assignable_role(role: str, role_permissions: dict) -> None:
    if role == "super_admin":
        raise ApiError("Super admin is reserved for the platform owner and can't be assigned", status_code=403)
    if role not in role_permissions:
        raise ApiError("role must be one of: " + ", ".join(sorted(r for r in role_permissions if r != "super_admin")))


# ─── Invitations ────────────────────────────────────────────────────────────

INVITE_TTL = timedelta(days=7)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def invite_link(token: str) -> str:
    from app.core.config import get_settings

    base = get_settings().admin_web_url.rstrip("/")
    return f"{base}/accept-invite?token={token}"


def invite_status(invite: AdminInvite) -> str:
    if invite.accepted_at:
        return "accepted"
    if invite.revoked_at:
        return "revoked"
    if invite.expires_at <= datetime.now(UTC):
        return "expired"
    return "pending"


async def _send_invite_email(invite: AdminInvite, link: str, inviter: str | None) -> bool:
    from app.core.config import get_settings
    from app.governance.permissions import ROLE_LABELS
    from app.integrations.resend_client import send_resend_email

    if not get_settings().resend_api_key:
        return False
    role = ROLE_LABELS.get(str(invite.role), str(invite.role))
    who = html.escape(inviter or "The BukkaPay team")
    name = html.escape(invite.name)
    try:
        await send_resend_email(
            to=invite.email,
            subject="You're invited to the BukkaPay admin panel",
            html=(
                f"<p>Hello {name},</p>"
                f"<p>{who} has invited you to join the BukkaPay admin panel as <strong>{html.escape(role)}</strong>.</p>"
                f"<p><a href='{link}'>Accept the invitation and set your password</a></p>"
                "<p>This link works once and expires in 7 days. If you weren't expecting it, ignore this email.</p>"
            ),
            text=(
                f"Hello {invite.name},\n\n{inviter or 'The BukkaPay team'} has invited you to join the BukkaPay "
                f"admin panel as {role}.\n\nAccept and set your password: {link}\n\n"
                "This link works once and expires in 7 days."
            ),
        )
    except Exception:  # the link is still shown to the inviter to share another way
        return False
    return True


async def create_invite(
    db: AsyncSession, *, email: str, name: str, role: str, invited_by: AdminUser | None,
) -> tuple[AdminInvite, str, bool]:
    from app.governance.permissions import ROLE_PERMISSIONS

    email = email.strip().lower()
    name = name.strip()
    if "@" not in email or not name:
        raise ApiError("A name and a valid email are required")
    if is_owner_email(email):
        raise ApiError("That email belongs to the platform owner", status_code=403)
    _check_assignable_role(role, ROLE_PERMISSIONS)
    if (await db.execute(select(AdminUser.id).where(AdminUser.email == email))).first() is not None:
        raise ApiError("An admin with this email already exists", status_code=409)
    await _ensure_not_customer_email(db, email)

    # Any earlier open invitation for this email stops working.
    now = datetime.now(UTC)
    for old in (await db.execute(select(AdminInvite).where(
        AdminInvite.email == email, AdminInvite.accepted_at.is_(None), AdminInvite.revoked_at.is_(None),
    ))).scalars():
        old.revoked_at = now

    token = secrets.token_urlsafe(32)
    invite = AdminInvite(
        email=email, name=name, role=role, token_hash=_hash_token(token),
        invited_by=invited_by.id if invited_by else None, expires_at=now + INVITE_TTL,
    )
    db.add(invite)
    await db.flush()
    link = invite_link(token)
    sent = await _send_invite_email(invite, link, invited_by.name if invited_by else None)
    return invite, link, sent


async def create_owner_invite(db: AsyncSession) -> tuple[AdminInvite, str, bool]:
    """Super-admin invitation for the platform owner only: sets up the owner's
    account, or resets the owner's password and MFA if it already exists.
    Master key only (see the route); emailed to the owner's address."""
    from app.governance.owner import OWNER_EMAIL

    now = datetime.now(UTC)
    for old in (await db.execute(select(AdminInvite).where(
        AdminInvite.email == OWNER_EMAIL, AdminInvite.accepted_at.is_(None), AdminInvite.revoked_at.is_(None),
    ))).scalars():
        old.revoked_at = now
    owner = (await db.execute(select(AdminUser).where(AdminUser.email == OWNER_EMAIL))).scalar_one_or_none()
    token = secrets.token_urlsafe(32)
    invite = AdminInvite(
        email=OWNER_EMAIL, name=owner.name if owner else "Platform owner", role="super_admin",
        token_hash=_hash_token(token), invited_by=None, expires_at=now + timedelta(hours=24),
    )
    db.add(invite)
    await db.flush()
    link = invite_link(token)
    sent = await _send_invite_email(invite, link, "BukkaPay")
    return invite, link, sent


async def list_invites(db: AsyncSession) -> list[AdminInvite]:
    rows = await db.execute(
        select(AdminInvite).where(AdminInvite.accepted_at.is_(None)).order_by(AdminInvite.created_at.desc()).limit(100)
    )
    return list(rows.scalars())


async def _invite_by_id(db: AsyncSession, invite_id: str) -> AdminInvite:
    try:
        invite_uuid = uuid.UUID(invite_id)
    except ValueError as e:
        raise ApiError("Invitation not found", status_code=404) from e
    invite = (await db.execute(select(AdminInvite).where(AdminInvite.id == invite_uuid))).scalar_one_or_none()
    if invite is None:
        raise ApiError("Invitation not found", status_code=404)
    return invite


async def resend_invite(db: AsyncSession, invite_id: str, *, by: AdminUser | None) -> tuple[AdminInvite, str, bool]:
    """A fresh link and 7 more days; the previous link stops working."""
    invite = await _invite_by_id(db, invite_id)
    if invite.accepted_at:
        raise ApiError("This invitation was already accepted", status_code=409)
    token = secrets.token_urlsafe(32)
    invite.token_hash = _hash_token(token)
    invite.mfa_secret = None
    invite.revoked_at = None
    invite.expires_at = datetime.now(UTC) + INVITE_TTL
    await db.flush()
    link = invite_link(token)
    sent = await _send_invite_email(invite, link, by.name if by else None)
    return invite, link, sent


async def revoke_invite(db: AsyncSession, invite_id: str) -> AdminInvite:
    invite = await _invite_by_id(db, invite_id)
    if invite.accepted_at:
        raise ApiError("This invitation was already accepted", status_code=409)
    invite.revoked_at = datetime.now(UTC)
    await db.flush()
    return invite


async def invite_for_token(db: AsyncSession, token: str) -> AdminInvite:
    invite = (await db.execute(
        select(AdminInvite).where(AdminInvite.token_hash == _hash_token(token or ""))
    )).scalar_one_or_none()
    if invite is None or invite_status(invite) != "pending":
        raise ApiError("This invitation link is invalid or has expired. Ask for a new one.", status_code=404)
    return invite


async def start_invite_mfa(db: AsyncSession, token: str) -> dict:
    """Step 2 of accepting: the authenticator secret to scan. Stable until
    accepted, so reloading the page shows the same QR code."""
    invite = await invite_for_token(db, token)
    if not invite.mfa_secret:
        invite.mfa_secret = generate_totp_secret()
        await db.flush()
    return {
        "secret": invite.mfa_secret,
        "otpauth_uri": f"otpauth://totp/BukkaPay:{invite.email}?secret={invite.mfa_secret}&issuer=BukkaPay",
    }


async def accept_invite(db: AsyncSession, *, token: str, password: str, name: str | None, otp: str) -> AdminUser:
    """Creates the admin with their own password and MFA already switched on."""
    invite = await invite_for_token(db, token)
    if len(password) < 10:
        raise ApiError("Password must be at least 10 characters")
    if not invite.mfa_secret:
        raise ApiError("Set up your authenticator app first", status_code=400)
    if not verify_totp(invite.mfa_secret, (otp or "").strip()):
        raise ApiError("That authenticator code is wrong or expired. Try the current code.", status_code=400)
    if str(invite.role) == "super_admin":
        if not is_owner_email(invite.email):  # the database also refuses this
            raise ApiError("Invalid invitation", status_code=403)
        owner = (await db.execute(select(AdminUser).where(AdminUser.email == invite.email))).scalar_one_or_none()
        if owner is not None:
            # Reset the owner's credentials; sign out everywhere.
            owner.password = hash_secret(password)
            owner.mfa_secret = invite.mfa_secret
            owner.mfa_enabled = True
            owner.is_active = True
            if (name or "").strip():
                owner.name = name.strip()
            await admin_session_service.revoke_all_for_admin(db, owner.id)
            invite.mfa_secret = None
            invite.accepted_at = datetime.now(UTC)
            await db.flush()
            return owner
    if (await db.execute(select(AdminUser.id).where(AdminUser.email == invite.email))).first() is not None:
        raise ApiError("An admin with this email already exists", status_code=409)
    admin = AdminUser(
        email=invite.email, name=(name or "").strip() or invite.name, password=hash_secret(password),
        role=invite.role, is_active=True, mfa_enabled=True, mfa_secret=invite.mfa_secret,
    )
    db.add(admin)
    invite.mfa_secret = None
    invite.accepted_at = datetime.now(UTC)
    await db.flush()
    return admin


async def _ensure_not_customer_email(db: AsyncSession, email: str) -> None:
    """Admins are separate people: a customer or merchant email can't be an admin."""
    from app.models.user import User

    if (await db.execute(select(User.id).where(User.email == email.strip().lower()))).first() is not None:
        raise ApiError("This email already has a BukkaPay customer or business account. "
                       "Admins need their own, separate email.", status_code=409)
