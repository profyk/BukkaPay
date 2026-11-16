"""Cross-border transfers — a state machine that never credits the
recipient just because the sender was debited.

1. initiate   sender wallet → fee revenue + transit:outbound (source currency)
              status sender_debited → rail instructed → status instructed
2. settle     (rail confirms) transit:outbound → clearing:<rail> in the source
              currency; clearing:<rail> → recipient wallet in the destination
              currency. status credited.
3. fail       before settlement: the debit entry is reversed (fee included).
              status reversed.
"""

import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.enums import NotificationType, TransactionType
from app.models.ledger import JournalEntry
from app.models.platform import FxQuote, PaymentCorridor, PaymentProvider, Transfer
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import compliance, limits, rails, routing


def _reference() -> str:
    return "XB-" + secrets.token_hex(6).upper()


async def initiate(
    db: AsyncSession, *, sender: User, sender_card: WalletCard, recipient: User, quote: FxQuote,
    purpose_category: str | None = None, purpose_subcategory: str | None = None,
) -> Transfer:
    from app.services import notification_service
    from app.services.wallet_service import get_or_create_currency_card

    corridor = await db.get(PaymentCorridor, quote.corridor_id)
    if sender_card.currency != quote.from_currency:
        raise ApiError(f"Choose a {quote.from_currency} wallet for this quote")
    if (recipient.residence_country or "").upper() != corridor.to_country:
        raise ApiError("The recipient isn't registered in the destination country of this quote")
    rail_provider = await routing.check_route(db, corridor, quote.source_amount)
    await limits.check(db, sender, "cross_border", quote.source_amount, currency=quote.from_currency,
                       country=corridor.from_country)

    recipient_card = await get_or_create_currency_card(db, recipient.id, quote.to_currency)
    reference = _reference()
    net = quote.source_amount - quote.fee
    debit_entry = await posting.post(
        db, kind="cross_border_debit", description=f"Cross-border transfer {reference} (debit)",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, sender_card), quote.source_amount),
            posting.credit(await ledger_accounts.fee_revenue(db, quote.from_currency), quote.fee),
            posting.credit(await ledger_accounts.transit_outbound(db, quote.from_currency), net),
        ],
        details={"transfer_reference": reference, "sender_id": str(sender.id), "quote_id": str(quote.id),
                 "fee_breakdown": quote.fee_breakdown},
    )
    transfer = Transfer(
        reference=reference, sender_id=sender.id, recipient_id=recipient.id, sender_card_id=sender_card.id,
        recipient_card_id=recipient_card.id, corridor_id=corridor.id, quote_id=quote.id,
        from_currency=quote.from_currency, to_currency=quote.to_currency, source_amount=quote.source_amount,
        fee=quote.fee, rate=quote.rate, destination_amount=quote.destination_amount, status="sender_debited",
        rail=rail_provider.code, debit_entry_id=debit_entry.id, purpose_category=purpose_category,
        purpose_subcategory=purpose_subcategory,
    )
    db.add(transfer)
    await db.flush()

    try:
        transfer.rail_reference = await rails.adapter_for(rail_provider).instruct(db, rail_provider, transfer)
        transfer.status = "instructed"
    except (rails.RailRejected, rails.RailUnavailable) as e:
        # Nothing left BukkaPay — undo the debit now, in this transaction.
        raise ApiError(f"This transfer couldn't be sent: {e}", status_code=503) from e

    db.add(Transaction(
        user_id=sender.id, card_id=sender_card.id, title=f"Sent to {recipient.name or recipient.username} "
        f"({quote.to_currency})", category="transfer", amount=quote.source_amount, type=TransactionType.DEBIT,
        icon="send", exchange_rate=quote.rate, fee_amount=quote.fee, destination_country_code=corridor.to_country,
    ))
    await notification_service.create_notification(
        db, sender.id, NotificationType.INFO, "Transfer Processing",
        f"{quote.from_currency} {quote.source_amount:.2f} to {recipient.name or recipient.username} is being "
        f"settled. They'll receive {quote.to_currency} {quote.destination_amount:.2f}.",
        related_id=str(transfer.id), related_type="transfer",
    )
    await compliance.evaluate(db, user=sender, amount=quote.source_amount, currency=quote.from_currency,
                              kind="cross_border", reference=reference)
    await db.flush()
    return transfer


