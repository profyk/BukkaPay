from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Runtime
    env: str = Field(default="development", alias="NODE_ENV")
    port: int = Field(default=5000, alias="PORT")
    web_concurrency: int = Field(default=4, alias="WEB_CONCURRENCY")

    # Database
    database_url: str = Field(alias="DATABASE_URL")
    external_database_url: str | None = Field(default=None, alias="EXTERNAL_DATABASE_URL")

    # Redis (new — powers sessions cache, rate limiting, ARQ queue)
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Stripe
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

    # Paystack
    paystack_secret_key: str | None = Field(default=None, alias="PAYSTACK_SECRET_KEY")

    # Stitch (South African instant EFT)
    stitch_client_id: str | None = Field(default=None, alias="STITCH_CLIENT_ID")
    stitch_client_secret: str | None = Field(default=None, alias="STITCH_CLIENT_SECRET")
    stitch_card_program_id: str | None = Field(default=None, alias="STITCH_CARD_PROGRAM_ID")
    bukkapay_account_name: str = Field(default="BukkaPay (Pty) Ltd", alias="BUKKAPAY_ACCOUNT_NAME")
    bukkapay_bank_id: str = Field(default="fnb", alias="BUKKAPAY_BANK_ID")
    bukkapay_account_number: str | None = Field(default=None, alias="BUKKAPAY_ACCOUNT_NUMBER")
    bukkapay_branch_code: str | None = Field(default=None, alias="BUKKAPAY_BRANCH_CODE")

    # WebAuthn / passkeys
    webauthn_rp_id: str = Field(default="localhost", alias="WEBAUTHN_RP_ID")
    webauthn_origin: str = Field(default="http://localhost:5000", alias="WEBAUTHN_ORIGIN")

    # Admin
    admin_api_key: str | None = Field(default=None, alias="ADMIN_API_KEY")
    admin_allowed_origins: str = Field(default="", alias="ADMIN_ALLOWED_ORIGINS")

    # CORS
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")

    # URLs
    api_base_url: str = Field(default="http://localhost:5000", alias="API_BASE_URL")
    app_url: str = Field(default="http://localhost:8081", alias="APP_URL")

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def admin_allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.admin_allowed_origins.split(",") if o.strip()]

    @property
    def sqlalchemy_database_url(self) -> str:
        url = self.database_url or self.external_database_url
        if not url:
            raise RuntimeError("DATABASE_URL or EXTERNAL_DATABASE_URL must be set")
        # normalize postgres:// -> postgresql+asyncpg://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
