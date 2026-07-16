"""Shared Pydantic conventions that make the JSON contract match the old
Node/Drizzle API exactly:

- Field names are camelCase on the wire (the JS/TS app's convention) while
  Python code stays snake_case — via alias_generator.
- Money (NUMERIC) fields serialize as decimal-string ("125.50"), not JSON
  numbers — this is what node-postgres/Drizzle always returned for
  `decimal` columns, and the mobile app's `parseFloat(...)` call sites
  depend on that string shape.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

MoneyStr = Annotated[Decimal, PlainSerializer(lambda v: f"{v:.2f}", return_type=str)]
OptionalMoneyStr = Annotated[
    Decimal | None, PlainSerializer(lambda v: f"{v:.2f}" if v is not None else None, return_type=str | None)
]
RateStr = Annotated[Decimal, PlainSerializer(lambda v: f"{v:.6f}", return_type=str)]
OptionalRateStr = Annotated[
    Decimal | None, PlainSerializer(lambda v: f"{v:.6f}" if v is not None else None, return_type=str | None)
]


def _to_js_iso(v: datetime) -> str:
    """Match `JSON.stringify(new Date(...))` / Express's res.json() output for
    Date columns: "2024-01-01T00:00:00.000Z" (millisecond precision, Z suffix)
    rather than Pydantic's default "+00:00" offset format."""
    v = v.astimezone(timezone.utc)
    return v.strftime("%Y-%m-%dT%H:%M:%S.") + f"{v.microsecond // 1000:03d}Z"


JsDateTime = Annotated[datetime, PlainSerializer(_to_js_iso, return_type=str)]
OptionalJsDateTime = Annotated[
    datetime | None, PlainSerializer(lambda v: _to_js_iso(v) if v is not None else None, return_type=str | None)
]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
