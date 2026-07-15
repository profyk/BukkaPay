from uuid import UUID

from app.schemas.base import CamelModel


class UserAuthPayload(CamelModel):
    """Response shape for POST /api/auth/signup."""

    id: UUID
    wallet_id: str
    name: str
    email: str
    username: str
    phone: str | None
    country_code: str | None
    loyalty_points: int
    biometric_enabled: bool


class UserLoginPayload(UserAuthPayload):
    """Response shape for POST /api/auth/login — adds `verified`."""

    verified: bool


class AuthTokenResponse(CamelModel):
    token: str
    user: UserAuthPayload | UserLoginPayload


class UserMePayload(CamelModel):
    """Response shape for GET /api/auth/me."""

    id: UUID
    wallet_id: str
    name: str
    email: str
    username: str
    phone: str | None
    country_code: str | None
    loyalty_points: int
    biometric_enabled: bool
    avatar: str | None
    frozen: bool


class UserProfilePayload(CamelModel):
    """Response shape for PATCH /api/auth/profile."""

    id: UUID
    wallet_id: str
    name: str
    email: str
    username: str
    phone: str | None
    country_code: str | None
    loyalty_points: int
    biometric_enabled: bool
    avatar: str | None


class SignupRequest(CamelModel):
    name: str
    email: str
    username: str
    password: str
    phone: str | None = None
    country_code: str | None = None
    biometric_enabled: bool | None = None
    verified: bool | None = None
    loyalty_points: int | None = None


class LoginRequest(CamelModel):
    email: str
    password: str


class ForgotPasswordRequest(CamelModel):
    email: str


class ResetPasswordRequest(CamelModel):
    token: str
    password: str


class UpdateProfileRequest(CamelModel):
    name: str | None = None
    phone: str | None = None
    avatar: str | None = None
