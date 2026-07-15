from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.db.deps import get_db
from app.schemas.gift_card import CreateGiftCardRequest, GiftCardListResponse, GiftCardResponse
from app.services import gift_card_service as svc

router = APIRouter(prefix="/api/gift-cards", tags=["gift-cards"])


@router.get("")
async def list_gift_cards(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> GiftCardListResponse:
    sent = await svc.get_gift_cards_by_sender(db, user_id)
    received = await svc.get_received_gift_cards(db, user_id)
    return GiftCardListResponse.model_validate({
        "sent": [GiftCardResponse.model_validate(c) for c in sent],
        "received": [GiftCardResponse.model_validate(c) for c in received],
    })


@router.post("", status_code=201)
async def create_gift_card(
    body: CreateGiftCardRequest, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> GiftCardResponse:
    card = await svc.create_gift_card(
        db, user_id, recipient_email=body.recipient_email, recipient_phone=body.recipient_phone,
        recipient_name=body.recipient_name, amount=body.amount, currency=body.currency,
        message=body.message, design=body.design,
    )
    return GiftCardResponse.model_validate(card)


@router.get("/{card_id}")
async def get_gift_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> GiftCardResponse:
    card = await svc.get_gift_card(db, card_id)
    if card is None:
        raise ApiError("Gift card not found", status_code=404)
    return GiftCardResponse.model_validate(card)


@router.get("/code/{code}")
async def get_gift_card_by_code(code: str, db: AsyncSession = Depends(get_db)) -> GiftCardResponse:
    card = await svc.get_gift_card_by_code(db, code)
    if card is None:
        raise ApiError("Gift card not found", status_code=404)
    return GiftCardResponse.model_validate(card)


@router.post("/{card_id}/redeem")
async def redeem_gift_card(
    card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> GiftCardResponse:
    card = await svc.get_gift_card(db, card_id)
    if card is None:
        raise ApiError("Gift card not found", status_code=404)
    updated = await svc.redeem_gift_card(db, card, user_id)
    return GiftCardResponse.model_validate(updated)
