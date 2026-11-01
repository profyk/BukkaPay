from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Runtime
    env: str = Field(default="development", alias="ENV")
    port: int = Field(default=5000, alias="PORT")
    web_concurrency: int = Field(default=4, alias="WEB_CONCURRENCY")
    secret_key: str | None = Field(default=None, alias="SECRET_KEY")
    trusted_proxies: str = Field(default="127.0.0.1,::1", alias="TRUSTED_PROXIES")
    trusted_hosts: str = Field(default="localhost,127.0.0.1", alias="TRUSTED_HOSTS")

    # Database
    database_url: str = Field(alias="DATABASE_URL")
    external_database_url: str | None = Field(default=None, alias="EXTERNAL_DATABASE_URL")

    # Redis (new — powers sessions cache, rate limiting, ARQ queue)
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Stripe
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

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

    # Third-party platform integrations
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    resend_from_email: str | None = Field(default="noreply@bukkapay.com", alias="RESEND_FROM_EMAIL")

    # CORS
    allowed_origins: str = Field(default="", alias="ALLOWED_ORIGINS")

    # URLs
    api_base_url: str = Field(default="http://localhost:5000", alias="API_BASE_URL")
    app_url: str = Field(default="http://localhost:8081", alias="APP_URL")

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def allowed_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.allowed_origins.split(",") if o.strip()]
        if not self.is_production:
            return origins or [
                "http://localhost:3000",
                "http://localhost:8081",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:8081",
            ]
        return origins

    @property
    def admin_allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.admin_allowed_origins.split(",") if o.strip()]

    @property
    def trusted_proxies_list(self) -> list[str]:
        return [o.strip() for o in self.trusted_proxies.split(",") if o.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        hosts = [o.strip() for o in self.trusted_hosts.split(",") if o.strip()]
        if not hosts:
            return ["localhost", "127.0.0.1"]
        return hosts

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

    @model_validator(mode="after")
    def validate_security_profile(self):
        if self.is_production:
            required = [
                "database_url",
                "secret_key",
                "redis_url",
                "admin_api_key",
                "allowed_origins",
            ]
            missing = [name for name in required if not getattr(self, name)]
            if missing:
                raise ValueError(
                    "Production requires secure secrets and CORS settings: "
                    + ", ".join(missing)
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
