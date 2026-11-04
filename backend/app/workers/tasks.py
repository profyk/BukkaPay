"""ARQ background jobs.

Scope note: these are periodic *housekeeping* sweeps only — they mark
already-unusable rows as expired for accurate admin-panel/API visibility.
None of them change actual user-facing behavior, because every read path
that matters (claim verification, payment-request status checks, rent
payment link lookups) already enforces expiry at request time regardless
of what's stored in `status`. That was also true of the original Node app,
which never ran any sweep at all.

Deliberately NOT included here: autopay execution. `autopays` rows are
pure CRUD in the original app with no execution engine anywhere — building
one means inventing real product/financial decisions (what happens on
insufficient funds, retry policy, which notifications fire) that aren't
this rewrite's call to make unilaterally.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, update

from app.core.logging import log
from app.db.base import get_session_factory
from app.models.claim_payment import ClaimPayment
from app.models.enums import (
    ClaimPaymentStatus,
    LinkStatus,
    NotificationType,
    PaymentRequestStatus,
    TransactionType,
)
from app.models.misc import PaymentRequest
from app.models.rental import RentPaymentLink
from app.models.wallet import Transaction, WalletCard
from app.services import admin_platform_service, notification_service, platform_wallet_service
from app.services.platform_wallet_service import PLATFORM_WALLET_ID


async def sweep_expired_claim_payments(ctx: dict) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        now = datetime.now(UTC)
        result = await db.execute(
            update(ClaimPayment)
            .where(
                ClaimPayment.status == ClaimPaymentStatus.PENDING,
                ClaimPayment.claimed.is_(False),
                ClaimPayment.expires_at < now,
            )
            .values(status=ClaimPaymentStatus.EXPIRED)
        )
        await db.commit()
        count = result.rowcount or 0
        if count:
            log.info("sweep_expired_claim_payments", count=count)
        return count


async def sweep_expired_payment_requests(ctx: dict) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        now = datetime.now(UTC)
        result = await db.execute(
            update(PaymentRequest)
            .where(
                PaymentRequest.status == PaymentRequestStatus.PENDING,
                PaymentRequest.expires_at.is_not(None),
                PaymentRequest.expires_at < now,
            )
            .values(status=PaymentRequestStatus.EXPIRED)
        )
        await db.commit()
        count = result.rowcount or 0
        if count:
            log.info("sweep_expired_payment_requests", count=count)
        return count


async def sweep_expired_rent_payment_links(ctx: dict) -> int:
    session_factory = get_session_factory()
    async with session_factory() as db:
        now = datetime.now(UTC)
        result = await db.execute(
            update(RentPaymentLink)
            .where(
                RentPaymentLink.status == LinkStatus.PENDING,
                RentPaymentLink.expires_at.is_not(None),
                RentPaymentLink.expires_at < now,
            )
            .values(status=LinkStatus.EXPIRED)
        )
        await db.commit()
        count = result.rowcount or 0
        if count:
            log.info("sweep_expired_rent_payment_links", count=count)
        return count


async def charge_monthly_card_maintenance_fees(ctx: dict) -> int:
    """Admin-configured "virtual_card.monthly_fee" (Platform Pricing), charged
    once per card per rolling 30 days from issuance/last charge. Runs daily —
    the last_maintenance_fee_at check makes it idempotent regardless of how
    often the cron fires. Cards with insufficient balance are skipped (the
    balance >= 0 check constraint forbids ever going negative) and notified
    instead of charged, so a fee never silently fails to appear anywhere."""
    from app.models.user import User

    session_factory = get_session_factory()
    async with session_factory() as db:
        pricing = (await admin_platform_service.get_pricing())["virtual_card"]
        monthly_fee = Decimal(str(pricing["monthly_fee"]))
        if monthly_fee <= 0:
            return 0

        now = datetime.now(UTC)
        cutoff = now - timedelta(days=30)
        result = await db.execute(
            select(WalletCard)
            .join(User, WalletCard.user_id == User.id)
            .where(
                User.wallet_id != PLATFORM_WALLET_ID,
                (WalletCard.last_maintenance_fee_at.is_(None) & (WalletCard.created_at < cutoff))
                | (WalletCard.last_maintenance_fee_at < cutoff),
            )
        )
        due_cards = list(result.scalars().all())

        charged = 0
        for card in due_cards:
            if card.balance < monthly_fee:
                # Left un-timestamped on purpose: the fee is still owed, so the
                # card stays "due" and gets retried on tomorrow's run rather
                # than being let off for a full month for having low balance.
                await notification_service.create_notification(
                    db, card.user_id, NotificationType.WARNING, "Card Maintenance Fee Failed",
                    f'Insufficient balance on "{card.title}" to cover the monthly maintenance fee',
                    related_id=str(card.id), related_type="card",
                )
                continue

            card.balance = card.balance - monthly_fee
            card.last_maintenance_fee_at = now
            await platform_wallet_service.credit_fee(db, card.currency, monthly_fee)
            db.add(Transaction(
                user_id=card.user_id,
                card_id=card.id,
                title=f'Monthly Maintenance Fee ("{card.title}")',
                category="card_fee",
                amount=monthly_fee,
                type=TransactionType.DEBIT,
                icon="card",
            ))
            await notification_service.create_notification(
                db, card.user_id, NotificationType.INFO, "Card Maintenance Fee",
                f'{monthly_fee} {card.currency} monthly fee deducted from "{card.title}"',
                related_id=str(card.id), related_type="card",
            )
            charged += 1

        await db.commit()
        if due_cards:
            log.info("charge_monthly_card_maintenance_fees", charged=charged, skipped=len(due_cards) - charged)
        return charged
