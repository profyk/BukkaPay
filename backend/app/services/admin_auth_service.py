import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business.mfa import generate_totp_secret, verify_totp
from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.models.admin import AdminUser
from app.services import admin_session_service


async def create_first_super_admin(db: AsyncSession, *, email: str, name: str, password: str) -> AdminUser:
    existing = await db.execute(select(AdminUser).limit(1))
    if existing.scalar_one_or_none() is not None:
        raise ApiError("Admin already exists. Use /api/admin/admins to add more.", status_code=409)

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

    secret = generate_totp_secret()
    admin.mfa_secret = secret
    admin.mfa_enabled = True
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
    if role not in ("admin", "super_admin"):
        raise ApiError("role must be admin or super_admin")

    existing = await db.execute(select(AdminUser).where(AdminUser.email == email.lower().strip()))
    if existing.scalar_one_or_none() is not None:
        raise ApiError("An admin with this email already exists", status_code=409)

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

    if name is not None:
        admin.name = name
    if email is not None:
        admin.email = email.lower().strip()
    if role is not None:
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
    await db.delete(admin)
    await db.flush()
    return admin
