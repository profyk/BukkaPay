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
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
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
from app.network import fees
from app.services import notification_service
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


MAINTENANCE_BATCH = 1000


async def charge_monthly_card_maintenance_fees(ctx: dict) -> int:
    """Admin-configured "virtual_card.monthly_fee" (Platform Pricing), charged
    once per card per rolling 30 days from issuance/last charge. Runs daily —
    the last_maintenance_fee_at check makes it idempotent regardless of how
    often the cron fires. Cards with insufficient balance are skipped (the
    balance >= 0 check constraint forbids ever going negative) and notified
    instead of charged, so a fee never silently fails to appear anywhere."""
    from app.models.cards import IssuedCard
    from app.models.user import User

    session_factory = get_session_factory()
    async with session_factory() as db:
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=30)
        # Only wallets carrying a live network-issued card are charged — the
        # fee pays for the card. The 30 days start when that card was issued.
        result = await db.execute(
            select(WalletCard)
            .join(User, WalletCard.user_id == User.id)
            .join(IssuedCard, IssuedCard.wallet_card_id == WalletCard.id)
            .where(
                User.wallet_id != PLATFORM_WALLET_ID,
                IssuedCard.status.in_(("active", "frozen")),
                IssuedCard.issuer_card_id.is_not(None),
                (WalletCard.last_maintenance_fee_at.is_(None) & (IssuedCard.created_at < cutoff))
                | (WalletCard.last_maintenance_fee_at < cutoff),
            )
            .order_by(WalletCard.id)
            .limit(MAINTENANCE_BATCH)
        )
        due_cards = list(result.scalars().all())

        charged = 0
        for card in due_cards:
            owner = await db.get(User, card.user_id)
            monthly_fee = (
                await fees.compute(db, "card_maintenance", Decimal(0), currency=card.currency,
                                   country=owner.residence_country if owner else None)
            ).fee
            if monthly_fee <= 0:
                continue
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

            try:
                async with db.begin_nested():
                    await posting.post(
                        db, kind="card_maintenance_fee",
                        description=f"Monthly maintenance fee for card {card.id}",
                        legs=[
                            posting.debit(await ledger_accounts.wallet_account(db, card), monthly_fee),
                            posting.credit(await ledger_accounts.fee_revenue(db, card.currency), monthly_fee),
                        ],
                    )
            except posting.InsufficientFunds:
                # Balance dropped between the scan and the lock — retry tomorrow.
                continue
            card.last_maintenance_fee_at = now
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


async def process_outbox(ctx: dict) -> int:
    """Deliver due outbox events (sandbox settlements, merchant webhooks)."""
    from app.network import outbox

    done = await outbox.process_due(get_session_factory())
    if done:
        log.info("outbox_processed", count=done)
    return done


async def expire_fx_quotes(ctx: dict) -> int:
    from app.models.platform import FxQuote

    async with get_session_factory()() as db:
        result = await db.execute(
            update(FxQuote).where(FxQuote.status == "open", FxQuote.expires_at <= datetime.now(UTC))
            .values(status="expired")
        )
        await db.commit()
        return result.rowcount or 0


async def daily_reconciliation(ctx: dict) -> None:
    from app.reconciliation import engine

    async with get_session_factory()() as db:
        await engine.run_ledger_integrity(db, started_by="system:daily")
        await db.commit()


async def issue_pending_cards(ctx: dict) -> int:
    """Safety net for the outbox: issue cards for wallets that have none, or
    whose owner has since passed KYC."""
    from app.cards import service as card_service

    async with get_session_factory()() as db:
        issued = await card_service.sweep_unissued(db)
        await db.commit()
    if issued:
        log.info("issue_pending_cards", issued=issued)
    return issued


async def expire_card_holds(ctx: dict) -> int:
    from app.cards import processing

    async with get_session_factory()() as db:
        n = await processing.expire_stale_holds(db)
        await db.commit()
    if n:
        log.info("expire_card_holds", expired=n)
    return n


async def collect_card_overdrafts(ctx: dict) -> int:
    from app.cards import processing

    async with get_session_factory()() as db:
        n = await processing.collect_overdrafts(db)
        await db.commit()
    if n:
        log.info("collect_card_overdrafts", collected=n)
    return n


async def release_due_escrows(ctx: dict) -> int:
    """Trade escrows that nobody disputed are released to the supplier once
    their auto-release date passes (the buyer was told the date upfront)."""
    from app.trade import service as trade

    async with get_session_factory()() as db:
        n = await trade.release_due(db)
        await db.commit()
    if n:
        log.info("release_due_escrows", released=n)
    return n
