
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.integrations import supabase_auth
from app.models.user import User
from app.schemas.user import (
    AppleSignInRequest,
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
from app.services import auth_service, pin_service, social_auth_service

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
        residence_country=body.residence_country,
        accept_terms=body.accept_terms,
        preferred_language=body.preferred_language,
        app=body.app,
    )
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": user})


@router.post("/login", dependencies=[Depends(rate_limit("auth-login", 20, 900))])
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    user, _ = await auth_service.login(db, email=body.email, password=body.password)
    await auth_service.ensure_account_allowed(db, user, app=body.app)
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate(
        {"token": token, "user": UserLoginPayload.model_validate(user)}
    )


@router.post("/google", dependencies=[Depends(rate_limit("auth-social", 30, 900))])
async def google_login(body: GoogleSignInRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    if body.id_token:
        identity = social_auth_service.verify_google(body.id_token)
    elif body.access_token:  # BukkaPay's own Google button on the web dashboards
        identity = await social_auth_service.verify_google_access_token(body.access_token)
    else:
        raise ApiError("Google didn't return a sign-in token. Please try again.", status_code=400)
    user = await social_auth_service.sign_in(
        db, identity, name=body.name, residence_country=body.residence_country, accept_terms=body.accept_terms,
        username=body.username, phone=body.phone, app=body.app,
    )
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": UserLoginPayload.model_validate(user)})


@router.post("/apple", dependencies=[Depends(rate_limit("auth-social", 30, 900))])
async def apple_login(body: AppleSignInRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    identity = social_auth_service.verify_apple(body.identity_token, body.nonce)
    user = await social_auth_service.sign_in(
        db, identity, name=body.name, residence_country=body.residence_country, accept_terms=body.accept_terms,
        username=body.username, phone=body.phone, app=body.app,
    )
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": UserLoginPayload.model_validate(user)})


@router.post("/otp/request", dependencies=[Depends(rate_limit("auth-otp-request", 5, 600))])
async def request_otp(body: OtpRequestRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Email a one-time code (Supabase Auth, delivered by Resend)."""
    if not supabase_auth.is_configured():
        raise ApiError("Email codes are not configured on this environment", status_code=503)
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    # Codes only confirm an email (a new sign-up); they are not a way to sign
    # in. Same answer either way, so this can't be used to find accounts.
    if user is not None and not user.verified:
        await auth_service.send_email_code(email)
    return {"success": True, "message": "If this email is waiting for confirmation, a code has been sent."}


@router.post("/otp/verify", dependencies=[Depends(rate_limit("auth-otp-verify", 10, 600))])
async def verify_otp(body: OtpVerifyRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    """Confirm a new sign-up's email with the emailed code, then sign in.
    Only for accounts that are not verified yet: a verified account signs in
    with its password, Google or Apple, never with an emailed code."""
    existing = (await db.execute(select(User).where(
        User.email == body.email.strip().lower(), User.deleted_at.is_(None),
    ))).scalar_one_or_none()
    if existing is not None and existing.verified:
        raise ApiError("This email is already confirmed. Sign in with your password.", status_code=400)
    user = await auth_service.verify_email(db, email=body.email, token=body.code)
    if body.app is not None:
        await auth_service.ensure_account_allowed(db, user, app=body.app)
    if user.frozen:
        raise ApiError("Your account is restricted", status_code=403)
    token, _ = await auth_service.create_session_for_user(db, user.id)
    return AuthTokenResponse.model_validate({"token": token, "user": UserLoginPayload.model_validate(user)})


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


@router.post("/reset-password", dependencies=[Depends(rate_limit("auth-reset", 10, 900))])
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    await auth_service.reset_password(db, token=body.token, password=body.password)
    return {"success": True, "message": "Password reset successful. Please log in again."}


@router.post("/email/verify", dependencies=[Depends(rate_limit("auth-otp-verify", 10, 600))])
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
