from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime, OptionalMoneyStr


class LoyaltyRewardResponse(CamelModel):
    """Node returns the full DB row when one exists, or a 3-field stub
    {userId, totalPoints: 0, tier: "bronze"} when it doesn't — id/points
    fields are optional here to cover both shapes."""

    id: UUID | None = None
    user_id: UUID
    points_earned: int | None = None
    points_redeemed: int | None = None
    tier: str = "bronze"
    total_points: int = 0
    created_at: OptionalJsDateTime = None


class AutoPayResponse(CamelModel):
    id: UUID
    user_id: UUID
    bill_name: str
    amount: MoneyStr
    frequency: str
    next_payment_date: OptionalJsDateTime
    is_active: bool
    created_at: JsDateTime


class CreateAutoPayRequest(CamelModel):
    bill_name: str
    amount: str
    frequency: str
    next_payment_date: str | None = None
    is_active: bool | None = None


class BeneficiaryResponse(CamelModel):
    id: UUID
    user_id: UUID
    name: str
    wallet_id: str
    is_favorite: bool
    created_at: JsDateTime


class CreateBeneficiaryRequest(CamelModel):
    name: str
    wallet_id: str
    is_favorite: bool | None = None


class ChallengeResponse(CamelModel):
    id: UUID
    user_id: UUID
    title: str
    description: str | None
    target: OptionalMoneyStr
    current: MoneyStr
    reward: int
    completed: bool
    created_at: JsDateTime


class CreateChallengeRequest(CamelModel):
    title: str
    description: str | None = None
    target: str | None = None
    current: str | None = None
    reward: int | None = None
    completed: bool | None = None


class VirtualCardResponse(CamelModel):
    id: UUID
    user_id: UUID
    card_number: str
    expiry_date: str
    spending_limit: OptionalMoneyStr
    is_active: bool
    created_at: JsDateTime


class CreateVirtualCardRequest(CamelModel):
    card_number: str
    expiry_date: str
    spending_limit: str | None = None
    is_active: bool | None = None