async def _lock(db: AsyncSession, reference: str) -> Transfer:
    transfer = (
        await db.execute(
            select(Transfer).where(Transfer.reference == reference).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if transfer is None:
        raise ApiError("Transfer not found", status_code=404)
    return transfer


async def settle(db: AsyncSession, reference: str, *, rail_reference: str | None = None) -> Transfer:
    """Rail confirmed funds at the receiving side: book settlement and credit
    the recipient. Idempotent."""
    from app.services import notification_service

    transfer = await _lock(db, reference)
    if transfer.status == "credited":
        return transfer
    if transfer.status not in ("instructed", "sender_debited"):
        raise ApiError(f"Transfer {reference} can't be settled from status {transfer.status}", status_code=409)
    if rail_reference and transfer.rail_reference and rail_reference != transfer.rail_reference:
        raise ApiError("Rail reference mismatch", status_code=409)

    net = transfer.source_amount - transfer.fee
    recipient_card = await db.get(WalletCard, transfer.recipient_card_id)
    entry = await posting.post(
        db, kind="cross_border_settlement", description=f"Cross-border transfer {reference} settled",
        legs=[
            posting.debit(await ledger_accounts.transit_outbound(db, transfer.from_currency), net),
            posting.credit(await ledger_accounts.provider_clearing(db, transfer.rail, transfer.from_currency), net),
            posting.debit(
                await ledger_accounts.provider_clearing(db, transfer.rail, transfer.to_currency),
                transfer.destination_amount,
            ),
            posting.credit(await ledger_accounts.wallet_account(db, recipient_card), transfer.destination_amount),
        ],
        details={"transfer_reference": reference, "rail_reference": rail_reference, "rate": str(transfer.rate)},
    )
    now = datetime.now(UTC)
    transfer.status = "credited"
    transfer.settlement_entry_id = entry.id
    transfer.settled_at = transfer.settled_at or now
    transfer.credited_at = now
    sender = await db.get(User, transfer.sender_id)
    db.add(Transaction(
        user_id=transfer.recipient_id, card_id=recipient_card.id,
        title=f"Received from {sender.name if sender else 'BukkaPay user'} ({transfer.from_currency})",
        category="transfer", amount=transfer.destination_amount, type=TransactionType.CREDIT, icon="receive",
        exchange_rate=transfer.rate,
    ))
    await notification_service.create_notification(
        db, transfer.recipient_id, NotificationType.SUCCESS, "Money Received",
        f"{transfer.to_currency} {transfer.destination_amount:.2f} received", related_id=str(transfer.id),
        related_type="transfer",
    )
    await notification_service.create_notification(
        db, transfer.sender_id, NotificationType.SUCCESS, "Transfer Delivered",
        f"Your transfer {reference} was delivered", related_id=str(transfer.id), related_type="transfer",
    )
    await db.flush()
    return transfer


async def fail(db: AsyncSession, reference: str, *, reason: str) -> Transfer:
    """Rail definitively failed before settlement: refund the sender in full."""
    from app.services import notification_service

    transfer = await _lock(db, reference)
    if transfer.status in ("reversed", "failed"):
        return transfer
    if transfer.status not in ("sender_debited", "instructed"):
        raise ApiError(f"Transfer {reference} can't be failed from status {transfer.status}", status_code=409)
    debit_entry = await db.get(JournalEntry, transfer.debit_entry_id)
    reversal = await posting.reverse(db, debit_entry, description=f"Cross-border transfer {reference} reversed")
    transfer.status = "reversed"
    transfer.failure_reason = reason[:500]
    transfer.reversal_entry_id = reversal.id
    db.add(Transaction(
        user_id=transfer.sender_id, card_id=transfer.sender_card_id, title=f"Refund: transfer {reference}",
        category="refund", amount=transfer.source_amount, type=TransactionType.CREDIT, icon="refresh-cw",
    ))
    await notification_service.create_notification(
        db, transfer.sender_id, NotificationType.WARNING, "Transfer Failed",
        f"Transfer {reference} could not be delivered and {transfer.from_currency} "
        f"{transfer.source_amount:.2f} was refunded to your wallet.",
        related_id=str(transfer.id), related_type="transfer",
    )
    await db.flush()
    return transfer


async def rail_provider(db: AsyncSession, transfer: Transfer) -> PaymentProvider | None:
    return (
        await db.execute(select(PaymentProvider).where(PaymentProvider.code == transfer.rail))
    ).scalar_one_or_none()
