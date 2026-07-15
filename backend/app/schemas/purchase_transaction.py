from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel, JsDateTime, MoneyStr


class PurchaseTransactionResponse(CamelModel):
    id: UUID
    user_id: UUID
    category: str
    merchant_name: str
    amount: MoneyStr
    currency: str
    status: str
    reference: str
    # "metadata" collides with SQLAlchemy's reserved Base.metadata attribute,
    # so the ORM-side field is named `meta` — split the validation/serialization
    # aliases instead of a shared `alias` (which would make Pydantic read
    # getattr(obj, "metadata") during from_attributes validation and pick up
    # the table registry instead of the actual column value).
    meta: dict | None = Field(default=None, validation_alias="meta", serialization_alias="metadata")
    created_at: JsDateTime
    updated_at: JsDateTime


class CreatePurchaseTransactionRequest(CamelModel):
    category: str
    merchant_name: str
    amount: str
    currency: str | None = None
    status: str | None = None
    metadata: dict | None = None


class UpdatePurchaseTransactionRequest(CamelModel):
    metadata: dict
