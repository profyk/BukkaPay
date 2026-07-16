"""Shared column conventions applied to every table (redesign principles):
native UUID PKs, consistent created_at/updated_at, and Money/Currency type
aliases (NUMERIC(14,2) -> Decimal, CHAR(3) ISO-4217 -> str).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from sqlalchemy import DateTime, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

UUIDPk = Annotated[
    uuid.UUID,
    mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
]
UUIDFk = uuid.UUID
Money = Annotated[Decimal, mapped_column(Numeric(14, 2))]
CurrencyCode = Annotated[str, mapped_column(String(3))]
ExchangeRate = Annotated[Decimal, mapped_column(Numeric(12, 6))]
CreatedAt = Annotated[datetime, mapped_column(DateTime(timezone=True), server_default=func.now())]
UpdatedAt = Annotated[
    datetime,
    mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
]
# Plain nullable/required timestamp with no default — for expiry dates,
# last-login stamps, etc. that are never auto-populated by the DB.
Timestamp = Annotated[datetime, mapped_column(DateTime(timezone=True))]
OptionalTimestamp = Annotated[datetime | None, mapped_column(DateTime(timezone=True))]


class TimestampMixin:
    created_at: Mapped[CreatedAt]
    updated_at: Mapped[UpdatedAt]


class CreatedOnlyMixin:
    created_at: Mapped[CreatedAt]
