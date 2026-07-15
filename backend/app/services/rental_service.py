import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import MerchantBusinessType, RentPaymentStatus, TransactionType
from app.models.merchant import Merchant
from app.models.rental import Property, PropertyUnit, RentPayment, RentPaymentLink, Tenant
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

# NOTE (deviation, flagged per fork instructions — not applied to enums.py):
# The Node handler auto-creates a landlord's default merchant with the
# literal businessType "Property" (capital P, matched later via
# `.toLowerCase() === "property"`), and stamps rent-payment-link wallet
# debits with a custom transaction type "rent_payment" and a NEGATIVE
# amount. Neither is representable against the schema as built:
# MerchantBusinessType has no "property" member (closest is "rental"), and
# TransactionType has no "rent_payment" member — plus `transactions.amount`
# has a `CHECK (amount > 0)` constraint that a negative amount would violate
# outright. This service uses MerchantBusinessType.RENTAL for the
# auto-created merchant (matched by business_type == 'rental' on lookup)
# and TransactionType.DEBIT with a positive amount + category "rent" for
# the link-pay transaction. Everything else mirrors routes.ts exactly.


def _generate_tenant_code() -> str:
    date_str = datetime.now(UTC).strftime("%Y%m%d")
    random_part = secrets.randbelow(9000) + 1000
    return f"TEN-{date_str}-{random_part}"


def _generate_link_code() -> str:
    ts = int(datetime.now(UTC).timestamp() * 1000)
    return f"RPL-{ts:x}".upper() + f"-{secrets.token_hex(3).upper()[:4]}"


async def get_properties_by_landlord(db: AsyncSession, landlord_id: uuid.UUID) -> list[Property]:
    result = await db.execute(select(Property).where(Property.landlord_id == landlord_id))
    return list(result.scalars().all())


async def get_property(db: AsyncSession, property_id: str) -> Property | None:
    try:
        property_uuid = uuid.UUID(property_id)
    except ValueError:
        return None
    result = await db.execute(select(Property).where(Property.id == property_uuid))
    return result.scalar_one_or_none()


async def _get_or_create_property_merchant(db: AsyncSession, user_id: uuid.UUID) -> Merchant:
    result = await db.execute(
        select(Merchant).where(Merchant.user_id == user_id, Merchant.business_type == MerchantBusinessType.RENTAL)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    display_name = (user.name.split(" ")[0] if user and user.name else "My")

    merchant = Merchant(
        user_id=user_id,
        business_name=f"{display_name} Properties",
        business_type=MerchantBusinessType.RENTAL,
        is_active=True,
        qr_code=f"BKP-{secrets.token_hex(8).upper()}",
        payment_link=f"pay-{secrets.token_hex(6)}",
    )
    db.add(merchant)
    await db.flush()
    return merchant


async def create_property(
    db: AsyncSession, user_id: uuid.UUID, *, merchant_id: str | None, name: str, address: str | None,
    property_type: str | None, total_units: int | None,
) -> Property:
    if not name:
        raise ApiError("Property name is required")

    if merchant_id:
        try:
            merchant_uuid = uuid.UUID(merchant_id)
        except ValueError:
            merchant_uuid = None
        merchant = None
        if merchant_uuid:
            result = await db.execute(select(Merchant).where(Merchant.id == merchant_uuid))
            merchant = result.scalar_one_or_none()
        if merchant is None or merchant.user_id != user_id:
            raise ApiError("Forbidden", status_code=403)
        resolved_merchant_id = merchant.id
    else:
        merchant = await _get_or_create_property_merchant(db, user_id)
        resolved_merchant_id = merchant.id

    property_ = Property(
        merchant_id=resolved_merchant_id, landlord_id=user_id, name=name, address=address,
        property_type=property_type or "apartment", total_units=total_units or 1,
    )
    db.add(property_)
    await db.flush()
    return property_


async def get_property_units(db: AsyncSession, property_id: uuid.UUID) -> list[PropertyUnit]:
    result = await db.execute(select(PropertyUnit).where(PropertyUnit.property_id == property_id))
    return list(result.scalars().all())


async def get_property_unit(db: AsyncSession, unit_id: uuid.UUID) -> PropertyUnit | None:
    result = await db.execute(select(PropertyUnit).where(PropertyUnit.id == unit_id))
    return result.scalar_one_or_none()


async def create_property_unit(
    db: AsyncSession, property_id: uuid.UUID, *, unit_number: str, monthly_rent: str
) -> PropertyUnit:
    if not unit_number or not monthly_rent:
        raise ApiError("Unit number and monthly rent are required")
    try:
        rent = Decimal(monthly_rent)
    except InvalidOperation as e:
        raise ApiError("Unit number and monthly rent are required") from e

    unit = PropertyUnit(property_id=property_id, unit_number=unit_number, monthly_rent=rent)
    db.add(unit)
    await db.flush()
    return unit


async def get_tenants_by_landlord(db: AsyncSession, landlord_id: uuid.UUID) -> list[Tenant]:
    result = await db.execute(
        select(Tenant).join(Property, Property.id == Tenant.property_id).where(Property.landlord_id == landlord_id)
    )
    return list(result.scalars().all())


async def get_tenant(db: AsyncSession, tenant_id: str) -> Tenant | None:
    try:
        tenant_uuid = uuid.UUID(tenant_id)
    except ValueError:
        return None
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_uuid))
    return result.scalar_one_or_none()


