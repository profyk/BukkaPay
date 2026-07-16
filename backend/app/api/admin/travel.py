from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, admin_auth
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.travel import (
    CreateDepartureRequest,
    CreateOperatorRequest,
    CreateRouteRequest,
    TravelDepartureResponse,
    TravelOperatorResponse,
    TravelRouteResponse,
    UpdateDepartureRequest,
    UpdateOperatorRequest,
    UpdateRouteRequest,
)
from app.services import admin_travel_service as svc

router = APIRouter(prefix="/travel", tags=["admin-travel"])


# ─── Operators ───────────────────────────────────────────────────────────────

@router.get("/operators")
async def list_operators(
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> list[TravelOperatorResponse]:
    operators = await svc.list_operators(db)
    return [TravelOperatorResponse.model_validate(o) for o in operators]


@router.post("/operators", status_code=201)
async def create_operator(
    body: CreateOperatorRequest, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> TravelOperatorResponse:
    operator = await svc.create_operator(db, name=body.name, mode=body.mode, logo_url=body.logo_url)
    return TravelOperatorResponse.model_validate(operator)


@router.patch("/operators/{operator_id}")
async def update_operator(
    operator_id: str, body: UpdateOperatorRequest,
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> TravelOperatorResponse:
    operator = await svc.get_operator(db, operator_id)
    if operator is None:
        raise ApiError("Operator not found", status_code=404)
    await svc.update_operator(operator, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.refresh(operator)
    return TravelOperatorResponse.model_validate(operator)


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/routes")
async def list_routes(
    operator_id: str | None = Query(default=None),
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> list[TravelRouteResponse]:
    rows = await svc.list_routes(db, operator_id=operator_id)
    return [
        TravelRouteResponse.model_validate({**{c.name: getattr(route, c.name) for c in route.__table__.columns}, "operator": operator})
        for route, operator in rows
    ]


@router.post("/operators/{operator_id}/routes", status_code=201)
async def create_route(
    operator_id: str, body: CreateRouteRequest,
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> TravelRouteResponse:
    operator = await svc.get_operator(db, operator_id)
    if operator is None:
        raise ApiError("Operator not found", status_code=404)
    route = await svc.create_route(db, operator=operator, values=body.model_dump())
    return TravelRouteResponse.model_validate(route)


@router.patch("/routes/{route_id}")
async def update_route(
    route_id: str, body: UpdateRouteRequest,
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> TravelRouteResponse:
    route = await svc.get_route(db, route_id)
    if route is None:
        raise ApiError("Route not found", status_code=404)
    await svc.update_route(route, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.refresh(route)
    return TravelRouteResponse.model_validate(route)


# ─── Departures ──────────────────────────────────────────────────────────────

@router.get("/routes/{route_id}/departures")
async def list_departures(
    route_id: str, _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db)
) -> list[TravelDepartureResponse]:
    departures = await svc.list_departures(db, route_id=route_id)
    return [TravelDepartureResponse.model_validate(d) for d in departures]


@router.post("/routes/{route_id}/departures", status_code=201)
async def create_departure(
    route_id: str, body: CreateDepartureRequest,
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> TravelDepartureResponse:
    route = await svc.get_route(db, route_id)
    if route is None:
        raise ApiError("Route not found", status_code=404)
    departure = await svc.create_departure(db, route=route, values=body.model_dump())
    return TravelDepartureResponse.model_validate(departure)


@router.patch("/departures/{departure_id}")
async def update_departure(
    departure_id: str, body: UpdateDepartureRequest,
    _ctx: AdminContext = Depends(admin_auth), db: AsyncSession = Depends(get_db),
) -> TravelDepartureResponse:
    departure = await svc.get_departure(db, departure_id)
    if departure is None:
        raise ApiError("Departure not found", status_code=404)
    await svc.update_departure(departure, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.refresh(departure)
    return TravelDepartureResponse.model_validate(departure)
