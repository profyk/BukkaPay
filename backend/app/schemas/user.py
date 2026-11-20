from uuid import UUID

from app.schemas.base import CamelModel, OptionalJsDateTime


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
    residence_country: str | None = None
    kyc_level: int = 0
    kyc_status: str | None = None
    preferred_language: str = "en"
    account_type: str = "personal"


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
    residence_country: str | None = None
    kyc_level: int = 0
    kyc_status: str | None = None
    preferred_language: str = "en"
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
    residence_country: str | None = None
    kyc_level: int = 0
    kyc_status: str | None = None
    preferred_language: str = "en"
    avatar: str | None


class SignupRequest(CamelModel):
    name: str
    email: str
    username: str
    password: str
    phone: str | None = None
    country_code: str | None = None  # phone dial prefix
    residence_country: str  # ISO-3166 alpha-2; must be a country BukkaPay operates in
    accept_terms: bool
    preferred_language: str = "en"
    app: str | None = None  # 'merchant' creates a Business account


class LoginRequest(CamelModel):
    email: str
    password: str
    app: str | None = None  # 'customer' (default) or 'merchant'


class GoogleSignInRequest(CamelModel):
    id_token: str
    email: str | None = None
    name: str | None = None
    # Required the first time (account creation), ignored afterwards.
    residence_country: str | None = None
    accept_terms: bool | None = None
    username: str | None = None
    phone: str | None = None
    app: str | None = None


class AppleSignInRequest(CamelModel):
    identity_token: str
    # The raw nonce; Apple was given its SHA-256.
    nonce: str | None = None
    # Apple shares the name only on the first authorization, to the app.
    name: str | None = None
    residence_country: str | None = None
    accept_terms: bool | None = None
    username: str | None = None
    phone: str | None = None
    app: str | None = None


class ForgotPasswordRequest(CamelModel):
    email: str


class ResetPasswordRequest(CamelModel):
    token: str
    password: str


class VerifyEmailRequest(CamelModel):
    email: str
    token: str


class OtpRequestRequest(CamelModel):
    email: str


class OtpVerifyRequest(CamelModel):
    email: str
    code: str
    app: str | None = None


class UpdateProfileRequest(CamelModel):
    name: str | None = None
    phone: str | None = None
    avatar: str | None = None


class SetPinRequest(CamelModel):
    new_pin: str
    current_pin: str | None = None


class PinStatusResponse(CamelModel):
    has_pin: bool
    locked: bool
    locked_until: OptionalJsDateTime = None
