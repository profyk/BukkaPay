from sqlalchemy import CheckConstraint, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import BillSplitStatus
from app.models.mixins import Money, TimestampMixin, UUIDFk, UUIDPk


class BillSplit(Base, TimestampMixin):
    __tablename__ = "bill_splits"
    __table_args__ = (
        CheckConstraint("total_amount > 0", name="ck_bill_splits_total_amount_positive"),
    )

    id: Mapped[UUIDPk]
    creator_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(Text)
    total_amount: Mapped[Money]
    participants: Mapped[list | None] = mapped_column(JSONB)
    status: Mapped[BillSplitStatus] = mapped_column(
        Enum(BillSplitStatus, name="bill_split_status", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=BillSplitStatus.PENDING,
    )