async def get_tenant_by_tenant_code(db: AsyncSession, tenant_code: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.tenant_id == tenant_code))
    return result.scalar_one_or_none()


async def get_tenant_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.user_id == user_id))
    return result.scalar_one_or_none()


async def create_tenant(
    db: AsyncSession, landlord_id: uuid.UUID, *, property_id: str, unit_id: str, name: str,
    email: str | None, phone: str | None,
) -> Tenant:
    if not property_id or not unit_id or not name:
        raise ApiError("Property, unit, and name are required")

    property_ = await get_property(db, property_id)
    if property_ is None or property_.landlord_id != landlord_id:
        raise ApiError("Forbidden", status_code=403)

    tenant = Tenant(
        tenant_id=_generate_tenant_code(), property_id=uuid.UUID(property_id), unit_id=uuid.UUID(unit_id),
        name=name, email=email, phone=phone,
    )
    db.add(tenant)

    unit = await get_property_unit(db, uuid.UUID(unit_id))
    if unit is not None:
        unit.is_occupied = True

    await db.flush()
    return tenant


async def update_tenant(db: AsyncSession, tenant: Tenant, **fields) -> Tenant:
    for key, value in fields.items():
        setattr(tenant, key, value)
    await db.flush()
    return tenant


async def get_rent_payments_for_month(db: AsyncSession, tenant_id: uuid.UUID, month: str) -> list[RentPayment]:
    result = await db.execute(
        select(RentPayment).where(RentPayment.tenant_id == tenant_id, RentPayment.rent_month == month)
    )
    return list(result.scalars().all())


async def get_rent_payments_by_property(db: AsyncSession, property_id: uuid.UUID) -> list[RentPayment]:
    result = await db.execute(select(RentPayment).where(RentPayment.property_id == property_id))
    return list(result.scalars().all())


async def get_rent_payments_by_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> list[RentPayment]:
    result = await db.execute(
        select(RentPayment).where(RentPayment.tenant_id == tenant_id).order_by(RentPayment.created_at.desc())
    )
    return list(result.scalars().all())


def _current_month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


async def get_dashboard(db: AsyncSession, landlord_id: uuid.UUID) -> dict:
    properties = await get_properties_by_landlord(db, landlord_id)
    tenants = await get_tenants_by_landlord(db, landlord_id)
    current_month = _current_month()

    tenant_details = []
    for tenant in tenants:
        unit = await get_property_unit(db, tenant.unit_id)
        property_ = await get_property(db, str(tenant.property_id))
        payments = await get_rent_payments_for_month(db, tenant.id, current_month)

        monthly_rent = unit.monthly_rent if unit else Decimal("0")
        amount_paid = sum((p.amount for p in payments), Decimal("0"))

        status = "unpaid"
        if amount_paid >= monthly_rent:
            status = "paid"
        elif amount_paid > 0:
            status = "partial"

        tenant_details.append({
            "id": tenant.id, "tenantId": tenant.tenant_id, "name": tenant.name, "email": tenant.email,
            "phone": tenant.phone, "propertyId": tenant.property_id,
            "propertyName": property_.name if property_ else None, "unitId": tenant.unit_id,
            "unitNumber": unit.unit_number if unit else None, "monthlyRent": float(monthly_rent),
            "amountPaid": float(amount_paid), "status": status,
        })

    total_income = Decimal("0")
    for prop in properties:
        payments = await get_rent_payments_by_property(db, prop.id)
        total_income += sum((p.amount for p in payments), Decimal("0"))

    unpaid_count = sum(1 for t in tenant_details if t["status"] == "unpaid")
    partial_count = sum(1 for t in tenant_details if t["status"] == "partial")
    paid_count = sum(1 for t in tenant_details if t["status"] == "paid")

    return {
        "totalProperties": len(properties), "totalTenants": len(tenants), "totalIncome": float(total_income),
        "unpaidCount": unpaid_count, "partialCount": partial_count, "paidCount": paid_count,
        "properties": properties, "tenants": tenant_details,
    }


