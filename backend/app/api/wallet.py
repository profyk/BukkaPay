from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.schemas.wallet import (
    CardFullDetailsResponse,
    CardPricingResponse,
    CreateCardRequest,
    CreateTransactionRequest,
    RecipientLookupResponse,
    RevealCardDetailsRequest,
    TransactionResponse,
    TransferQuoteRequest,
    TransferQuoteResponse,
    TransferRequest,
    TransferResponse,
    UpdateCardBalanceRequest,
    WalletCardResponse,
)
from app.services import admin_platform_service, fx_service, pin_service, wallet_service

router = APIRouter(prefix="/api", tags=["wallet"])


@router.get("/cards/pricing")
async def get_card_pricing() -> CardPricingResponse:
    pricing = (await admin_platform_service.get_pricing())["virtual_card"]
    return CardPricingResponse.model_validate({
        "issuanceFee": pricing["issuance_fee"], "monthlyFee": pricing["monthly_fee"],
    })


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


@router.post("/cards/{card_id}/reveal")
async def reveal_card_details(
    card_id: str, body: RevealCardDetailsRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> CardFullDetailsResponse:
    """The one place the real, unmasked PAN/expiry/CVV are returned — gated
    behind the transaction PIN so a stolen session token alone can't lift a
    usable card number, same as any money-moving endpoint."""
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await wallet_service.get_wallet_card(db, card_id, user_id)
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return CardFullDetailsResponse.model_validate(card)


@router.post("/cards", status_code=201)
async def create_card(
    body: CreateCardRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> WalletCardResponse:
    card = await wallet_service.create_wallet_card(db, user_id, body.title, currency=body.currency)
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


@router.get("/wallet/lookup/{identifier}")
async def lookup_recipient(
    identifier: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> RecipientLookupResponse:
    recipient = await wallet_service.lookup_recipient(db, identifier)
    if recipient is None:
        raise ApiError("No BukkaPay user found for this wallet ID", status_code=404)
    if recipient.id == user_id:
        raise ApiError("This is your own wallet ID")
    return RecipientLookupResponse.model_validate(recipient)


@router.post("/transfer", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def transfer(
    body: TransferRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TransferResponse:
    if not body.from_card_id or not body.to_user_id or not body.amount:
        raise ApiError("fromCardId, toUserId, and amount are required")
    await pin_service.verify_pin(db, user_id, body.pin)
    result = await wallet_service.send_money(
        db, user_id,
        from_card_id=body.from_card_id, to_user_id=body.to_user_id, amount=body.amount,
        destination_country_code=body.destination_country_code,
        purpose_category=body.purpose_category, purpose_subcategory=body.purpose_subcategory,
    )
    return TransferResponse.model_validate(result)


@router.post("/transfer/quote")
async def transfer_quote(
    body: TransferQuoteRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> TransferQuoteResponse:
    if body.from_currency == body.to_currency:
        result = await wallet_service.quote_local(body.from_currency, body.amount)
    else:
        result = await fx_service.quote(db, body.from_currency, body.to_currency, body.amount)
    return TransferQuoteResponse.model_validate({
        "source_amount": result["source_amount"],
        "source_currency": body.from_currency,
        "exchange_rate": result["exchange_rate"],
        "fee": result["fee"],
        "destination_amount": result["destination_amount"],
        "destination_currency": body.to_currency,
    })
