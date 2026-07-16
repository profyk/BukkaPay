from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.kyc import KycStatusResponse, KycSubmitRequest
from app.services import kyc_service

router = APIRouter(prefix="/api/kyc", tags=["kyc"])


@router.post("/submit")
async def submit_kyc(
    body: KycSubmitRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> KycStatusResponse:
    updated = await kyc_service.submit_kyc(
        db, user, full_name=body.full_name, document_type=body.document_type, document_number=body.document_number
    )
    return KycStatusResponse.model_validate(updated)


@router.get("/status")
async def get_kyc_status(user: User = Depends(get_current_user)) -> KycStatusResponse:
    return KycStatusResponse.model_validate(user)