async def get_property_payments_detailed(db: AsyncSession, property_id: uuid.UUID) -> list[dict]:
    payments = await get_rent_payments_by_property(db, property_id)
    detailed = []
    for p in payments:
        tenant = await get_tenant(db, str(p.tenant_id))
        unit = await get_property_unit(db, p.unit_id)
        detailed.append({
            "id": p.id, "tenantId": p.tenant_id, "propertyId": p.property_id, "unitId": p.unit_id,
            "merchantId": p.merchant_id, "amount": p.amount, "rentMonth": p.rent_month,
            "paymentMethod": p.payment_method, "status": p.status, "reference": p.reference,
            "createdAt": p.created_at, "tenantName": tenant.name if tenant else None,
            "tenantIdCode": tenant.tenant_id if tenant else None,
            "unitNumber": unit.unit_number if unit else None,
        })
    return detailed


async def pay_rent(
    db: AsyncSession, user_id: uuid.UUID, *, tenant_code: str, amount: str, payment_method: str | None,
    reference: str | None,
) -> tuple[RentPayment, Decimal]:
    if not tenant_code or not amount:
        raise ApiError("Tenant ID and amount are required")
    try:
        amount_num = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if amount_num <= 0:
        raise ApiError("Invalid amount")

    tenant = await get_tenant_by_tenant_code(db, tenant_code)
    if tenant is None:
        raise ApiError("Tenant not found", status_code=404)
    if tenant.user_id != user_id:
        raise ApiError("You can only pay for your own tenant account", status_code=403)

    property_ = await get_property(db, str(tenant.property_id))
    if property_ is None:
        raise ApiError("Property not found", status_code=404)

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    cards = list(cards_result.scalars().all())
    if not cards:
        raise ApiError("No wallet found. Please top up your BukkaPay wallet first.")
    primary_card = cards[0]

    if primary_card.balance < amount_num:
        raise ApiError(f"Insufficient wallet balance. Available: R{primary_card.balance:.2f}")

    new_tenant_balance = primary_card.balance - amount_num
    primary_card.balance = new_tenant_balance

    payment = RentPayment(
        tenant_id=tenant.id, property_id=tenant.property_id, unit_id=tenant.unit_id,
        merchant_id=property_.merchant_id, amount=amount_num, rent_month=_current_month(),
        payment_method=payment_method or "wallet", status=RentPaymentStatus.COMPLETED, reference=reference,
    )
    db.add(payment)

    merchant_result = await db.execute(select(Merchant).where(Merchant.id == property_.merchant_id))
    merchant = merchant_result.scalar_one_or_none()
    if merchant is not None:
        merchant.wallet_balance = merchant.wallet_balance + amount_num

    await db.flush()
    return payment, new_tenant_balance


async def get_tenant_dashboard(db: AsyncSession, user_id: uuid.UUID) -> dict:
    tenant = await get_tenant_by_user_id(db, user_id)
    if tenant is None:
        raise ApiError("Tenant profile not found", status_code=404)

    unit = await get_property_unit(db, tenant.unit_id)
    property_ = await get_property(db, str(tenant.property_id))
    current_month = _current_month()
    payments = await get_rent_payments_for_month(db, tenant.id, current_month)
    all_payments = await get_rent_payments_by_tenant(db, tenant.id)

    monthly_rent = unit.monthly_rent if unit else Decimal("0")
    amount_paid = sum((p.amount for p in payments), Decimal("0"))

    status = "unpaid"
    if amount_paid >= monthly_rent:
        status = "paid"
    elif amount_paid > 0:
        status = "partial"

    return {
        "id": tenant.id, "tenantId": tenant.tenant_id, "name": tenant.name,
        "propertyName": property_.name if property_ else None,
        "unitNumber": unit.unit_number if unit else None, "monthlyRent": float(monthly_rent),
        "amountPaid": float(amount_paid), "amountDue": max(0.0, float(monthly_rent - amount_paid)),
        "status": status, "dueDate": f"{current_month}-01", "paymentHistory": all_payments,
    }


async def link_tenant(db: AsyncSession, user_id: uuid.UUID, tenant_code: str) -> Tenant:
    if not tenant_code:
        raise ApiError("Tenant ID is required")
    tenant = await get_tenant_by_tenant_code(db, tenant_code)
    if tenant is None:
        raise ApiError("Tenant not found", status_code=404)
    if tenant.user_id:
        raise ApiError("Tenant already linked to an account")
    tenant.user_id = user_id
    await db.flush()
    return tenant


