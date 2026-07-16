from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import KycDocumentType, KycStatus
from app.models.user import User


async def submit_kyc(
    db: AsyncSession, user: User, *, full_name: str, document_type: str, document_number: str
) -> User:
    if not full_name.strip():
        raise ApiError("Full legal name is required")
    if document_type not in KycDocumentType.__members__.values():
        raise ApiError(f"Unsupported document type: {document_type}")
    if not document_number.strip():
        raise ApiError("Document number is required")
    if user.kyc_status == KycStatus.APPROVED:
        raise ApiError("Your identity is already verified")

    user.kyc_full_name = full_name.strip()
    user.kyc_document_type = document_type
    user.kyc_document_number = document_number.strip()
    user.kyc_status = KycStatus.PENDING
    user.kyc_submitted_at = datetime.now(UTC)
    user.kyc_reviewed_at = None
    user.kyc_rejection_reason = None
    await db.flush()
    return user
