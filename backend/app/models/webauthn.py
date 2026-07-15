from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import CreatedOnlyMixin, UUIDFk, UUIDPk


class WebauthnCredential(Base, CreatedOnlyMixin):
    __tablename__ = "webauthn_credentials"

    id: Mapped[UUIDPk]
    user_id: Mapped[UUIDFk] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    credential_id: Mapped[str] = mapped_column(Text, unique=True, index=True)
    public_key: Mapped[str] = mapped_column(Text)
    counter: Mapped[int] = mapped_column(Integer, default=0)
    device_type: Mapped[str | None] = mapped_column(Text)
    transports: Mapped[str | None] = mapped_column(Text)
