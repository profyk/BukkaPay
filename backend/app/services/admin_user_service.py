import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import NotificationType
from app.models.merchant import Merchant
from app.models.misc import PaymentRequest
from app.models.payment_link import PaymentLink
from app.models.loyalty import LoyaltyReward
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.services import notification_service


async def list_users(
    db: AsyncSession, *, page: int, limit: int, q: str | None, frozen: bool | None,
) -> tuple[list[User], int]:
    stmt = select(User)
    count_stmt = select(func.count()).select_from(User)

    if q:
        pattern = f"%{q}%"
        clause = or_(User.name.ilike(pattern), User.email.ilike(pattern), User.username.ilike(pattern), User.wallet_id.ilike(pattern))
        stmt = stmt.where(clause)
        count_stmt = count_stmt.where(clause)
    if frozen is not None:
        stmt = stmt.where(User.frozen == frozen)
        count_stmt = count_stmt.where(User.frozen == frozen)

    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset((page - 1) * limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_user(db: AsyncSession, user_id: str) -> User | None:
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == user_uuid))
    return result.scalar_one_or_none()


def _row(obj) -> dict:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


async def get_user_detail(db: AsyncSession, user: User) -> dict:
    cards_result = await db.execute(
        select(WalletCard).where(WalletCard.user_id == user.id).order_by(WalletCard.created_at.desc())
    )
    cards = list(cards_result.scalars().all())

    txs_result = await db.execute(
        select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.created_at.desc()).limit(20)
    )
    recent_transactions = list(txs_result.scalars().all())

    links_result = await db.execute(
        select(PaymentLink).where(PaymentLink.sender_id == user.id).order_by(PaymentLink.created_at.desc()).limit(10)
    )
    recent_payment_links = list(links_result.scalars().all())

    loyalty_result = await db.execute(select(LoyaltyReward).where(LoyaltyReward.user_id == user.id))
    loyalty = loyalty_result.scalar_one_or_none()

    total_balance = sum((c.balance for c in cards), Decimal("0"))

    cards = [_row(c) for c in cards]
    recent_transactions = [_row(t) for t in recent_transactions]
    recent_payment_links = [_row(link) for link in recent_payment_links]
    loyalty = _row(loyalty) if loyalty is not None else None

    return {
        "user": user, "cards": cards, "recent_transactions": recent_transactions,
        "recent_payment_links": recent_payment_links, "loyalty": loyalty,
        "total_balance": f"{total_balance:.2f}",
    }


async def update_user(
    db: AsyncSession, user: User, *, name: str | None, email: str | None, phone: str | None, verified: bool | None,
) -> User:
    if name is None and email is None and phone is None and verified is None:
        raise ApiError("No fields to update")
    if name is not None:
        user.name = name
    if email is not None:
        user.email = email
    if phone is not None:
        user.phone = phone
    if verified is not None:
        user.verified = verified
    await db.flush()
    return user


async def set_frozen(db: AsyncSession, user: User, frozen: bool) -> User:
    user.frozen = frozen
    await db.flush()
    await notification_service.create_notification(
        db, user.id,
        NotificationType.ALERT if frozen else NotificationType.INFO,
        "Account Suspended" if frozen else "Account Reinstated",
        "Your account has been temporarily suspended. Please contact support for assistance."
        if frozen else "Your account has been reinstated. Welcome back!",
    )
    return user


async def set_verified(db: AsyncSession, user: User, verified: bool) -> User:
    user.verified = verified
    await db.flush()
    if verified:
        await notification_service.create_notification(
            db, user.id, NotificationType.SUCCESS, "Account Verified",
            "Congratulations! Your BukkaPay account has been verified.",
        )
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.flush()


async def notify_user(db: AsyncSession, user: User, *, type: str | None, title: str, message: str) -> None:
    await notification_service.create_notification(db, user.id, type or NotificationType.INFO, title, message)


async def broadcast(db: AsyncSession, *, type: str | None, title: str, message: str) -> int:
    result = await db.execute(select(User.id))
    user_ids = [row[0] for row in result.all()]
    for user_id in user_ids:
        await notification_service.create_notification(db, user_id, type or NotificationType.INFO, title, message)
    return len(user_ids)


async def list_kyc_pending(db: AsyncSession, *, page: int, limit: int) -> tuple[list[dict], int]:
    count_result = await db.execute(select(func.count()).select_from(User).where(User.verified.is_(False)))
    total = count_result.scalar_one()

    result = await db.execute(
        select(User).where(User.verified.is_(False)).order_by(User.created_at.desc())
        .limit(limit).offset((page - 1) * limit)
    )
    users = result.scalars().all()
    rows = [
        {
            "id": u.id, "userId": u.id, "userEmail": u.email, "fullName": u.name,
            "documentType": "national_id", "documentNumber": "", "status": "pending",
            "submittedAt": u.created_at,
        }
        for u in users
    ]
    return rows, total


async def approve_kyc(db: AsyncSession, user: User) -> User:
    user.verified = True
    await db.flush()
    await notification_service.create_notification(
        db, user.id, NotificationType.SUCCESS, "KYC Approved",
        "Your identity has been verified. Your BukkaPay account is now fully active.",
    )
    return user


async def reject_kyc(db: AsyncSession, user: User, reason: str | None) -> str:
    reason = reason or "Your submitted documents could not be verified."
    await notification_service.create_notification(db, user.id, NotificationType.ALERT, "KYC Rejected", reason)
    return reason
