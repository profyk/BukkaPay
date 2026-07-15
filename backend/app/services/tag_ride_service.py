import secrets
import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import TagRideStatus, TransactionType
from app.models.tag_ride import TagRideDriver, TagRideRide
from app.models.user import User
from app.models.wallet import Transaction, WalletCard


async def get_driver_by_user(db: AsyncSession, user_id: uuid.UUID) -> TagRideDriver | None:
    result = await db.execute(select(TagRideDriver).where(TagRideDriver.user_id == user_id))
    return result.scalar_one_or_none()


async def register_driver(
    db: AsyncSession, user_id: uuid.UUID, *, vehicle_number: str, vehicle_type: str | None,
) -> TagRideDriver:
    if not vehicle_number.strip():
        raise ApiError("Vehicle number is required")

    existing = await get_driver_by_user(db, user_id)
    if existing is not None:
        existing.vehicle_number = vehicle_number.strip()
        existing.vehicle_type = vehicle_type or "taxi"
        existing.is_active = True
        await db.flush()
        return existing

    driver = TagRideDriver(
        user_id=user_id, vehicle_number=vehicle_number.strip(), vehicle_type=vehicle_type or "taxi",
    )
    db.add(driver)
    await db.flush()
    return driver


async def get_driver_with_user(db: AsyncSession, driver_id: str) -> dict | None:
    try:
        driver_uuid = uuid.UUID(driver_id)
    except ValueError:
        return None
    result = await db.execute(select(TagRideDriver).where(TagRideDriver.id == driver_uuid))
    driver = result.scalar_one_or_none()
    if driver is None:
        return None
    user_result = await db.execute(select(User).where(User.id == driver.user_id))
    user = user_result.scalar_one_or_none()
    return {
        "id": driver.id, "vehicleNumber": driver.vehicle_number, "vehicleType": driver.vehicle_type,
        "isActive": driver.is_active, "name": user.name if user else None,
    }


async def pay_driver(
    db: AsyncSession, passenger_id: uuid.UUID, *, driver_id: str, amount: str,
) -> tuple[TagRideRide, Decimal]:
    try:
        driver_uuid = uuid.UUID(driver_id)
    except ValueError as e:
        raise ApiError("Invalid payment details") from e
    try:
        amount_num = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid payment details") from e
    if amount_num <= 0:
        raise ApiError("Invalid payment details")

    # Row-lock the driver, both wallet cards for the whole transaction —
    # mirrors the `FOR UPDATE` pessimistic locking in the original Node
    # handler, which ran this as a single hand-managed pg transaction.
    driver_result = await db.execute(
        select(TagRideDriver).where(TagRideDriver.id == driver_uuid).with_for_update()
    )
    driver = driver_result.scalar_one_or_none()
    if driver is None:
        raise ApiError("Driver not found", status_code=404)
    if not driver.is_active:
        raise ApiError("Driver is not active")
    if driver.user_id == passenger_id:
        raise ApiError("Cannot pay yourself")

    passenger_card_result = await db.execute(
        select(WalletCard)
        .where(WalletCard.user_id == passenger_id, WalletCard.frozen.is_(False))
        .order_by(WalletCard.created_at.asc())
        .limit(1)
        .with_for_update()
    )
    passenger_card = passenger_card_result.scalar_one_or_none()
    if passenger_card is None:
        raise ApiError("No active wallet card found")
    if passenger_card.balance < amount_num:
        raise ApiError(f"Insufficient balance. Available: {passenger_card.balance:.2f}")

    driver_card_result = await db.execute(
        select(WalletCard)
        .where(WalletCard.user_id == driver.user_id)
        .order_by(WalletCard.created_at.asc())
        .limit(1)
        .with_for_update()
    )
    driver_card = driver_card_result.scalar_one_or_none()
    if driver_card is None:
        raise ApiError("Driver has no wallet")

    new_passenger_balance = passenger_card.balance - amount_num
    passenger_card.balance = new_passenger_balance
    driver_card.balance = driver_card.balance + amount_num
    driver.total_earnings = driver.total_earnings + amount_num

    reference = f"TRD-{int(datetime.now(UTC).timestamp() * 1000)}-{secrets.token_hex(3).upper()}"

    driver_user_result = await db.execute(select(User).where(User.id == driver.user_id))
    driver_user = driver_user_result.scalar_one_or_none()

    ride = TagRideRide(
        passenger_id=passenger_id, driver_id=driver.id, passenger_card_id=passenger_card.id,
        driver_card_id=driver_card.id, amount=amount_num, reference=reference,
    )
    db.add(ride)

    db.add(Transaction(
        user_id=passenger_id, card_id=passenger_card.id,
        title=f"Tag n Ride - {driver_user.name if driver_user else ''}", category="transport",
        amount=amount_num, type=TransactionType.DEBIT, icon="car",
    ))
    db.add(Transaction(
        user_id=driver.user_id, card_id=driver_card.id, title="Tag n Ride Fare", category="transport",
        amount=amount_num, type=TransactionType.CREDIT, icon="cash",
    ))

    await db.flush()
    return ride, new_passenger_balance


async def get_passenger_rides(db: AsyncSession, passenger_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(TagRideRide, TagRideDriver, User)
        .join(TagRideDriver, TagRideRide.driver_id == TagRideDriver.id)
        .join(User, TagRideDriver.user_id == User.id)
        .where(TagRideRide.passenger_id == passenger_id)
        .order_by(TagRideRide.created_at.desc())
        .limit(50)
    )
    rows = result.all()
    rides = []
    for ride, driver, user in rows:
        payload = _ride_dict(ride)
        payload.update({"vehicleNumber": driver.vehicle_number, "vehicleType": driver.vehicle_type, "driverName": user.name})
        rides.append(payload)
    return rides


async def get_driver_rides(db: AsyncSession, user_id: uuid.UUID) -> tuple[list[dict], Decimal]:
    driver = await get_driver_by_user(db, user_id)
    if driver is None:
        return [], Decimal("0")

    result = await db.execute(
        select(TagRideRide, User)
        .join(User, TagRideRide.passenger_id == User.id)
        .where(TagRideRide.driver_id == driver.id)
        .order_by(TagRideRide.created_at.desc())
        .limit(50)
    )
    rows = result.all()
    rides = []
    for ride, passenger in rows:
        payload = _ride_dict(ride)
        payload["passengerName"] = passenger.name
        rides.append(payload)

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_total = sum(
        (ride.amount for ride, _ in rows
         if ride.created_at >= today_start and ride.status == TagRideStatus.COMPLETED),
        Decimal("0"),
    )
    return rides, today_total


def _ride_dict(ride: TagRideRide) -> dict:
    return {
        "id": ride.id, "passengerId": ride.passenger_id, "driverId": ride.driver_id,
        "passengerCardId": ride.passenger_card_id, "driverCardId": ride.driver_card_id,
        "amount": ride.amount, "status": ride.status, "reference": ride.reference,
        "createdAt": ride.created_at,
    }
