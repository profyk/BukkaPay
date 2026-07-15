import time
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.integrations import stitch
from app.models.enums import NotificationType, TransactionType
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.services import notification_service

MAX_SINGLE_TRANSFER = Decimal("50000")


async def get_wallet_cards(db: AsyncSession, user_id: uuid.UUID) -> list[WalletCard]:
    result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    return list(result.scalars().all())


async def get_wallet_card(db: AsyncSession, card_id: str, user_id: uuid.UUID) -> WalletCard | None:
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        return None
    result = await db.execute(
        select(WalletCard).where(WalletCard.id == card_uuid, WalletCard.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_wallet_card(db: AsyncSession, user_id: uuid.UUID, title: str) -> WalletCard:
    if not title.strip():
        raise ApiError("Card title is required")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    card_ref = f"BUKKAPAY-{str(user_id)[:8].upper()}-{int(time.time() * 1000)}"
    issued = await stitch.issue_virtual_card(user.name if user else "Card Holder", card_ref)

    card = WalletCard(
        user_id=user_id,
        title=title.strip(),
        balance=Decimal("0.00"),
        currency="USD",
        icon="credit-card",
        color="blue",
        card_number=issued.card_number,
        expiry_date=issued.expiry_date,
        cvv=issued.cvv,
        stitch_card_id=issued.stitch_card_id,
        is_default=False,
    )
    db.add(card)
    await db.flush()

    await notification_service.create_notification(
        db,
        user_id,
        NotificationType.SUCCESS,
        "Card Issued",
        f'Your "{card.title}" virtual card has been issued successfully',
        related_id=str(card.id),
        related_type="card",
    )
    return card


async def set_default_card(db: AsyncSession, card_id: str, user_id: uuid.UUID) -> WalletCard | None:
    card = await get_wallet_card(db, card_id, user_id)
    if card is None:
        return None
    await db.execute(
        WalletCard.__table__.update().where(WalletCard.user_id == user_id).values(is_default=False)
    )
    card.is_default = True
    await db.flush()
    return card


async def update_wallet_card_balance(
    db: AsyncSession, card_id: str, user_id: uuid.UUID, balance: str
) -> WalletCard | None:
    try:
        parsed = Decimal(balance)
    except InvalidOperation as e:
        raise ApiError("Invalid balance") from e

    card = await get_wallet_card(db, card_id, user_id)
    if card is None:
        return None
    card.balance = parsed
    await db.flush()
    return card


async def get_transactions(
    db: AsyncSession, user_id: uuid.UUID, limit: int | None = None
) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_transaction(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    card_id: str | None,
    title: str,
    category: str,
    amount: str,
    type: str,
    icon: str,
) -> Transaction:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e

    transaction = Transaction(
        user_id=user_id,
        card_id=uuid.UUID(card_id) if card_id else None,
        title=title,
        category=category,
        amount=parsed_amount,
        type=type,
        icon=icon,
    )
    db.add(transaction)
    await db.flush()

    is_credit = type.lower() == "credit"
    formatted = f"R {parsed_amount:,.2f}"
    await notification_service.create_notification(
        db,
        user_id,
        NotificationType.SUCCESS if is_credit else NotificationType.INFO,
        "Money Received" if is_credit else "Payment Sent",
        f"{title} — {formatted}",
        related_id=str(transaction.id),
        related_type="transaction",
    )
    return transaction


async def _resolve_user(db: AsyncSession, identifier: str) -> User | None:
    """Recipient may be identified by wallet ID, user UUID, or username —
    tried in that order, matching the `||` chain in the old Node handler."""
    result = await db.execute(select(User).where(User.wallet_id == identifier))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    try:
        user_uuid = uuid.UUID(identifier)
    except ValueError:
        user_uuid = None
    if user_uuid is not None:
        result = await db.execute(select(User).where(User.id == user_uuid))
        user = result.scalar_one_or_none()
        if user is not None:
            return user

    result = await db.execute(select(User).where(User.username == identifier))
    return result.scalar_one_or_none()


async def transfer(
    db: AsyncSession, user_id: uuid.UUID, *, from_card_id: str, to_user_id: str, amount: str
) -> dict:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid amount")
    if parsed_amount > MAX_SINGLE_TRANSFER:
        raise ApiError("Maximum single transfer is R50,000")

    sender_card = await get_wallet_card(db, from_card_id, user_id)
    if sender_card is None:
        raise ApiError("Sender card not found", status_code=404)
    if sender_card.blocked or sender_card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    if sender_card.balance < parsed_amount:
        raise ApiError("Insufficient balance")

    sender_result = await db.execute(select(User).where(User.id == user_id))
    sender = sender_result.scalar_one_or_none()

    if to_user_id == str(user_id):
        raise ApiError("Cannot transfer to yourself")

    recipient = await _resolve_user(db, to_user_id)
    if recipient is None:
        raise ApiError("Recipient not found. Check the wallet ID and try again.", status_code=404)
    if recipient.frozen:
        raise ApiError("Recipient account is not available")

    recipient_cards = await get_wallet_cards(db, recipient.id)
    if not recipient_cards:
        raise ApiError("Recipient has no wallet to receive funds")
    recipient_card = recipient_cards[0]

    new_sender_balance = sender_card.balance - parsed_amount
    sender_card.balance = new_sender_balance
    recipient_card.balance = recipient_card.balance + parsed_amount
    await db.flush()

    recipient_display = recipient.name or recipient.username
    sender_display = (sender.name if sender else None) or (sender.username if sender else None) or "BukkaPay User"

    db.add(Transaction(
        user_id=user_id,
        card_id=sender_card.id,
        title=f"Sent to {recipient_display}",
        category="transfer",
        amount=parsed_amount,
        type=TransactionType.DEBIT,
        icon="send",
    ))
    db.add(Transaction(
        user_id=recipient.id,
        card_id=recipient_card.id,
        title=f"Received from {sender_display}",
        category="transfer",
        amount=parsed_amount,
        type=TransactionType.CREDIT,
        icon="receive",
    ))
    await db.flush()

    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "Transfer Sent",
        f"R{parsed_amount:.2f} sent to {recipient_display}", related_type="transfer",
    )
    await notification_service.create_notification(
        db, recipient.id, NotificationType.SUCCESS, "Money Received",
        f"R{parsed_amount:.2f} received from {sender_display}", related_type="transfer",
    )

    return {
        "success": True,
        "amount": f"{parsed_amount:.2f}",
        "recipient": {"name": recipient.name, "walletId": recipient.wallet_id},
        "newBalance": f"{new_sender_balance:.2f}",
    }
