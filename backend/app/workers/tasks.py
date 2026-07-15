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

from datetime import UTC, datetime

from sqlalchemy import select, update

from app.core.logging import log
from app.db.base import get_session_factory
from app.models.claim_payment import ClaimPayment
from app.models.enums import ClaimPaymentStatus, LinkStatus, PaymentRequestStatus
from app.models.misc import PaymentRequest
from app.models.rental import RentPaymentLink


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
