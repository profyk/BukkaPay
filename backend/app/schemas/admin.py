from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime, OptionalMoneyStr, RateStr

# ─── Pagination ─────────────────────────────────────────────────────────────


class Pagination(CamelModel):
    page: int
    limit: int
    total: int
    pages: int


# ─── Auth / admin accounts ──────────────────────────────────────────────────


class AdminUserResponse(CamelModel):
    id: UUID
    email: str
    name: str
    role: str
    is_active: bool
    last_login_at: OptionalJsDateTime
    created_at: JsDateTime


class AdminSetupRequest(CamelModel):
    email: str
    name: str
    password: str


class AdminLoginRequest(CamelModel):
    email: str
    password: str


class AdminLoginResponse(CamelModel):
    token: str
    expires_at: JsDateTime
    admin: AdminUserResponse


class AdminMeResponse(CamelModel):
    role: str
    name: str | None
    email: str | None


class CreateAdminRequest(CamelModel):
    email: str
    name: str
    password: str
    role: str | None = None


class UpdateAdminRequest(CamelModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None


# ─── Users ──────────────────────────────────────────────────────────────────


class AdminUserRow(CamelModel):
    id: UUID
    wallet_id: str
    name: str
    email: str
    username: str
    phone: str | None
    country_code: str | None
    avatar: str | None
    biometric_enabled: bool
    verified: bool
    frozen: bool
    role: str
    loyalty_points: int
    created_at: JsDateTime
    status: str = ""


class UsersListResponse(CamelModel):
    users: list[AdminUserRow]
    pagination: Pagination


class UpdateUserRequest(CamelModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    verified: bool | None = None


class FreezeUserRequest(CamelModel):
    frozen: bool | None = None


class VerifyUserRequest(CamelModel):
    verified: bool | None = None


class NotifyUserRequest(CamelModel):
    type: str | None = None
    title: str
    message: str


class BroadcastRequest(CamelModel):
    type: str | None = None
    title: str
    message: str


class BroadcastResponse(CamelModel):
    success: bool
    sent: int


# ─── User detail (with cards/transactions/loyalty) ─────────────────────────


class AdminUserDetailResponse(CamelModel):
    user: AdminUserRow
    cards: list[dict]
    recent_transactions: list[dict]
    recent_payment_links: list[dict]
    loyalty: dict | None
    total_balance: str


# ─── Transactions ───────────────────────────────────────────────────────────


class TransactionUserSummary(CamelModel):
    id: UUID
    name: str
    username: str
    email: str


class AdminTransactionRow(CamelModel):
    id: UUID
    user_id: UUID
    card_id: UUID | None
    title: str
    category: str
    amount: MoneyStr
    type: str
    icon: str
    purpose_category: str | None = None
    purpose_subcategory: str | None = None
    destination_country_code: str | None = None
    destination_zone: str | None = None
    created_at: JsDateTime
    user: TransactionUserSummary


class AdminTransactionsListResponse(CamelModel):
    transactions: list[AdminTransactionRow]
    pagination: Pagination


class FlagTransactionResponse(CamelModel):
    success: bool
    id: str
    flagged: bool


# ─── Wallets ────────────────────────────────────────────────────────────────


class AdminWalletRow(CamelModel):
    id: UUID
    user_id: UUID
    title: str
    balance: float
    currency: str
    icon: str
    color: str
    card_number: str
    frozen: bool
    flagged: bool
    blocked: bool
    spending_limit: OptionalMoneyStr
    created_at: JsDateTime
    status: str
    user_email: str
    user_name: str


class AdminWalletsListResponse(CamelModel):
    wallets: list[AdminWalletRow]
    pagination: Pagination


class WalletActionRequest(CamelModel):
    frozen: bool | None = None


class WalletBalanceRequest(CamelModel):
    balance: str


class WalletActionResponse(CamelModel):
    success: bool
    frozen: bool | None = None
    card: dict


# ─── Payment links ──────────────────────────────────────────────────────────


class AdminPaymentLinkRow(CamelModel):
    id: UUID
    sender_id: UUID
    amount: MoneyStr
    currency: str
    description: str | None
    status: str
    created_at: JsDateTime
    user: TransactionUserSummary


class AdminPaymentLinksListResponse(CamelModel):
    payment_links: list[AdminPaymentLinkRow]
    pagination: Pagination


class UpdatePaymentLinkStatusRequest(CamelModel):
    status: str


# ─── Merchants / virtual cards / savings groups ─────────────────────────────


class AdminMerchantRow(CamelModel):
    id: UUID
    business_name: str
    business_type: str
    wallet_balance: MoneyStr
    is_active: bool
    created_at: JsDateTime
    user: TransactionUserSummary


class AdminMerchantsListResponse(CamelModel):
    merchants: list[AdminMerchantRow]
    pagination: Pagination


class AdminVirtualCardRow(CamelModel):
    id: UUID
    user_id: UUID
    card_number: str
    expiry_date: str
    is_active: bool
    created_at: JsDateTime
    user: TransactionUserSummary


class AdminVirtualCardsListResponse(CamelModel):
    virtual_cards: list[AdminVirtualCardRow]
    pagination: Pagination


class SavingsGroupRow(CamelModel):
    id: UUID
    title: str
    description: str | None
    category: str
    target_amount: str | None
    current_amount: MoneyStr
    currency: str
    share_code: str
    is_active: bool
    created_at: JsDateTime


class SavingsGroupsListResponse(CamelModel):
    stokvels: list[SavingsGroupRow]
    pagination: Pagination


# ─── Pricing ────────────────────────────────────────────────────────────────


class UpdatePricingRequest(CamelModel):
    category: str
    values: dict


# ─── Currency corridors (cross-border FX pricing) ──────────────────────────


class CorridorRow(CamelModel):
    id: UUID
    from_currency: str
    to_currency: str
    exchange_rate: RateStr
    fee_percentage: MoneyStr
    fee_fixed: MoneyStr
    min_amount: MoneyStr
    max_amount: MoneyStr
    is_active: bool
    updated_at: JsDateTime


class CorridorsListResponse(CamelModel):
    corridors: list[CorridorRow]


class UpdateCorridorRequest(CamelModel):
    exchange_rate: str | None = None
    fee_percentage: str | None = None
    fee_fixed: str | None = None
    min_amount: str | None = None
    max_amount: str | None = None
    is_active: bool | None = None


class InternationalTransferRow(CamelModel):
    id: UUID
    sender_id: UUID
    recipient_id: UUID
    from_currency: str
    to_currency: str
    source_amount: MoneyStr
    exchange_rate_applied: RateStr
    fee_amount: MoneyStr
    destination_amount: MoneyStr
    purpose_category: str | None = None
    purpose_subcategory: str | None = None
    destination_country_code: str | None = None
    destination_zone: str | None = None
    created_at: JsDateTime
    sender: TransactionUserSummary
    recipient: TransactionUserSummary


class InternationalTransfersListResponse(CamelModel):
    transfers: list[InternationalTransferRow]
    pagination: Pagination


# ─── KYC ────────────────────────────────────────────────────────────────────


class KycRow(CamelModel):
    id: UUID
    user_id: UUID
    user_email: str
    full_name: str
    document_type: str
    document_number: str
    status: str
    submitted_at: JsDateTime
    reviewed_at: OptionalJsDateTime = None
    rejection_reason: str | None = None


class KycListResponse(CamelModel):
    kyc: list[KycRow]
    pagination: Pagination


class KycRejectRequest(CamelModel):
    reason: str | None = None


# ─── Audit logs / claims ────────────────────────────────────────────────────


class AuditLogsResponse(CamelModel):
    logs: list[dict]
    pagination: Pagination


class AdminClaimRow(CamelModel):
    id: UUID
    sender_id: UUID
    recipient_name: str
    recipient_contact: str
    amount: MoneyStr
    currency: str
    status: str
    claimed: bool
    created_at: JsDateTime


class AdminClaimsListResponse(CamelModel):
    claims: list[AdminClaimRow]
    pagination: Pagination


# ─── Stats ──────────────────────────────────────────────────────────────────


class DailyStat(CamelModel):
    date: str
    volume: float | None = None
    count: int


class AdminStatsResponse(CamelModel):
    total_users: int
    active_users: int
    frozen_users: int
    verified_users: int
    total_transactions: int
    flagged_transactions: int
    total_volume: float
    pending_kyc: int
    total_merchants: int
    total_payment_links: int
    active_payment_links: int
    active_admins: int
    recent_transactions: list[DailyStat]
    user_growth: list[DailyStat]
