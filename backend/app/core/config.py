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
    # Per process. Total connections = (pool + overflow) × WEB_CONCURRENCY ×
    # instances (+ workers) — keep it under the database/pooler limit.
    db_pool_size: int = Field(default=10, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    db_pool_timeout_seconds: int = Field(default=10, alias="DB_POOL_TIMEOUT_SECONDS")
    db_pool_recycle_seconds: int = Field(default=1800, alias="DB_POOL_RECYCLE_SECONDS")
    # Guards: a slow query or a transaction left open can't hold row locks
    # on wallets indefinitely (card authorizations must answer in ~2 s).
    db_statement_timeout_ms: int = Field(default=15000, alias="DB_STATEMENT_TIMEOUT_MS")
    db_lock_timeout_ms: int = Field(default=5000, alias="DB_LOCK_TIMEOUT_MS")
    db_idle_in_transaction_timeout_ms: int = Field(default=30000, alias="DB_IDLE_IN_TRANSACTION_TIMEOUT_MS")
    # Set when connecting through a transaction-mode pooler (PgBouncer,
    # Supabase Supavisor :6543): disables prepared-statement caching and
    # applies the timeouts per transaction instead of per connection.
    db_pgbouncer: bool = Field(default=False, alias="DB_PGBOUNCER")

    # Redis (new — powers sessions cache, rate limiting, ARQ queue)
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Stripe
    stripe_secret_key: str | None = Field(default=None, alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, alias="STRIPE_WEBHOOK_SECRET")

    # Stitch (South African instant EFT)
    stitch_client_id: str | None = Field(default=None, alias="STITCH_CLIENT_ID")
    stitch_client_secret: str | None = Field(default=None, alias="STITCH_CLIENT_SECRET")

    # Card issuing (Visa, via a licensed issuer-processor). "sandbox" in
    # development; "none" until an issuer is contracted. See app/cards/issuers.py.
    card_issuer: str = Field(default="sandbox", alias="CARD_ISSUER")
    card_issuer_webhook_secret: str | None = Field(default=None, alias="CARD_ISSUER_WEBHOOK_SECRET")

    # Public website (apps/website): after an admin edits content, the API
    # calls this endpoint so the site refreshes immediately.
    website_revalidate_url: str | None = Field(default=None, alias="WEBSITE_REVALIDATE_URL")
    website_revalidate_secret: str | None = Field(default=None, alias="WEBSITE_REVALIDATE_SECRET")
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
    supabase_service_role_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    # Push notifications: Web Push (VAPID) for the web app, Expo for the phone apps.
    vapid_public_key: str | None = Field(default=None, alias="VAPID_PUBLIC_KEY")
    vapid_private_key: str | None = Field(default=None, alias="VAPID_PRIVATE_KEY")
    vapid_subject: str = Field(default="mailto:support@bukkapay.com", alias="VAPID_SUBJECT")
    expo_access_token: str | None = Field(default=None, alias="EXPO_ACCESS_TOKEN")
    resend_from_email: str | None = Field(default="noreply@bukkapay.com", alias="RESEND_FROM_EMAIL")
    bank_partner_api_url: str | None = Field(default=None, alias="BANK_PARTNER_API_URL")
    bank_partner_api_key: str | None = Field(default=None, alias="BANK_PARTNER_API_KEY")
    bank_partner_account_id: str | None = Field(default=None, alias="BANK_PARTNER_ACCOUNT_ID")
    bank_partner_webhook_secret: str | None = Field(default=None, alias="BANK_PARTNER_WEBHOOK_SECRET")
    google_client_id: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    google_client_secret: str | None = Field(default=None, alias="GOOGLE_CLIENT_SECRET")
    # Extra Google OAuth client IDs accepted as token audience (comma-separated):
    # the Android, iOS and web clients each sign tokens for their own ID.
    google_client_ids: str | None = Field(default=None, alias="GOOGLE_CLIENT_IDS")
    # Sign in with Apple audiences (comma-separated): the iOS bundle ID and
    # the web Services ID.
    apple_client_ids: str | None = Field(default=None, alias="APPLE_CLIENT_IDS")

    # Encryption / signing
    card_data_key: str | None = Field(default=None, alias="CARD_DATA_KEY")  # Fernet key
    sandbox_webhook_secret: str = Field(default="sandbox-dev-secret", alias="SANDBOX_WEBHOOK_SECRET")
    # Seconds before the sandbox rail auto-confirms settlement (0 = immediately via worker).
    sandbox_settlement_delay_seconds: int = Field(default=5, alias="SANDBOX_SETTLEMENT_DELAY_SECONDS")
    public_web_url: str = Field(default="http://localhost:3000", alias="PUBLIC_WEB_URL")
    merchant_web_url: str = Field(default="http://localhost:3001", alias="MERCHANT_WEB_URL")
    # Flights: Duffel airline API (https://duffel.com). Unset = only BukkaPay's own inventory.
    duffel_access_token: str | None = Field(default=None, alias="DUFFEL_ACCESS_TOKEN")
    # Treasury rebalancing (Yellow Card) and KYC (Smile ID); unset = not connected.
    yellowcard_api_key: str | None = Field(default=None, alias="YELLOWCARD_API_KEY")
    yellowcard_api_secret: str | None = Field(default=None, alias="YELLOWCARD_API_SECRET")
    yellowcard_base_url: str = Field(default="https://sandbox.api.yellowcard.io", alias="YELLOWCARD_BASE_URL")
    smile_id_partner_id: str | None = Field(default=None, alias="SMILE_ID_PARTNER_ID")
    smile_id_api_key: str | None = Field(default=None, alias="SMILE_ID_API_KEY")
    smile_id_sandbox: bool = Field(default=True, alias="SMILE_ID_SANDBOX")
    # Admin panel origin, used in admin invitation links.
    admin_web_url: str = Field(default="https://admin.bukkapay.com", alias="ADMIN_WEB_URL")

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
                "card_data_key",
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
