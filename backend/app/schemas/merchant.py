from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalMoneyStr


class MerchantResponse(CamelModel):
    id: UUID
    user_id: UUID
    business_name: str
    business_type: str
    business_category: str | None
    business_logo: str | None
    business_email: str | None
    business_phone: str | None
    business_address: str | None
    business_reg_number: str | None
    vat_number: str | None
    website: str | None
    qr_code: str
    payment_link: str
    wallet_balance: MoneyStr
    is_active: bool
    daily_limit: MoneyStr
    subscription_plan: str
    subscription_status: str
    subscription_expires_at: JsDateTime | None
    created_at: JsDateTime


class CreateMerchantRequest(CamelModel):
    business_name: str
    business_type: str
    business_category: str | None = None
    business_logo: str | None = None
    business_email: str | None = None
    business_phone: str | None = None
    business_address: str | None = None
    business_reg_number: str | None = None
    vat_number: str | None = None
    website: str | None = None
    subscription_plan: str | None = None
    is_active: bool | None = None
    daily_limit: str | None = None


class MerchantTransactionResponse(CamelModel):
    id: UUID
    merchant_id: UUID
    payer_id: UUID | None
    payer_name: str | None
    amount: MoneyStr
    type: str
    status: str
    reference: str | None
    created_at: JsDateTime


class MerchantPayInfoResponse(CamelModel):
    merchant_id: UUID
    business_name: str
    business_type: str
    qr_code: str
    owner_name: str


class MerchantPayRequest(CamelModel):
    amount: str
    payer_name: str | None = None
    reference: str | None = None


class MerchantPayResponse(CamelModel):
    transaction: MerchantTransactionResponse
    new_balance: str


class MerchantWithdrawRequest(CamelModel):
    amount: str
    currency: str | None = None
    banking_details: dict


class MerchantWithdrawResponse(CamelModel):
    success: bool
    message: str
    new_balance: str
    amount: str
    currency: str


class MerchantSubscribeRequest(CamelModel):
    plan: str


class MerchantSubscribeResponse(CamelModel):
    success: bool
    plan: str
    expires_at: JsDateTime


class DailyLimitInfo(CamelModel):
    limit: float
    used: float
    remaining: float
    percent_used: float


class AnalyticsSummary(CamelModel):
    today_revenue: float
    today_count: int
    week_revenue: float
    week_count: int
    month_revenue: float
    month_count: int
    total_revenue: float
    total_count: int
    avg_transaction: float
    revenue_growth: float


class TopCustomer(CamelModel):
    name: str
    total: float
    count: int


class AnalyticsCustomers(CamelModel):
    total: int
    this_month: int
    top_customers: list[TopCustomer]


class ChartPoint(CamelModel):
    date: str
    amount: float
    count: int


class StatusBreakdown(CamelModel):
    completed: int
    pending: int
    failed: int


class MerchantAnalyticsResponse(CamelModel):
    summary: AnalyticsSummary
    customers: AnalyticsCustomers
    daily_chart: list[ChartPoint]
    monthly_chart: list[ChartPoint]
    status_breakdown: StatusBreakdown
    daily_limit: DailyLimitInfo
