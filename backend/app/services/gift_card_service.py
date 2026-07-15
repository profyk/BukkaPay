import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import GiftCardStatus, TransactionType
from app.models.gift_card import GiftCard
from app.models.wallet import Transaction, WalletCard


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def get_gift_cards_by_sender(db: AsyncSession, sender_id: uuid.UUID) -> list[GiftCard]:
    result = await db.execute(
        select(GiftCard).where(GiftCard.sender_id == sender_id).order_by(GiftCard.created_at.desc())
    )
    return list(result.scalars().all())


async def get_received_gift_cards(db: AsyncSession, user_id: uuid.UUID) -> list[GiftCard]:
    result = await db.execute(
        select(GiftCard).where(GiftCard.redeemed_by == user_id).order_by(GiftCard.created_at.desc())
    )
    return list(result.scalars().all())


async def get_gift_card(db: AsyncSession, card_id: str) -> GiftCard | None:
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        return None
    result = await db.execute(select(GiftCard).where(GiftCard.id == card_uuid))
    return result.scalar_one_or_none()


async def get_gift_card_by_code(db: AsyncSession, code: str) -> GiftCard | None:
    result = await db.execute(select(GiftCard).where(GiftCard.code == code))
    return result.scalar_one_or_none()


async def create_gift_card(
    db: AsyncSession, sender_id: uuid.UUID, *, recipient_email: str | None, recipient_phone: str | None,
    recipient_name: str, amount: str, currency: str | None, message: str | None, design: str | None,
) -> GiftCard:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid amount")

    code = f"GC-{secrets.token_hex(4).upper()}"
    expires_at = _now() + timedelta(days=365)

    card = GiftCard(
        sender_id=sender_id, recipient_email=recipient_email, recipient_phone=recipient_phone,
        recipient_name=recipient_name, amount=parsed_amount, currency=currency or "USD",
        message=message, code=code, design=design or "default", expires_at=expires_at,
    )
    db.add(card)
    await db.flush()
    return card


async def redeem_gift_card(db: AsyncSession, card: GiftCard, user_id: uuid.UUID) -> GiftCard:
    if card.status == GiftCardStatus.REDEEMED:
        raise ApiError("Gift card already redeemed")
    if card.expires_at is not None and _aware(card.expires_at) < _now():
        raise ApiError("Gift card has expired")

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    wallet_cards = list(cards_result.scalars().all())
    if not wallet_cards:
        raise ApiError("No wallet card found")

    primary_card = wallet_cards[0]
    primary_card.balance = primary_card.balance + card.amount

    card.status = GiftCardStatus.REDEEMED
    card.redeemed_by = user_id
    card.redeemed_at = _now()

    db.add(Transaction(
        user_id=user_id, card_id=primary_card.id, title="Gift Card Redeemed",
        category="gift", amount=card.amount, type=TransactionType.CREDIT, icon="gift",
    ))
    await db.flush()
    return card
