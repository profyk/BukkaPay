from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalJsDateTime, OptionalMoneyStr


class ContributionGroupResponse(CamelModel):
    id: UUID
    creator_id: UUID
    title: str
    description: str | None
    category: str
    target_amount: OptionalMoneyStr
    current_amount: MoneyStr
    currency: str
    share_code: str
    is_active: bool
    end_date: OptionalJsDateTime
    created_at: JsDateTime
    status: str = ""


class ContributionResponse(CamelModel):
    id: UUID
    group_id: UUID
    contributor_id: UUID | None
    contributor_name: str
    contributor_phone: str | None
    amount: MoneyStr
    message: str | None
    is_anonymous: bool
    created_at: JsDateTime


class ContributionGroupDetailResponse(CamelModel):
    group: ContributionGroupResponse
    contributions: list[ContributionResponse]


class CreateContributionGroupRequest(CamelModel):
    title: str
    description: str | None = None
    category: str
    target_amount: str | None = None
    currency: str | None = None
    is_active: bool | None = None
    end_date: str | None = None


class CreateContributionRequest(CamelModel):
    contributor_name: str
    contributor_phone: str | None = None
    amount: str
    message: str | None = None
    is_anonymous: bool | None = None
