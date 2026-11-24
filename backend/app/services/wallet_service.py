import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.enums import (
    NotificationType,
    TransactionType,
    TransferPurpose,
    TransferZone,
)
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import compliance, fees, limits
from app.network import countries as country_service
from app.reference import currencies
from app.services import notification_service

MAX_WALLETS_PER_USER = 10


async def get_wallet_cards(db: AsyncSession, user_id: uuid.UUID) -> list[WalletCard]:
    result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    return list(result.scalars().all())


async def get_or_create_currency_card(db: AsyncSession, user_id: uuid.UUID, currency: str) -> WalletCard:
    """The user's wallet in a given currency, creating one the first time
    they need it (e.g. receiving their first transfer in a new currency)."""
    cards = await get_wallet_cards(db, user_id)
    for card in cards:
        if card.currency == currency:
            return card
    # Auto-issued on receipt, so the recipient is never charged for it.
    return await create_wallet_card(db, user_id, f"{currency} Wallet", currency=currency, charge_fee=False)


async def get_wallet_card(db: AsyncSession, card_id: str, user_id: uuid.UUID) -> WalletCard | None:
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        return None
    result = await db.execute(
        select(WalletCard).where(WalletCard.id == card_uuid, WalletCard.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_wallet_card(
    db: AsyncSession, user_id: uuid.UUID, title: str, currency: str = "ZAR", *, charge_fee: bool = True,
) -> WalletCard:
    """A new wallet, which gets its own Visa card. Every wallet beyond the free
    signup one costs the admin-configured "card_issuance" fee, paid from the
    customer's default wallet (a new wallet is empty). The fee is only taken
    when a card issuer is actually connected for this currency, so nobody
    pays for a card that can't be issued."""
    from app.cards import issuers
    from app.cards import service as card_service

    if not title.strip():
        raise ApiError("Card title is required")
    await currencies.require_wallet_currency(db, currency)

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)
    existing = await get_wallet_cards(db, user_id)
    if len(existing) >= MAX_WALLETS_PER_USER:
        raise ApiError(f"You can hold at most {MAX_WALLETS_PER_USER} wallets")

    try:
        card_available = issuers.configured().supports_currency(currency)
    except issuers.IssuerUnavailable:
        card_available = False
    paying = None
    fee = None
    if charge_fee and card_available:
        paying = next((c for c in existing if c.is_default), None) or next(
            (c for c in existing if c.currency == currency), None
        )
        if paying is not None:
            fee = await fees.compute(db, "card_issuance", Decimal("0"), currency=paying.currency,
                                     country=user.residence_country)
            if fee.fee > 0 and paying.balance < fee.fee:
                raise ApiError(
                    f"Insufficient balance to cover the {fee.fee} {paying.currency} card issuance fee"
                )

    wallet = WalletCard(
        user_id=user_id,
        title=title.strip(),
        balance=Decimal("0.00"),
        currency=currency,
        icon="credit-card",
        color="blue",
        is_default=False,
    )
    db.add(wallet)
    await db.flush()
    if paying is not None and fee is not None and fee.fee > 0:
        await posting.post(
            db, kind="card_issuance_fee", description=f"Card issuance fee for wallet {wallet.id}",
            legs=[posting.debit(await ledger_accounts.wallet_account(db, paying), fee.fee),
                  posting.credit(await ledger_accounts.fee_revenue(db, paying.currency), fee.fee)],
            details={"new_wallet_id": str(wallet.id), "fee_breakdown": fee.breakdown},
        )
        db.add(Transaction(user_id=user_id, card_id=paying.id, title=f'Card issuance fee ("{wallet.title}")',
                           category="card_fee", amount=fee.fee, type=TransactionType.DEBIT, icon="card"))
    # The Visa card itself is issued asynchronously (outbox → issuer).
    await card_service.request_card(db, wallet)
    await notification_service.create_notification(
        db, user_id, NotificationType.SUCCESS, "Wallet created",
        f'Your {currency} wallet "{wallet.title}" is ready. Its Visa card is on the way.',
        related_id=str(wallet.id), related_type="card",
    )
    return wallet


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


MAX_TRANSACTIONS_PAGE_SIZE = 100


async def get_transactions(
    db: AsyncSession, user_id: uuid.UUID, limit: int | None = None
) -> list[Transaction]:
    stmt = (
        select(Transaction)
        .where(Transaction.user_id == user_id, Transaction.deleted_at.is_(None))
        .order_by(Transaction.created_at.desc())
        .limit(min(limit, MAX_TRANSACTIONS_PAGE_SIZE) if limit else MAX_TRANSACTIONS_PAGE_SIZE)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def quote_local(db: AsyncSession, user: User, currency: str, amount: str) -> dict:
    """Fee preview for a same-currency (domestic) send."""
    parsed_amount = posting.parse_amount(amount)
    fee = await fees.compute(db, "p2p", parsed_amount, currency=currency, country=user.residence_country)
    if fee.fee >= parsed_amount:
        raise ApiError("Amount is too small to cover the transfer fee")
    return {
        "source_amount": parsed_amount,
        "exchange_rate": Decimal("1.000000"),
        "fee": fee.fee,
        "destination_amount": parsed_amount - fee.fee,
        "fee_breakdown": fee.breakdown,
    }


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


async def lookup_recipient(db: AsyncSession, identifier: str) -> User | None:
    """Public-facing counterpart to `_resolve_user`, used by the QR/scan-to-pay
    flow so a payer sees the real recipient's name/avatar before confirming a
    transfer, instead of the raw scanned wallet ID string."""
    return await _resolve_user(db, identifier)


def _check_card_usable(card: WalletCard) -> None:
    if card.blocked or card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    if card.frozen:
        raise ApiError("This card is frozen", status_code=403)


async def move_between_own(db: AsyncSession, user_id: uuid.UUID, *, from_card_id: str, to_card_id: str,
                           amount: str) -> dict:
    """Move money between two of the customer's own wallets in the same
    currency: instant and free (it never leaves BukkaPay). Different
    currencies go through a swap (app.services.swap_service)."""
    from app.ledger import funds

    if from_card_id == to_card_id:
        raise ApiError("Choose two different wallets")
    source = await get_wallet_card(db, from_card_id, user_id)
    target = await get_wallet_card(db, to_card_id, user_id)
    if source is None or target is None:
        raise ApiError("Wallet not found", status_code=404)
    _check_card_usable(source)
    _check_card_usable(target)
    if source.currency != target.currency:
        raise ApiError(f"These wallets hold different currencies ({source.currency} → {target.currency}). "
                       "Use Swap to convert.", status_code=409)
    parsed = posting.parse_amount(amount)
    await funds.require(db, source, parsed, what="move money")
    entry = await posting.post(
        db, kind="own_wallet_move", description=f"Move {source.currency} {parsed} between own wallets",
        legs=[posting.debit(await ledger_accounts.wallet_account(db, source), parsed),
              posting.credit(await ledger_accounts.wallet_account(db, target), parsed)],
        details={"user_id": str(user_id), "from_card_id": str(source.id), "to_card_id": str(target.id)},
    )
    db.add(Transaction(user_id=user_id, card_id=source.id, title=f"Moved to {target.title}", category="move",
                       amount=parsed, type=TransactionType.DEBIT, icon="swap-horizontal"))
    db.add(Transaction(user_id=user_id, card_id=target.id, title=f"Moved from {source.title}", category="move",
                       amount=parsed, type=TransactionType.CREDIT, icon="swap-horizontal"))
    await db.flush()
    return {"success": True, "amount": f"{parsed:.2f}", "currency": source.currency, "reference": entry.reference,
            "fromBalance": f"{source.balance:.2f}", "toBalance": f"{target.balance:.2f}"}


async def send_money(
    db: AsyncSession, user_id: uuid.UUID, *, from_card_id: str, to_user_id: str, amount: str,
    purpose_category: str | None = None, purpose_subcategory: str | None = None,
) -> dict:
    """Domestic P2P: same currency, booked instantly on the ledger. Anything
    crossing a currency or border goes through a quoted cross-border
    transfer (app.network.transfers) instead."""
    sender_card = await get_wallet_card(db, from_card_id, user_id)
    if sender_card is None:
        raise ApiError("Sender card not found", status_code=404)
    _check_card_usable(sender_card)
    sender = await db.get(User, user_id)
    if sender.frozen:
        raise ApiError("Your account is restricted", status_code=403)
    await country_service.require_operating(db, sender.residence_country)

    recipient = await _resolve_user(db, to_user_id)
    if recipient is None:
        raise ApiError("Recipient not found. Check the wallet ID and try again.", status_code=404)
    if recipient.id == user_id:
        raise ApiError("Cannot transfer to yourself")
    if recipient.frozen:
        raise ApiError("Recipient account is not available")

    currency = sender_card.currency
    parsed_amount = posting.parse_amount(amount)
    await limits.check(db, sender, "p2p", parsed_amount, currency=currency, country=sender.residence_country)
    fee = await fees.compute(db, "p2p", parsed_amount, currency=currency, country=sender.residence_country)
    if fee.fee >= parsed_amount:
        raise ApiError("Amount is too small to cover the transfer fee")
    destination_amount = parsed_amount - fee.fee
    from app.ledger import funds

    await funds.require(db, sender_card, parsed_amount, what="send money")

    recipient_card = await get_or_create_currency_card(db, recipient.id, currency)
    entry = await posting.post(
        db, kind="p2p_transfer", description=f"Transfer {currency} {parsed_amount} to {recipient.wallet_id}",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, sender_card), parsed_amount),
            posting.credit(await ledger_accounts.fee_revenue(db, currency), fee.fee),
            posting.credit(await ledger_accounts.wallet_account(db, recipient_card), destination_amount),
        ],
        details={
            "sender_id": str(user_id), "recipient_id": str(recipient.id), "amount": str(parsed_amount),
            "currency": currency, "fee": str(fee.fee), "fee_breakdown": fee.breakdown,
            "destination_amount": str(destination_amount),
        },
    )

    recipient_display = recipient.name or recipient.username
    sender_display = sender.name or sender.username or "BukkaPay User"
    purpose_enum = TransferPurpose(purpose_category) if purpose_category else None
    for txn in (
        Transaction(
            user_id=user_id, card_id=sender_card.id, title=f"Sent to {recipient_display}", category="transfer",
            amount=parsed_amount, type=TransactionType.DEBIT, icon="send", fee_amount=fee.fee,
            purpose_category=purpose_enum, purpose_subcategory=purpose_subcategory,
            destination_zone=TransferZone.LOCAL,
        ),
        Transaction(
            user_id=recipient.id, card_id=recipient_card.id, title=f"Received from {sender_display}",
            category="transfer", amount=destination_amount, type=TransactionType.CREDIT, icon="receive",
            purpose_category=purpose_enum, purpose_subcategory=purpose_subcategory,
            destination_zone=TransferZone.LOCAL,
        ),
    ):
        db.add(txn)
    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "Transfer Sent",
        f"{currency} {parsed_amount:.2f} sent to {recipient_display}", related_type="transfer",
    )
    await notification_service.create_notification(
        db, recipient.id, NotificationType.SUCCESS, "Money Received",
        f"{currency} {destination_amount:.2f} received from {sender_display}", related_type="transfer",
    )
    await compliance.evaluate(db, user=sender, amount=parsed_amount, currency=currency, kind="p2p",
                              reference=entry.reference, recipient=recipient)
    await db.flush()
    return {
        "success": True,
        "sourceAmount": f"{parsed_amount:.2f}",
        "sourceCurrency": currency,
        "fee": f"{fee.fee:.2f}",
        "exchangeRate": "1.000000",
        "destinationAmount": f"{destination_amount:.2f}",
        "destinationCurrency": currency,
        "recipient": {"name": recipient.name, "walletId": recipient.wallet_id},
        "newBalance": f"{sender_card.balance:.2f}",
        "destinationZone": TransferZone.LOCAL.value,
        "reference": entry.reference,
        "status": "completed",
    }