async def create_payment_link(
    db: AsyncSession, landlord_id: uuid.UUID, *, tenant_id: str, amount: str, rent_month: str | None,
) -> tuple[RentPaymentLink, Tenant, Property]:
    if not tenant_id or not amount:
        raise ApiError("Tenant ID and amount are required")
    try:
        amount_num = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Amount must be a positive number") from e
    if amount_num <= 0:
        raise ApiError("Amount must be a positive number")

    tenant = await get_tenant(db, tenant_id)
    if tenant is None:
        raise ApiError("Tenant not found", status_code=404)

    property_ = await get_property(db, str(tenant.property_id))
    if property_ is None or property_.landlord_id != landlord_id:
        raise ApiError("Not authorized to create payment link for this tenant", status_code=403)

    link = RentPaymentLink(
        link_code=_generate_link_code(), tenant_id=tenant.id, merchant_id=property_.merchant_id,
        amount=amount_num, rent_month=rent_month or _current_month(),
    )
    db.add(link)
    await db.flush()
    return link, tenant, property_


async def get_payment_link_by_code(db: AsyncSession, link_code: str) -> RentPaymentLink | None:
    result = await db.execute(select(RentPaymentLink).where(RentPaymentLink.link_code == link_code))
    return result.scalar_one_or_none()


async def get_payment_link_detail(db: AsyncSession, link_code: str) -> dict:
    link = await get_payment_link_by_code(db, link_code)
    if link is None:
        raise ApiError("Payment link not found or expired", status_code=404)
    if link.status == "paid":
        raise ApiError("This payment link has already been used")

    tenant = await get_tenant(db, str(link.tenant_id))
    property_ = await get_property(db, str(tenant.property_id)) if tenant else None
    unit = await get_property_unit(db, tenant.unit_id) if tenant else None
    merchant_result = await db.execute(select(Merchant).where(Merchant.id == link.merchant_id))
    merchant = merchant_result.scalar_one_or_none()

    return {
        "id": link.id, "linkCode": link.link_code, "tenantId": link.tenant_id, "merchantId": link.merchant_id,
        "amount": link.amount, "rentMonth": link.rent_month, "status": link.status,
        "expiresAt": link.expires_at, "createdAt": link.created_at,
        "tenantName": tenant.name if tenant else None, "tenantEmail": tenant.email if tenant else None,
        "propertyName": property_.name if property_ else None,
        "propertyAddress": property_.address if property_ else None,
        "unitNumber": unit.unit_number if unit else None,
        "landlordBusinessName": merchant.business_name if merchant else None,
    }


async def pay_via_link(db: AsyncSession, user_id: uuid.UUID, link_code: str) -> RentPayment:
    link = await get_payment_link_by_code(db, link_code)
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    if link.status == "paid":
        raise ApiError("This payment link has already been paid")

    tenant = await get_tenant(db, str(link.tenant_id))
    if tenant is None:
        raise ApiError("Tenant not found", status_code=404)
    property_ = await get_property(db, str(tenant.property_id))
    if property_ is None:
        raise ApiError("Property not found", status_code=404)

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    cards = list(cards_result.scalars().all())
    if not cards:
        raise ApiError("No wallet card found. Please add a card first.")
    primary_card = cards[0]

    if primary_card.balance < link.amount:
        raise ApiError("Insufficient funds in your wallet")

    primary_card.balance = primary_card.balance - link.amount

    db.add(Transaction(
        user_id=user_id, card_id=primary_card.id, title=f"Rent Payment - {property_.name}",
        category="rent", amount=link.amount, type=TransactionType.DEBIT, icon="home",
    ))

    payment = RentPayment(
        tenant_id=tenant.id, property_id=tenant.property_id, unit_id=tenant.unit_id,
        merchant_id=property_.merchant_id, amount=link.amount, rent_month=link.rent_month,
        payment_method="wallet", status=RentPaymentStatus.COMPLETED, reference=f"LINK-{link.link_code}",
    )
    db.add(payment)

    merchant_result = await db.execute(select(Merchant).where(Merchant.id == property_.merchant_id))
    merchant = merchant_result.scalar_one_or_none()
    if merchant is not None:
        merchant.wallet_balance = merchant.wallet_balance + link.amount

    link.status = "paid"

    if not tenant.user_id:
        tenant.user_id = user_id

    await db.flush()
    return payment
