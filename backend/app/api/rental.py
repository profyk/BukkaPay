from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.rental import (
    CreatePropertyRequest,
    CreatePropertyUnitRequest,
    CreateRentPaymentLinkRequest,
    CreateTenantRequest,
    LinkTenantRequest,
    PayViaLinkRequest,
    PayViaLinkResponse,
    PropertyResponse,
    PropertyUnitResponse,
    RentalDashboardResponse,
    RentPaymentLinkResponse,
    RentPaymentResponse,
    RentPayRequest,
    TenantDashboardResponse,
    TenantLookupResponse,
    TenantResponse,
)
from app.services import pin_service, rental_service

router = APIRouter(prefix="/api/rental", tags=["rental"])


@router.get("/properties")
async def list_properties(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[PropertyResponse]:
    props = await rental_service.get_properties_by_landlord(db, user_id)
    return [PropertyResponse.model_validate(p) for p in props]


@router.post("/properties", status_code=201)
async def create_property(
    body: CreatePropertyRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PropertyResponse:
    property_ = await rental_service.create_property(
        db, user_id, merchant_id=body.merchant_id, name=body.name, address=body.address,
        property_type=body.property_type, total_units=body.total_units,
    )
    return PropertyResponse.model_validate(property_)


@router.get("/properties/{property_id}")
async def get_property(
    property_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PropertyResponse:
    property_ = await rental_service.get_property(db, property_id)
    if property_ is None:
        raise ApiError("Property not found", status_code=404)
    if property_.landlord_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    return PropertyResponse.model_validate(property_)


@router.get("/properties/{property_id}/units")
async def list_units(
    property_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[PropertyUnitResponse]:
    property_ = await rental_service.get_property(db, property_id)
    if property_ is None:
        raise ApiError("Property not found", status_code=404)
    if property_.landlord_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    units = await rental_service.get_property_units(db, property_.id)
    return [PropertyUnitResponse.model_validate(u) for u in units]


@router.post("/properties/{property_id}/units", status_code=201)
async def create_unit(
    property_id: str, body: CreatePropertyUnitRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> PropertyUnitResponse:
    property_ = await rental_service.get_property(db, property_id)
    if property_ is None:
        raise ApiError("Property not found", status_code=404)
    if property_.landlord_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    unit = await rental_service.create_property_unit(
        db, property_.id, unit_number=body.unit_number, monthly_rent=body.monthly_rent
    )
    return PropertyUnitResponse.model_validate(unit)


@router.get("/tenants")
async def list_tenants(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[TenantResponse]:
    tenants = await rental_service.get_tenants_by_landlord(db, user_id)
    return [TenantResponse.model_validate(t) for t in tenants]


@router.post("/tenants", status_code=201)
async def create_tenant(
    body: CreateTenantRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TenantResponse:
    tenant = await rental_service.create_tenant(
        db, user_id, property_id=body.property_id, unit_id=body.unit_id, name=body.name,
        email=body.email, phone=body.phone,
    )
    return TenantResponse.model_validate(tenant)


@router.get("/tenant-lookup/{tenant_code}")
async def tenant_lookup(tenant_code: str, db: AsyncSession = Depends(get_db)) -> TenantLookupResponse:
    tenant = await rental_service.get_tenant_by_tenant_code(db, tenant_code)
    if tenant is None:
        raise ApiError("Tenant not found", status_code=404)
    unit = await rental_service.get_property_unit(db, tenant.unit_id)
    property_ = await rental_service.get_property(db, str(tenant.property_id))
    return TenantLookupResponse.model_validate({
        "id": tenant.id, "tenantId": tenant.tenant_id, "name": tenant.name,
        "propertyName": property_.name if property_ else None,
        "unitNumber": unit.unit_number if unit else None,
        "monthlyRent": unit.monthly_rent if unit else None,
    })


@router.get("/dashboard")
async def landlord_dashboard(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> RentalDashboardResponse:
    dashboard = await rental_service.get_dashboard(db, user_id)
    return RentalDashboardResponse.model_validate(dashboard)


@router.get("/properties/{property_id}/payments")
async def property_payments(
    property_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[RentPaymentResponse]:
    property_ = await rental_service.get_property(db, property_id)
    if property_ is None or property_.landlord_id != user_id:
        raise ApiError("Forbidden", status_code=403)
    payments = await rental_service.get_property_payments_detailed(db, property_.id)
    return [RentPaymentResponse.model_validate(p) for p in payments]


@router.post("/pay", status_code=201)
async def pay_rent(
    body: RentPayRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> RentPaymentResponse:
    payment, new_balance = await rental_service.pay_rent(
        db, user_id, tenant_code=body.tenant_id, amount=body.amount, payment_method=body.payment_method,
        reference=body.reference,
    )
    payload = RentPaymentResponse.model_validate(payment)
    payload.new_balance = f"{new_balance:.2f}"
    return payload


@router.get("/tenant-dashboard")
async def tenant_dashboard(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TenantDashboardResponse:
    dashboard = await rental_service.get_tenant_dashboard(db, user_id)
    return TenantDashboardResponse.model_validate(dashboard)


@router.post("/link-tenant")
async def link_tenant(
    body: LinkTenantRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TenantResponse:
    tenant = await rental_service.link_tenant(db, user_id, body.tenant_id)
    return TenantResponse.model_validate(tenant)


@router.post("/payment-links", status_code=201)
async def create_payment_link(
    body: CreateRentPaymentLinkRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> RentPaymentLinkResponse:
    link, tenant, property_ = await rental_service.create_payment_link(
        db, user_id, tenant_id=body.tenant_id, amount=body.amount, rent_month=body.rent_month,
    )
    payload = RentPaymentLinkResponse.model_validate(link)
    payload.shareable_link = f"/pay-rent/{link.link_code}"
    payload.tenant_name = tenant.name
    payload.property_name = property_.name
    return payload


@router.get("/payment-links/{link_code}")
async def get_payment_link(link_code: str, db: AsyncSession = Depends(get_db)) -> RentPaymentLinkResponse:
    detail = await rental_service.get_payment_link_detail(db, link_code)
    return RentPaymentLinkResponse.model_validate(detail)


@router.post("/payment-links/{link_code}/pay")
async def pay_via_link(
    link_code: str, body: PayViaLinkRequest = PayViaLinkRequest(),
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
) -> PayViaLinkResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    payment = await rental_service.pay_via_link(db, user_id, link_code)
    return PayViaLinkResponse.model_validate({
        "success": True, "message": "Rent payment successful!", "payment": payment,
    })
