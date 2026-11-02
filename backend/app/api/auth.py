import secrets

from fastapi import APIRouter, Depends, Header
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.core.security import generate_wallet_id, hash_secret
from app.db.deps import get_db
from app.models.user import User
from app.schemas.user import (
    AuthTokenResponse,
    ForgotPasswordRequest,
    GoogleSignInRequest,
    LoginRequest,
    OtpRequestRequest,
    OtpVerifyRequest,
    PinStatusResponse,
    ResetPasswordRequest,
    SetPinRequest,
    SignupRequest,
    UpdateProfileRequest,
    UserLoginPayload,
    UserMePayload,
    UserProfilePayload,
    VerifyEmailRequest,
)
from app.services import auth_service, otp_service, pin_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", status_code=201, dependencies=[Depends(rate_limit("auth-signup", 10, 3600))])
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    user = await auth_service.signup(
        db,
        name=body.name,
        email=body.email,
        username=body.username,
        password=body.password,
        phone=body.phone,
        country_code=body.country_code,
    )
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": user})


@router.post("/login", dependencies=[Depends(rate_limit("auth-login", 20, 900))])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    user, _ = await auth_service.login(db, email=body.email, password=body.password)
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate(
        {"token": token, "user": UserLoginPayload.model_validate(user)}
    )


@router.post("/google")
async def google_login(body: GoogleSignInRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    settings = get_settings()
    if not settings.google_client_id:
        raise ApiError("Google sign-in is not configured on this environment", status_code=503)

    try:
        payload = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise ApiError("Invalid Google token", status_code=401) from exc

    email = (payload.get("email") or body.email or "").strip().lower()
    if not email:
        raise ApiError("Google account email is required", status_code=400)

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        username = email.split("@")[0]
        safe_username = username
        suffix = 1
        while True:
            existing = await db.execute(select(User).where(User.username == safe_username))
            if existing.scalar_one_or_none() is None:
                break
            safe_username = f"{username}{suffix}"
            suffix += 1

        user = User(
            name=(body.name or payload.get("name") or safe_username).strip(),
            email=email,
            username=safe_username,
            password=hash_secret(secrets.token_urlsafe(32)),
            phone=None,
            country_code=None,
            wallet_id=generate_wallet_id(),
            verified=True,
        )
        db.add(user)
        await db.flush()
        await auth_service._issue_default_card(db, user)

    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": UserLoginPayload.model_validate(user)})


@router.post("/otp/request")
async def request_otp(body: OtpRequestRequest, db: AsyncSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is None:
        raise ApiError("User not found", status_code=404)

    code_length = max(4, min(8, body.code_length or 6))
    await otp_service.issue_otp(email, code_length=code_length)
    return {"success": True, "message": "OTP sent successfully."}


@router.post("/otp/verify")
async def verify_otp(body: OtpVerifyRequest, db: AsyncSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is None:
        raise ApiError("User not found", status_code=404)

    valid = await otp_service.verify_otp(email, body.code)
    if not valid:
        raise ApiError("Invalid or expired OTP code", status_code=401)
    return {"success": True, "verified": True}


@router.post("/logout")
async def logout(
    authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)
) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token:
        await auth_service.logout(db, token)
    return {"success": True}


@router.post(
    "/forgot-password", dependencies=[Depends(rate_limit("auth-forgot-password", 5, 3600))]
)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    await auth_service.request_password_reset(db, body.email)
    return {
        "success": True,
        "message": "If an account with that email exists, you will receive reset instructions shortly.",
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    await auth_service.reset_password(db, token=body.token, password=body.password)
    return {"success": True, "message": "Password reset successful. Please log in again."}


@router.post("/email/verify")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> dict:
    user = await auth_service.verify_email(db, email=body.email, token=body.token)
    return {"success": True, "message": "Email verified successfully.", "user": UserMePayload.model_validate(user)}


@router.get("/me")
async def me(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> UserMePayload:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)
    return UserMePayload.model_validate(user)


@router.patch("/profile")
async def update_profile(
    body: UpdateProfileRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfilePayload:
    user = await auth_service.update_profile(
        db, user_id, name=body.name, phone=body.phone, avatar=body.avatar
    )
    return UserProfilePayload.model_validate(user)


@router.get("/pin/status")
async def pin_status(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PinStatusResponse:
    status = await pin_service.get_status(db, user_id)
    return PinStatusResponse.model_validate(status)


@router.post("/pin", dependencies=[Depends(rate_limit("pin-set", 10, 3600))])
async def set_pin(
    body: SetPinRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    await pin_service.set_pin(db, user_id, new_pin=body.new_pin, current_pin=body.current_pin)
    return {"success": True}
