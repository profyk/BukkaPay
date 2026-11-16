"""Reference data that drives the multi-currency engine. Currencies are rows,
not code: adding one is an INSERT (via the admin API), never a deploy."""

from sqlalchemy import Boolean, CheckConstraint, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Currency(Base, TimestampMixin):
    __tablename__ = "currencies"
    __table_args__ = (
        CheckConstraint("code ~ '^[A-Z]{3}$'", name="ck_currencies_code_iso"),
        CheckConstraint("decimals BETWEEN 0 AND 4", name="ck_currencies_decimals"),
        CheckConstraint("status IN ('active','inactive')", name="ck_currencies_status"),
    )

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    symbol: Mapped[str] = mapped_column(String(8))
    decimals: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String(20), default="active")
    # Whether customers may hold a wallet in this currency. Only switched on
    # once a custodian/e-money arrangement backs balances in it.
    wallet_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
