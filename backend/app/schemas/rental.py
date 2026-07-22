from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime


class PropertyResponse(CamelModel):
    id: UUID
    merchant_id: UUID
    landlord_id: UUID
    name: str
    address: str | None
    property_type: str
    total_units: int
    is_active: bool
    created_at: JsDateTime


class CreatePropertyRequest(CamelModel):
    merchant_id: str | None = None
    name: str
    address: str | None = None
    property_type: str | None = None
    total_units: int | None = None


class PropertyUnitResponse(CamelModel):
    id: UUID
    property_id: UUID
    unit_number: str
    monthly_rent: MoneyStr
    is_occupied: bool
    created_at: JsDateTime


class CreatePropertyUnitRequest(CamelModel):
    unit_number: str
    monthly_rent: str


class TenantResponse(CamelModel):
    id: UUID
    tenant_id: str
    property_id: UUID
    unit_id: UUID
    user_id: UUID | None
    name: str
    email: str | None
    phone: str | None
    move_in_date: JsDateTime
    is_active: bool
    created_at: JsDateTime


class CreateTenantRequest(CamelModel):
    property_id: str
    unit_id: str
    name: str
    email: str | None = None
    phone: str | None = None


class TenantLookupResponse(CamelModel):
    id: UUID
    tenant_id: str
    name: str
    property_name: str | None
    unit_number: str | None
    monthly_rent: MoneyStr | None


class RentPaymentResponse(CamelModel):
    id: UUID
    tenant_id: UUID
    property_id: UUID
    unit_id: UUID
    merchant_id: UUID
    amount: MoneyStr
    rent_month: str
    payment_method: str
    status: str
    reference: str | None
    created_at: JsDateTime
    tenant_name: str | None = None
    tenant_id_code: str | None = None
    unit_number: str | None = None
    new_balance: str | None = None


class RentPayRequest(CamelModel):
    tenant_id: str
    amount: str
    payment_method: str | None = None
    reference: str | None = None


class RentPaymentLinkResponse(CamelModel):
    id: UUID
    link_code: str
    tenant_id: UUID
    merchant_id: UUID
    amount: MoneyStr
    rent_month: str
    status: str
    expires_at: OptionalJsDateTime
    created_at: JsDateTime
    shareable_link: str | None = None
    tenant_name: str | None = None
    property_name: str | None = None
    property_type: str | None = None
    tenant_email: str | None = None
    property_address: str | None = None
    unit_number: str | None = None
    landlord_business_name: str | None = None


class CreateRentPaymentLinkRequest(CamelModel):
    tenant_id: str
    amount: str
    rent_month: str | None = None


class TenantDetailItem(CamelModel):
    id: UUID
    tenant_id: str
    name: str
    email: str | None
    phone: str | None
    property_id: UUID
    property_name: str | None
    unit_id: UUID
    unit_number: str | None
    monthly_rent: float
    amount_paid: float
    status: str


class RentalDashboardResponse(CamelModel):
    total_properties: int
    total_tenants: int
    total_income: float
    unpaid_count: int
    partial_count: int
    paid_count: int
    properties: list[PropertyResponse]
    tenants: list[TenantDetailItem]


class TenantDashboardResponse(CamelModel):
    id: UUID
    tenant_id: str
    name: str
    property_name: str | None
    unit_number: str | None
    monthly_rent: float
    amount_paid: float
    amount_due: float
    status: str
    due_date: str
    payment_history: list[RentPaymentResponse]


class LinkTenantRequest(CamelModel):
    tenant_id: str


class PayViaLinkRequest(CamelModel):
    pin: str | None = None


class PayViaLinkResponse(CamelModel):
    success: bool
    message: str
    payment: RentPaymentResponse
