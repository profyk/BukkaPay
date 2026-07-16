import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.payment_link import PaymentLink
from app.models.user import User
from app.models.wallet import CurrencyCorridor, InternationalTransfer, Transaction, WalletCard


async def list_transactions(
    db: AsyncSession, *, page: int, limit: int, user_id: str | None,
) -> tuple[list[tuple[Transaction, User]], int]:
    stmt = select(Transaction, User).join(User, Transaction.user_id == User.id)
    if user_id:
        try:
            stmt = stmt.where(Transaction.user_id == uuid.UUID(user_id))
        except ValueError:
            pass
    stmt = stmt.order_by(Transaction.created_at.desc()).limit(limit).offset((page - 1) * limit)
    rows = (await db.execute(stmt)).all()

    total = (await db.execute(select(func.count()).select_from(Transaction))).scalar_one()
    return rows, total


async def flag_transaction(transaction_id: str) -> dict:
    # No-op that acknowledges the flag intent, matching the Node handler
    # exactly (there is no status column on transactions to persist this).
    return {"success": True, "id": transaction_id, "flagged": True}


async def delete_transaction(db: AsyncSession, transaction_id: str) -> None:
    try:
        transaction_uuid = uuid.UUID(transaction_id)
    except ValueError:
        return
    result = await db.execute(select(Transaction).where(Transaction.id == transaction_uuid))
    transaction = result.scalar_one_or_none()
    if transaction is not None:
        await db.delete(transaction)
        await db.flush()


async def list_wallets(
    db: AsyncSession, *, page: int, limit: int, user_id: str | None,
) -> tuple[list[tuple[WalletCard, User]], int]:
    stmt = select(WalletCard, User).join(User, WalletCard.user_id == User.id)
    if user_id:
        try:
            stmt = stmt.where(WalletCard.user_id == uuid.UUID(user_id))
        except ValueError:
            pass
    stmt = stmt.order_by(WalletCard.created_at.desc()).limit(limit).offset((page - 1) * limit)
    rows = (await db.execute(stmt)).all()

    total = (await db.execute(select(func.count()).select_from(WalletCard))).scalar_one()
    return rows, total


async def get_wallet_card(db: AsyncSession, card_id: str) -> WalletCard | None:
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        return None
    result = await db.execute(select(WalletCard).where(WalletCard.id == card_uuid))
    return result.scalar_one_or_none()


async def set_card_frozen(card: WalletCard, frozen: bool) -> WalletCard:
    card.frozen = frozen
    return card


async def set_card_blocked(card: WalletCard, blocked: bool) -> WalletCard:
    card.blocked = blocked
    return card


async def set_card_flagged(card: WalletCard, flagged: bool) -> WalletCard:
    card.flagged = flagged
    return card


async def set_card_balance(card: WalletCard, balance: str) -> WalletCard:
    try:
        card.balance = Decimal(balance)
    except InvalidOperation as e:
        raise ApiError("Invalid balance") from e
    return card


async def list_payment_links(
    db: AsyncSession, *, page: int, limit: int, status: str | None,
) -> tuple[list[tuple[PaymentLink, User]], int]:
    stmt = select(PaymentLink, User).join(User, PaymentLink.sender_id == User.id)
    if status:
        stmt = stmt.where(PaymentLink.status == status)
    stmt = stmt.order_by(PaymentLink.created_at.desc()).limit(limit).offset((page - 1) * limit)
    rows = (await db.execute(stmt)).all()

    total = (await db.execute(select(func.count()).select_from(PaymentLink))).scalar_one()
    return rows, total


async def get_payment_link(db: AsyncSession, link_id: str) -> PaymentLink | None:
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        return None
    result = await db.execute(select(PaymentLink).where(PaymentLink.id == link_uuid))
    return result.scalar_one_or_none()


async def update_payment_link_status(link: PaymentLink, status: str) -> PaymentLink:
    link.status = status
    return link


async def list_corridors(db: AsyncSession) -> list[CurrencyCorridor]:
    result = await db.execute(
        select(CurrencyCorridor).order_by(CurrencyCorridor.from_currency, CurrencyCorridor.to_currency)
    )
    return list(result.scalars().all())


async def get_corridor(db: AsyncSession, corridor_id: str) -> CurrencyCorridor | None:
    try:
        corridor_uuid = uuid.UUID(corridor_id)
    except ValueError:
        return None
    result = await db.execute(select(CurrencyCorridor).where(CurrencyCorridor.id == corridor_uuid))
    return result.scalar_one_or_none()


_CORRIDOR_DECIMAL_FIELDS = {"exchange_rate", "fee_percentage", "fee_fixed", "min_amount", "max_amount"}


async def update_corridor(corridor: CurrencyCorridor, values: dict) -> CurrencyCorridor:
    for field, raw in values.items():
        if raw is None:
            continue
        if field in _CORRIDOR_DECIMAL_FIELDS:
            try:
                setattr(corridor, field, Decimal(raw))
            except InvalidOperation as e:
                raise ApiError(f"Invalid value for {field}") from e
        elif field == "is_active":
            corridor.is_active = bool(raw)
    return corridor


async def list_international_transfers(
    db: AsyncSession, *, page: int, limit: int, user_id: str | None,
) -> tuple[list[InternationalTransfer], dict[uuid.UUID, User], int]:
    stmt = select(InternationalTransfer)
    if user_id:
        try:
            user_uuid = uuid.UUID(user_id)
            stmt = stmt.where(
                (InternationalTransfer.sender_id == user_uuid) | (InternationalTransfer.recipient_id == user_uuid)
            )
        except ValueError:
            pass
    stmt = stmt.order_by(InternationalTransfer.created_at.desc()).limit(limit).offset((page - 1) * limit)
    transfers = list((await db.execute(stmt)).scalars().all())

    total = (await db.execute(select(func.count()).select_from(InternationalTransfer))).scalar_one()

    user_ids = {t.sender_id for t in transfers} | {t.recipient_id for t in transfers}
    users_by_id: dict[uuid.UUID, User] = {}
    if user_ids:
        result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_by_id = {u.id: u for u in result.scalars().all()}

    return transfers, users_by_id, total
