"""Card disputes (chargebacks).

A customer disputes a cleared payment → `opened`. Operations (or the issuer
integration) submits it to the issuer → `submitted`. The issuer's outcome
arrives as an event or an admin decision: `won` credits the money back to
the customer (from the issuer settlement account, as a chargeback), `lost`
closes it. The customer can withdraw before an outcome.

Every change goes through app.cards.states.DISPUTE (audited). A dispute is
unique per cleared transaction, and money is credited at most once.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cards import processing
from app.cards.states import DISPUTE
from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.cards import CardClearing, CardDispute, IssuedCard
from app.models.enums import NotificationType, TransactionType
from app.models.wallet import Transaction, WalletCard
from app.services import notification_service

REASONS = {"not_recognised", "not_received", "duplicate", "wrong_amount", "cancelled_subscription", "other"}
DISPUTE_WINDOW = timedelta(days=120)  # card schemes allow ~120 days from processing


async def open_dispute(db: AsyncSession, card: IssuedCard, *, clearing_id: str, reason: str,
                       details: str | None) -> CardDispute:
    import uuid

    if reason not in REASONS:
        raise ApiError(f"Reason must be one of: {', '.join(sorted(REASONS))}")
    try:
        cid = uuid.UUID(str(clearing_id))
    except ValueError as e:
        raise ApiError("Payment not found", status_code=404) from e
    clearing = (await db.execute(select(CardClearing).where(CardClearing.id == cid,
                                                            CardClearing.issued_card_id == card.id))).scalar_one_or_none()
    if clearing is None or clearing.kind != "capture":
        raise ApiError("Only card payments can be disputed", status_code=404)
    if clearing.created_at and datetime.now(UTC) - clearing.created_at > DISPUTE_WINDOW:
        raise ApiError("This payment is too old to dispute (120 days)", status_code=409)
    if (await db.execute(select(CardDispute.id).where(CardDispute.clearing_id == clearing.id))).first():
        raise ApiError("This payment is already disputed", status_code=409)
    dispute = CardDispute(issued_card_id=card.id, clearing_id=clearing.id, user_id=card.user_id, status="opened",
                          reason=reason, details=(details or "")[:2000] or None, amount=clearing.amount,
                          currency=clearing.currency)
    db.add(dispute)
    await db.flush()
    await notification_service.create_notification(
        db, card.user_id, NotificationType.INFO, "Dispute opened",
        f"We've opened a dispute for {clearing.currency} {clearing.amount} at {clearing.merchant_name or 'the merchant'}. "
        "We'll keep you updated.", related_id=str(card.id), related_type="issued_card",
    )
    return dispute


async def withdraw(db: AsyncSession, dispute: CardDispute) -> CardDispute:
    await DISPUTE.move(db, dispute, "withdrawn", actor=str(dispute.user_id), reason="customer")
    dispute.resolved_at = datetime.now(UTC)
    await db.flush()
    return dispute


async def resolve(db: AsyncSession, dispute: CardDispute, outcome: str, *, note: str | None = None,
                  issuer_dispute_id: str | None = None, actor: str = "system") -> CardDispute:
    """submitted / won / lost. `won` credits the customer exactly once."""
    if outcome not in ("submitted", "won", "lost"):
        raise ApiError("Outcome must be submitted, won or lost")
    changed = await DISPUTE.move(db, dispute, outcome, actor=actor, reason=note)
    if issuer_dispute_id:
        dispute.issuer_dispute_id = issuer_dispute_id[:120]
    if note:
        dispute.resolution_note = note[:2000]
    if not changed or outcome == "submitted":
        await db.flush()
        return dispute
    dispute.resolved_at = datetime.now(UTC)
    card = await db.get(IssuedCard, dispute.issued_card_id)
    if outcome == "won" and dispute.credit_entry_id is None:
        wallet = await db.get(WalletCard, card.wallet_card_id)
        credit = await processing._credit_back(db, wallet, dispute.amount, dispute.currency)
        entry = await posting.post(
            db, kind="card_chargeback", description=f"Chargeback won: dispute {dispute.id}",
            legs=[posting.debit(await ledger_accounts.card_issuer_payable(db, card.issuer, dispute.currency),
                                dispute.amount), *credit.legs],
            details={"dispute_id": str(dispute.id), "clearing_id": str(dispute.clearing_id)},
        )
        dispute.credit_entry_id = entry.id
        db.add(Transaction(user_id=card.user_id, card_id=wallet.id, title="Card dispute refund",
                           category="card_refund", amount=credit.amount, type=TransactionType.CREDIT, icon="card"))
    await notification_service.create_notification(
        db, card.user_id, NotificationType.SUCCESS if outcome == "won" else NotificationType.INFO,
        "Dispute won: money returned" if outcome == "won" else "Dispute closed",
        f"{dispute.currency} {dispute.amount} is back in your wallet." if outcome == "won"
        else "The merchant's evidence was upheld, so this payment stands." + (f" {note}" if note else ""),
        related_id=str(card.id), related_type="issued_card",
    )
    await db.flush()
    return dispute


async def issuer_outcome(db: AsyncSession, issuer: str, issuer_dispute_id: str, outcome: str,
                         *, note: str | None = None) -> bool:
    dispute = (
        await db.execute(select(CardDispute).join(IssuedCard, IssuedCard.id == CardDispute.issued_card_id)
                         .where(IssuedCard.issuer == issuer, CardDispute.issuer_dispute_id == issuer_dispute_id)
                         .with_for_update())
    ).scalar_one_or_none()
    if dispute is None:
        return False
    await resolve(db, dispute, outcome, note=note)
    return True
