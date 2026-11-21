from datetime import datetime
from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalMoneyStr


class PassengerInput(CamelModel):
    name: str
    id_number: str | None = None
    phone: str | None = None


class TravelSearchResult(CamelModel):
    departure_id: UUID
    operator_name: str
    mode: str
    origin_code: str
    origin_city: str
    origin_country_code: str
    destination_code: str
    destination_city: str
    destination_country_code: str
    flight_number: str | None = None
    departure_at: JsDateTime
    arrival_at: JsDateTime
    price: MoneyStr
    business_price: OptionalMoneyStr = None
    currency: str
    seats_available: int


class SearchDeparturesRequest(CamelModel):
    mode: str
    origin_country_code: str | None = None
    destination_country_code: str | None = None
    date: str | None = None


class BookTravelRequest(CamelModel):
    departure_id: str
    from_card_id: str
    seat_class: str = "economy"
    passengers: list[PassengerInput]
    pin: str | None = None


# ─── Admin: operators/routes/departures ─────────────────────────────────────


class TravelOperatorResponse(CamelModel):
    id: UUID
    name: str
    mode: str
    logo_url: str | None
    is_active: bool
    created_at: JsDateTime


class CreateOperatorRequest(CamelModel):
    name: str
    mode: str
    logo_url: str | None = None


class UpdateOperatorRequest(CamelModel):
    name: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class TravelRouteResponse(CamelModel):
    id: UUID
    operator_id: UUID
    mode: str
    origin_code: str
    origin_city: str
    origin_country_code: str
    destination_code: str
    destination_city: str
    destination_country_code: str
    flight_number: str | None
    is_active: bool
    operator: TravelOperatorResponse | None = None


class CreateRouteRequest(CamelModel):
    origin_code: str
    origin_city: str
    origin_country_code: str
    destination_code: str
    destination_city: str
    destination_country_code: str
    flight_number: str | None = None


class UpdateRouteRequest(CamelModel):
    origin_code: str | None = None
    origin_city: str | None = None
    origin_country_code: str | None = None
    destination_code: str | None = None
    destination_city: str | None = None
    destination_country_code: str | None = None
    flight_number: str | None = None
    is_active: bool | None = None


class TravelDepartureResponse(CamelModel):
    id: UUID
    route_id: UUID
    departure_at: JsDateTime
    arrival_at: JsDateTime
    price: MoneyStr
    business_price: OptionalMoneyStr
    currency: str
    total_seats: int
    seats_booked: int
    is_active: bool


class CreateDepartureRequest(CamelModel):
    departure_at: datetime
    arrival_at: datetime
    price: str
    business_price: str | None = None
    currency: str = "ZAR"
    total_seats: int = 40


class UpdateDepartureRequest(CamelModel):
    departure_at: datetime | None = None
    arrival_at: datetime | None = None
    price: str | None = None
    business_price: str | None = None
    currency: str | None = None
    total_seats: int | None = None
    is_active: bool | None = None


# ─── Flights (all providers) ────────────────────────────────────────────────


class AirportResponse(CamelModel):
    iata: str
    name: str
    city: str
    country_code: str


class FlightSegmentResponse(CamelModel):
    flight_number: str
    carrier_name: str
    origin: str
    destination: str
    departing_at: JsDateTime
    arriving_at: JsDateTime


class FlightOfferResponse(CamelModel):
    id: str
    provider: str
    airline_name: str
    airline_code: str | None = None
    origin: str
    destination: str
    departing_at: JsDateTime
    arriving_at: JsDateTime
    duration_minutes: int
    stops: int
    cabin: str
    total_amount: MoneyStr
    currency: str
    passengers: int
    seats_left: int | None = None
    refundable: bool | None = None
    segments: list[FlightSegmentResponse] = []


class PassportInput(CamelModel):
    number: str
    issuing_country: str
    expires_on: str
    nationality: str | None = None


class TravellerInput(CamelModel):
    title: str
    given_name: str
    family_name: str
    born_on: str
    gender: str
    email: str
    phone: str
    document: PassportInput | None = None


class BookFlightRequest(CamelModel):
    offer_id: str
    from_card_id: str
    pin: str | None = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    travellers: list[TravellerInput]
