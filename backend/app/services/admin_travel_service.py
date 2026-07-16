import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.travel import TravelDeparture, TravelOperator, TravelRoute


# ─── Operators ───────────────────────────────────────────────────────────────

async def list_operators(db: AsyncSession) -> list[TravelOperator]:
    result = await db.execute(select(TravelOperator).order_by(TravelOperator.name))
    return list(result.scalars().all())


async def create_operator(db: AsyncSession, *, name: str, mode: str, logo_url: str | None) -> TravelOperator:
    if not name.strip():
        raise ApiError("Operator name is required")
    operator = TravelOperator(name=name.strip(), mode=mode, logo_url=logo_url)
    db.add(operator)
    await db.flush()
    return operator


async def get_operator(db: AsyncSession, operator_id: str) -> TravelOperator | None:
    try:
        operator_uuid = uuid.UUID(operator_id)
    except ValueError:
        return None
    result = await db.execute(select(TravelOperator).where(TravelOperator.id == operator_uuid))
    return result.scalar_one_or_none()


async def update_operator(operator: TravelOperator, values: dict) -> TravelOperator:
    if "name" in values and values["name"] is not None:
        operator.name = values["name"]
    if "logo_url" in values:
        operator.logo_url = values["logo_url"]
    if "is_active" in values and values["is_active"] is not None:
        operator.is_active = bool(values["is_active"])
    return operator


# ─── Routes ──────────────────────────────────────────────────────────────────

async def list_routes(db: AsyncSession, *, operator_id: str | None = None) -> list[tuple[TravelRoute, TravelOperator]]:
    stmt = select(TravelRoute, TravelOperator).join(TravelOperator, TravelRoute.operator_id == TravelOperator.id)
    if operator_id:
        try:
            stmt = stmt.where(TravelRoute.operator_id == uuid.UUID(operator_id))
        except ValueError:
            pass
    stmt = stmt.order_by(TravelRoute.origin_city, TravelRoute.destination_city)
    rows = (await db.execute(stmt)).all()
    return list(rows)


async def create_route(db: AsyncSession, *, operator: TravelOperator, values: dict) -> TravelRoute:
    required = ["origin_code", "origin_city", "origin_country_code", "destination_code", "destination_city", "destination_country_code"]
    for field in required:
        if not values.get(field):
            raise ApiError(f"{field} is required")
    route = TravelRoute(
        operator_id=operator.id,
        mode=operator.mode,
        origin_code=values["origin_code"],
        origin_city=values["origin_city"],
        origin_country_code=values["origin_country_code"],
        destination_code=values["destination_code"],
        destination_city=values["destination_city"],
        destination_country_code=values["destination_country_code"],
        flight_number=values.get("flight_number"),
    )
    db.add(route)
    await db.flush()
    return route


async def get_route(db: AsyncSession, route_id: str) -> TravelRoute | None:
    try:
        route_uuid = uuid.UUID(route_id)
    except ValueError:
        return None
    result = await db.execute(select(TravelRoute).where(TravelRoute.id == route_uuid))
    return result.scalar_one_or_none()


async def update_route(route: TravelRoute, values: dict) -> TravelRoute:
    for field in ("origin_code", "origin_city", "origin_country_code", "destination_code", "destination_city", "destination_country_code", "flight_number"):
        if field in values and values[field] is not None:
            setattr(route, field, values[field])
    if "is_active" in values and values["is_active"] is not None:
        route.is_active = bool(values["is_active"])
    return route


# ─── Departures ──────────────────────────────────────────────────────────────

async def list_departures(db: AsyncSession, *, route_id: str | None = None) -> list[TravelDeparture]:
    stmt = select(TravelDeparture)
    if route_id:
        try:
            stmt = stmt.where(TravelDeparture.route_id == uuid.UUID(route_id))
        except ValueError:
            pass
    stmt = stmt.order_by(TravelDeparture.departure_at)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_departure(db: AsyncSession, *, route: TravelRoute, values: dict) -> TravelDeparture:
    try:
        price = Decimal(str(values["price"]))
    except (KeyError, InvalidOperation) as e:
        raise ApiError("A valid price is required") from e
    if price <= 0:
        raise ApiError("Price must be positive")

    business_price = None
    if values.get("business_price"):
        try:
            business_price = Decimal(str(values["business_price"]))
        except InvalidOperation as e:
            raise ApiError("Invalid business price") from e

    if not values.get("departure_at") or not values.get("arrival_at"):
        raise ApiError("departure_at and arrival_at are required")

    departure = TravelDeparture(
        route_id=route.id,
        departure_at=values["departure_at"],
        arrival_at=values["arrival_at"],
        price=price,
        business_price=business_price,
        currency=values.get("currency") or "ZAR",
        total_seats=int(values.get("total_seats") or 40),
    )
    db.add(departure)
    await db.flush()
    return departure


async def get_departure(db: AsyncSession, departure_id: str) -> TravelDeparture | None:
    try:
        dep_uuid = uuid.UUID(departure_id)
    except ValueError:
        return None
    result = await db.execute(select(TravelDeparture).where(TravelDeparture.id == dep_uuid))
    return result.scalar_one_or_none()


_DEPARTURE_DECIMAL_FIELDS = {"price", "business_price"}


async def update_departure(departure: TravelDeparture, values: dict) -> TravelDeparture:
    for field, raw in values.items():
        if raw is None:
            continue
        if field in _DEPARTURE_DECIMAL_FIELDS:
            try:
                setattr(departure, field, Decimal(str(raw)))
            except InvalidOperation as e:
                raise ApiError(f"Invalid value for {field}") from e
        elif field == "total_seats":
            if int(raw) < departure.seats_booked:
                raise ApiError(f"Can't set total seats below the {departure.seats_booked} already booked")
            departure.total_seats = int(raw)
        elif field == "is_active":
            departure.is_active = bool(raw)
        elif field in ("departure_at", "arrival_at", "currency"):
            setattr(departure, field, raw)
    return departure
