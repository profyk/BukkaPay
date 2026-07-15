from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.wallet import (
    CreateCardRequest,
    CreateTransactionRequest,
    TransactionResponse,
    TransferRequest,
    TransferResponse,
    UpdateCardBalanceRequest,
    WalletCardResponse,
)
from app.services import wallet_service

router = APIRouter(prefix="/api", tags=["wallet"])


@router.get("/cards")
async def list_cards(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[WalletCardResponse]:
    cards = await wallet_service.get_wallet_cards(db, user_id)
    return [WalletCardResponse.model_validate(c) for c in cards]


@router.get("/cards/{card_id}")
async def get_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.get_wallet_card(db, card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return WalletCardResponse.model_validate(card)


@router.post("/cards", status_code=201)
async def create_card(
    body: CreateCardRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.create_wallet_card(db, user_id, body.title)
    return WalletCardResponse.model_validate(card)


@router.patch("/cards/{card_id}/set-default")
async def set_default_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.set_default_card(db, card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return WalletCardResponse.model_validate(card)


@router.patch("/cards/{card_id}/balance")
async def update_card_balance(
    card_id: str,
    body: UpdateCardBalanceRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> WalletCardResponse:
    if not body.balance:
        raise ApiError("Balance is required")
    card = await wallet_service.update_wallet_card_balance(db, card_id, user_id, body.balance)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return WalletCardResponse.model_validate(card)


@router.get("/transactions")
async def list_transactions(
    limit: int | None = Query(default=None),
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> list[TransactionResponse]:
    transactions = await wallet_service.get_transactions(db, user_id, limit)
    return [TransactionResponse.model_validate(t) for t in transactions]


@router.post("/transactions", status_code=201)
async def create_transaction(
    body: CreateTransactionRequest,
    user_id=Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> TransactionResponse:
    transaction = await wallet_service.create_transaction(
        db,
        user_id,
        card_id=body.card_id,
        title=body.title,
        category=body.category,
        amount=body.amount,
        type=body.type,
        icon=body.icon,
    )
    return TransactionResponse.model_validate(transaction)


@router.post("/transfer", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def transfer(
    body: TransferRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TransferResponse:
    if not body.from_card_id or not body.to_user_id or not body.amount:
        raise ApiError("fromCardId, toUserId, and amount are required")
    result = await wallet_service.transfer(
        db, user_id, from_card_id=body.from_card_id, to_user_id=body.to_user_id, amount=body.amount
    )
    return TransferResponse.model_validate(result)
