from uuid import UUID

from app.schemas.base import CamelModel, JsDateTime, MoneyStr


class BillSplitResponse(CamelModel):
    id: UUID
    creator_id: UUID
    title: str
    total_amount: MoneyStr
    participants: list[dict] | None
    status: str
    created_at: JsDateTime


class CreateBillSplitRequest(CamelModel):
    title: str
    total_amount: str
    participants: list[dict] | None = None


class UpdateParticipantsRequest(CamelModel):
    participants: list[dict]


class UpdateBillSplitStatusRequest(CamelModel):
    status: str
