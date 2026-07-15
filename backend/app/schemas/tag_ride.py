from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr


class TagRideDriverResponse(CamelModel):
    id: UUID
    user_id: UUID
    vehicle_number: str
    vehicle_type: str
    is_active: bool
    total_earnings: MoneyStr
    created_at: JsDateTime
    name: str | None = None
    username: str | None = None


class RegisterDriverRequest(CamelModel):
    vehicle_number: str
    vehicle_type: str | None = None


class DriverInfoResponse(CamelModel):
    id: UUID
    vehicle_number: str
    vehicle_type: str
    is_active: bool
    name: str | None


class TagRideRideResponse(CamelModel):
    id: UUID
    passenger_id: UUID
    driver_id: UUID
    passenger_card_id: UUID | None
    driver_card_id: UUID | None
    amount: MoneyStr
    status: str
    reference: str
    created_at: JsDateTime
    passenger_name: str | None = None
    driver_name: str | None = None
    vehicle_number: str | None = None
    vehicle_type: str | None = None


class TagRidePayRequest(CamelModel):
    driver_id: str
    amount: str


class TagRidePayResponse(CamelModel):
    success: bool
    ride: TagRideRideResponse
    reference: str
    passenger_new_balance: str


class DriverRidesResponse(CamelModel):
    rides: list[TagRideRideResponse]
    today_total: str


class PassengerRidesResponse(CamelModel):
    rides: list[TagRideRideResponse]
