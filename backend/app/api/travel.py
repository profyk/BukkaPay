from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.purchase_transaction import PurchaseTransactionResponse
from app.schemas.travel import BookTravelRequest, TravelSearchResult
from app.services import travel_service

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
    if mode not in ("bus", "flight"):
        raise ApiError("mode must be 'bus' or 'flight'")
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
