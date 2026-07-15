from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.purchase_transaction import (
    CreatePurchaseTransactionRequest,
    PurchaseTransactionResponse,
    UpdatePurchaseTransactionRequest,
)
from app.services import purchase_transaction_service as svc

router = APIRouter(prefix="/api", tags=["purchase-transactions"])


@router.get("/purchase-transactions")
async def list_purchase_transactions(
    category: str | None = Query(default=None),
    status: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[PurchaseTransactionResponse]:
    transactions = await svc.get_transactions_by_user(
        db, user_id, category=category, status=status, start_date=start_date, end_date=end_date,
        limit=limit, offset=offset,
    )
    return [PurchaseTransactionResponse.model_validate(t) for t in transactions]


@router.get("/purchase-transactions/{transaction_id}")
async def get_purchase_transaction(
    transaction_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    transaction = await svc.get_transaction(db, transaction_id)
    if transaction is None:
        raise ApiError("Transaction not found", status_code=404)
    if transaction.user_id != user_id:
        raise ApiError("Access denied", status_code=403)
    return PurchaseTransactionResponse.model_validate(transaction)


@router.post("/purchase-transactions", status_code=201)
async def create_purchase_transaction(
    body: CreatePurchaseTransactionRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> PurchaseTransactionResponse:
    transaction = await svc.create_transaction(
        db, user_id, category=body.category, merchant_name=body.merchant_name, amount=body.amount,
        currency=body.currency, status=body.status, metadata=body.metadata,
    )
    return PurchaseTransactionResponse.model_validate(transaction)


@router.patch("/purchase-transactions/{transaction_id}")
async def update_purchase_transaction(
    transaction_id: str, body: UpdatePurchaseTransactionRequest, user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> PurchaseTransactionResponse:
    transaction = await svc.get_transaction(db, transaction_id)
    if transaction is None:
        raise ApiError("Transaction not found", status_code=404)
    if transaction.user_id != user_id:
        raise ApiError("Access denied", status_code=403)
    updated = await svc.update_metadata(db, transaction, body.metadata)
    return PurchaseTransactionResponse.model_validate(updated)
