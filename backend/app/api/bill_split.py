from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.bill_split import (
    BillSplitResponse,
    CreateBillSplitRequest,
    UpdateBillSplitStatusRequest,
    UpdateParticipantsRequest,
)
from app.services import bill_split_service

router = APIRouter(prefix="/api", tags=["bill-splits"])


@router.get("/bill-splits")
async def list_bill_splits(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[BillSplitResponse]:
    splits = await bill_split_service.get_bill_splits_by_user(db, user_id)
    return [BillSplitResponse.model_validate(s) for s in splits]


@router.post("/bill-splits", status_code=201)
async def create_bill_split(
    body: CreateBillSplitRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> BillSplitResponse:
    split = await bill_split_service.create_bill_split(
        db, user_id, title=body.title, total_amount=body.total_amount, participants=body.participants
    )
    return BillSplitResponse.model_validate(split)


@router.get("/bill-splits/{split_id}")
async def get_bill_split(split_id: str, db: AsyncSession = Depends(get_db)) -> BillSplitResponse:
    split = await bill_split_service.get_bill_split(db, split_id)
    if split is None:
        raise ApiError("Bill split not found", status_code=404)
    return BillSplitResponse.model_validate(split)


@router.patch("/bill-splits/{split_id}/participants")
async def update_participants(
    split_id: str, body: UpdateParticipantsRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> BillSplitResponse:
    split = await bill_split_service.get_bill_split(db, split_id)
    if split is None:
        raise ApiError("Bill split not found", status_code=404)
    if split.creator_id != user_id:
        raise ApiError("Not authorized to update this bill", status_code=403)
    updated = await bill_split_service.update_participants(db, split, body.participants)
    return BillSplitResponse.model_validate(updated)


@router.patch("/bill-splits/{split_id}/status")
async def update_status(
    split_id: str, body: UpdateBillSplitStatusRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> BillSplitResponse:
    split = await bill_split_service.get_bill_split(db, split_id)
    if split is None:
        raise ApiError("Bill split not found", status_code=404)
    if split.creator_id != user_id:
        raise ApiError("Not authorized to update this bill", status_code=403)
    updated = await bill_split_service.update_status(db, split, body.status)
    return BillSplitResponse.model_validate(updated)
