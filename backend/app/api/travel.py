from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.purchase_transaction import PurchaseTransactionResponse
from app.schemas.travel import (
    AirportResponse,
    BookFlightRequest,
    BookTravelRequest,
    FlightOfferResponse,
    TravelSearchResult,
)
from app.services import flight_service, travel_service

router = APIRouter(prefix="/api/travel", tags=["travel"])


def _to_search_result(bundle: dict) -> TravelSearchResult:
    dep, route, operator = bundle["departure"], bundle["route"], bundle["operator"]
    return TravelSearchResult.model_validate({
        "departure_id": dep.id,
        "operator_name": operator.name,
        "mode": route.mode,
        "origin_code": route.origin_code,
        "origin_city": route.origin_city,
        "origin_country_code": route.origin_country_code,
        "destination_code": route.destination_code,
        "destination_city": route.destination_city,
        "destination_country_code": route.destination_country_code,
        "flight_number": route.flight_number,
        "departure_at": dep.departure_at,
        "arrival_at": dep.arrival_at,
        "price": dep.price,
        "business_price": dep.business_price,
        "currency": dep.currency,
        "seats_available": bundle["seatsAvailable"],
    })


@router.get("/search")
async def search_departures(
    mode: str = Query(...),
    origin_country_code: str | None = Query(default=None),
    destination_country_code: str | None = Query(default=None),
    date: str | None = Query(default=None),
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
) -> list[TravelSearchResult]:
    if mode == "bus":
        raise ApiError("Bus bookings are no longer offered on BukkaPay. Flights are available under Travel.",
                       status_code=410)
    if mode != "flight":
        raise ApiError("mode must be 'flight'")
    bundles = await travel_service.search_departures(
        db, mode=mode, origin_country_code=origin_country_code,
        destination_country_code=destination_country_code, date=date,
    )
    return [_to_search_result(b) for b in bundles]


@router.get("/departures/{departure_id}")
async def get_departure(
    departure_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TravelSearchResult:
    bundle = await travel_service.get_departure(db, departure_id)
    if bundle is None:
        raise ApiError("Departure not found", status_code=404)
    return _to_search_result(bundle)


@router.post("/book", status_code=201, dependencies=[Depends(rate_limit("payment", 30, 60))])
async def book_travel(
    body: BookTravelRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    from app.services import pin_service

    await pin_service.verify_pin(db, user_id, body.pin)
    bundle = await travel_service.get_departure(db, body.departure_id)
    if bundle is not None and bundle["route"].mode == "bus":
        raise ApiError("Bus bookings are no longer offered on BukkaPay.", status_code=410)
    transaction = await travel_service.book(
        db, user_id,
        departure_id=body.departure_id, from_card_id=body.from_card_id, seat_class=body.seat_class,
        # by_alias=True so the stored metadata uses idNumber (camelCase),
        # matching what BukkaPay-Expo's purchase-detail.tsx TravelTicket
        # component reads directly off transaction.metadata.passengers[].
        passengers=[p.model_dump(by_alias=True, exclude_none=True) for p in body.passengers],
    )
    return PurchaseTransactionResponse.model_validate(transaction)


@router.post("/bookings/{purchase_transaction_id}/cancel")
async def cancel_booking(
    purchase_transaction_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    transaction = await travel_service.cancel_booking(db, user_id, purchase_transaction_id)
    # `updated_at` has an onupdate=func.now() server default, so after the
    # flush inside cancel_booking() it's marked expired — a plain attribute
    # read outside the async greenlet bridge blows up with MissingGreenlet.
    # Same fix as admin/finance.py's _wallet_card_response.
    await db.refresh(transaction)
    return PurchaseTransactionResponse.model_validate(transaction)



# ─── Flights from every provider (inventory + airline APIs) ─────────────────


@router.get("/airports")
async def search_airports(q: str | None = Query(default=None), user_id=Depends(get_current_user_id)
                          ) -> list[AirportResponse]:
    from app.reference import airports

    return [AirportResponse(iata=a.iata, name=a.name, city=a.city, country_code=a.country_code)
            for a in airports.search(q)]


@router.get("/flights/search", dependencies=[Depends(rate_limit("flight-search", 30, 60))])
async def search_flights(
    origin: str = Query(...), destination: str = Query(...), date: str = Query(...),
    adults: int = Query(default=1, ge=1, le=9), children: int = Query(default=0, ge=0, le=8),
    infants: int = Query(default=0, ge=0, le=4), cabin: str = Query(default="economy"),
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
) -> list[FlightOfferResponse]:
    offers = await flight_service.search(db, origin=origin, destination=destination, day=date, adults=adults,
                                         children=children, infants=infants, cabin=cabin)
    return [FlightOfferResponse.model_validate({**o.__dict__, "segments": [s.__dict__ for s in o.segments]})
            for o in offers]


@router.post("/flights/book", status_code=201, dependencies=[Depends(rate_limit("payment", 30, 60))])
async def book_flight(
    body: BookFlightRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    from app.services import pin_service

    await pin_service.verify_pin(db, user_id, body.pin)
    tx = await flight_service.book(
        db, user_id, offer_id=body.offer_id, from_card_id=body.from_card_id, adults=body.adults,
        children=body.children, infants=body.infants,
        travellers=[t.model_dump(by_alias=True, exclude_none=True) for t in body.travellers],
    )
    return PurchaseTransactionResponse.model_validate(tx)


@router.post("/flights/bookings/{purchase_transaction_id}/cancel")
async def cancel_flight(
    purchase_transaction_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    tx = await flight_service.cancel(db, user_id, purchase_transaction_id)
    await db.refresh(tx)
    return PurchaseTransactionResponse.model_validate(tx)
