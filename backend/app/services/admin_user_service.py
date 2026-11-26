import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import KycStatus, NotificationType
from app.models.loyalty import LoyaltyReward
from app.models.payment_link import PaymentLink
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.services import notification_service


async def list_users(
    db: AsyncSession, *, page: int, limit: int, q: str | None, frozen: bool | None,
    countries: list[str] | None = None,
) -> tuple[list[User], int]:
    stmt = select(User).where(User.deleted_at.is_(None))
    count_stmt = select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    if countries is not None:  # staff country scope (app.governance.scope)
        stmt = stmt.where(User.residence_country.in_(countries))
        count_stmt = count_stmt.where(User.residence_country.in_(countries))

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

    total_balance = sum((c.balance for c in cards), Decimal(0))

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
    """Close the account (app.services.account_closure): refused while it holds
    or moves money; identity details sealed for the legal retention period;
    the live row anonymised (never a DELETE, which would cascade away the
    financial audit trail)."""
    from app.services import account_closure

    await account_closure.close(db, user, by="admin")


async def notify_user(db: AsyncSession, user: User, *, type: str | None, title: str, message: str) -> None:
    await notification_service.create_notification(db, user.id, type or NotificationType.INFO, title, message)


async def broadcast(db: AsyncSession, *, type: str | None, title: str, message: str) -> int:
    result = await db.execute(select(User.id))
    user_ids = [row[0] for row in result.all()]
    for user_id in user_ids:
        await notification_service.create_notification(db, user_id, type or NotificationType.INFO, title, message,
                                                        push=False)
    # One paged push job for everyone who opted in to product news, instead
    # of one push event per user.
    from app.network import outbox

    await outbox.enqueue(db, "push.broadcast", {"title": title, "message": message})
    return len(user_ids)


async def list_kyc(db: AsyncSession, *, page: int, limit: int,
                   countries: list[str] | None = None) -> tuple[list[dict], int]:
    has_submission = User.kyc_status != KycStatus.NOT_SUBMITTED
    if countries is not None:
        has_submission = has_submission & User.residence_country.in_(countries)
    count_result = await db.execute(select(func.count()).select_from(User).where(has_submission))
    total = count_result.scalar_one()

    result = await db.execute(
        select(User).where(has_submission).order_by(User.kyc_submitted_at.desc())
        .limit(limit).offset((page - 1) * limit)
    )
    users = result.scalars().all()
    rows = [
        {
            "id": u.id, "userId": u.id, "userEmail": u.email, "fullName": u.kyc_full_name or u.name,
            "documentType": u.kyc_document_type, "documentNumber": u.kyc_document_number,
            "status": u.kyc_status, "submittedAt": u.kyc_submitted_at,
            "reviewedAt": u.kyc_reviewed_at, "rejectionReason": u.kyc_rejection_reason,
        }
        for u in users
    ]
    return rows, total


async def approve_kyc(db: AsyncSession, user: User) -> User:
    from app.network import compliance

    # Screen before approving: a confident sanctions hit freezes the account
    # and leaves the KYC pending for the compliance case, instead of
    # activating cards and limits for a sanctioned person.
    screening = await compliance.record_screening(db, user_id=user.id)
    if screening["blocked"]:
        await db.flush()
        return user
    user.kyc_status = KycStatus.APPROVED
    user.kyc_reviewed_at = datetime.now(UTC)
    user.kyc_rejection_reason = None
    user.verified = True
    user.kyc_level = 2
    await db.flush()
    from app.cards import service as card_service

    await card_service.on_kyc_verified(db, user.id)
    await notification_service.create_notification(
        db, user.id, NotificationType.SUCCESS, "KYC Approved",
        "Your identity has been verified. Your BukkaPay account is now fully active.",
    )
    return user


async def reject_kyc(db: AsyncSession, user: User, reason: str | None) -> str:
    reason = reason or "Your submitted documents could not be verified."
    user.kyc_status = KycStatus.REJECTED
    user.kyc_reviewed_at = datetime.now(UTC)
    user.kyc_rejection_reason = reason
    await db.flush()
    await notification_service.create_notification(db, user.id, NotificationType.ALERT, "KYC Rejected", reason)
    return reason
