import time
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import countries
from app.core.errors import ApiError
from app.integrations import stitch
from app.models.enums import (
    NotificationType,
    TransactionType,
    TransferPurpose,
    TransferZone,
    WalletCurrency,
)
from app.models.user import User
from app.models.wallet import InternationalTransfer, Transaction, WalletCard
from app.services import (
    admin_platform_service,
    fx_service,
    notification_service,
    platform_wallet_service,
)


async def get_wallet_cards(db: AsyncSession, user_id: uuid.UUID) -> list[WalletCard]:
    result = await db.execute(select(WalletCard).where(WalletCard.user_id == user_id))
    return list(result.scalars().all())


async def get_or_create_currency_card(db: AsyncSession, user_id: uuid.UUID, currency: str) -> WalletCard:
    """The user's wallet in a given currency, auto-issuing one (same real
    Stitch-card path as any other card) the first time they need it — e.g.
    receiving their first international transfer in a currency they don't
    hold yet."""
    cards = await get_wallet_cards(db, user_id)
    for card in cards:
        if card.currency == currency:
            return card
    return await create_wallet_card(db, user_id, f"{currency} Wallet", currency=currency)


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
    db: AsyncSession, user_id: uuid.UUID, title: str, currency: str = "ZAR"
) -> WalletCard:
    """Any card beyond the free one auto-issued at signup (`_issue_default_card`
    in auth_service, which never calls this function) costs the admin-configured
    "virtual_card" issuance fee, paid from the user's existing default card —
    a chicken-and-egg-free rule since every user always has that first free
    card by the time they can reach this flow."""
    if not title.strip():
        raise ApiError("Card title is required")
    if currency not in WalletCurrency.__members__.values():
        raise ApiError(f"Unsupported currency: {currency}")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()

    pricing = (await admin_platform_service.get_pricing())["virtual_card"]
    issuance_fee = Decimal(str(pricing["issuance_fee"]))

    paying_card = None
    if issuance_fee > 0:
        cards = await get_wallet_cards(db, user_id)
        paying_card = next((c for c in cards if c.is_default), None) or next(
            (c for c in cards if c.currency == currency), None
        )
        if paying_card is None:
            raise ApiError("You need an existing card to pay the issuance fee from")
        if paying_card.balance < issuance_fee:
            raise ApiError(
                f"Insufficient balance to cover the {issuance_fee} {paying_card.currency} card issuance fee"
            )

    card_ref = f"BUKKAPAY-{str(user_id)[:8].upper()}-{int(time.time() * 1000)}"
    issued = await stitch.issue_virtual_card(user.name if user else "Card Holder", card_ref)

    card = WalletCard(
        user_id=user_id,
        title=title.strip(),
        balance=Decimal("0.00"),
        currency=currency,
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

    if paying_card is not None and issuance_fee > 0:
        paying_card.balance = paying_card.balance - issuance_fee
        await platform_wallet_service.credit_fee(db, paying_card.currency, issuance_fee)
        db.add(Transaction(
            user_id=user_id,
            card_id=paying_card.id,
            title=f'Card Issuance Fee ("{card.title}")',
            category="card_fee",
            amount=issuance_fee,
            type=TransactionType.DEBIT,
            icon="card",
        ))
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


async def _apply_transfer_pricing(amount: Decimal) -> tuple[Decimal, Decimal]:
    """Fee + net amount for a same-currency (local) transfer, using the
    admin-configured "transfer" bucket in Platform Pricing — same
    percentage-plus-fixed formula fx_service.quote() already uses for
    cross-currency corridors, just against the local pricing config
    instead of a CurrencyCorridor row."""
    pricing = (await admin_platform_service.get_pricing())["transfer"]
    min_amount = Decimal(str(pricing["min_amount"]))
    max_amount = Decimal(str(pricing["max_amount"]))
    if amount < min_amount:
        raise ApiError(f"Minimum transfer is {min_amount}")
    if amount > max_amount:
        raise ApiError(f"Maximum transfer is {max_amount}")

    fee_percentage = Decimal(str(pricing["fee_percentage"]))
    fee_fixed = Decimal(str(pricing["fee_fixed"]))
    fee = (amount * fee_percentage / Decimal(100) + fee_fixed).quantize(Decimal("0.01"))
    if fee >= amount:
        raise ApiError("Amount is too small to cover the transfer fee")
    return fee, amount - fee


async def quote_local(currency: str, amount: str) -> dict:
    """Same-currency counterpart to fx_service.quote() — used by the
    /transfer/quote preview when sender and destination currency match
    (Local sends, or an Africa/International pick that happens to share
    the sender's currency), so the confirm screen can show the real
    admin-configured fee instead of erroring on "no corridor for X→X"."""
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid amount")
    fee, destination_amount = await _apply_transfer_pricing(parsed_amount)
    return {
        "source_amount": parsed_amount,
        "exchange_rate": Decimal("1.000000"),
        "fee": fee,
        "destination_amount": destination_amount,
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


async def send_money(
    db: AsyncSession, user_id: uuid.UUID, *, from_card_id: str, to_user_id: str,
    amount: str, destination_country_code: str | None = None,
    purpose_category: str | None = None, purpose_subcategory: str | None = None,
) -> dict:
    """The single Send Money path — local, Africa, and International all
    flow through here. `destination_country_code` absent means Local: no
    country identity needed, the recipient's own currency is used and
    there's no FX. Present, it's resolved via `app.core.countries` (the
    backend's own trusted directory, not client-supplied currency/zone) to
    a settlement currency + `TransferZone`; if that currency differs from
    the sender's card, the existing admin-configured `CurrencyCorridor`
    supplies the rate/fee exactly as before. Same-currency sends (Local, or
    an Africa/International pick that happens to share the sender's
    currency) now apply the admin's "Transfers" Platform Pricing fee
    instead of moving money for free."""
    sender_card = await get_wallet_card(db, from_card_id, user_id)
    if sender_card is None:
        raise ApiError("Sender card not found", status_code=404)
    if sender_card.blocked or sender_card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    if sender_card.frozen:
        raise ApiError("This card is frozen", status_code=403)

    sender_result = await db.execute(select(User).where(User.id == user_id))
    sender = sender_result.scalar_one_or_none()

    recipient = await _resolve_user(db, to_user_id)
    if recipient is None:
        raise ApiError("Recipient not found. Check the wallet ID and try again.", status_code=404)
    if recipient.id == user_id:
        raise ApiError("Cannot transfer to yourself")
    if recipient.frozen:
        raise ApiError("Recipient account is not available")

    if destination_country_code:
        country = countries.get_country(destination_country_code)
        if country is None:
            raise ApiError(f"Unsupported destination country: {destination_country_code}")
        to_currency = country.currency
        zone = country.zone
    else:
        to_currency = sender_card.currency
        zone = TransferZone.LOCAL

    same_currency = sender_card.currency == to_currency
    if same_currency:
        try:
            parsed_amount = Decimal(amount)
        except InvalidOperation as e:
            raise ApiError("Invalid amount") from e
        if parsed_amount <= 0:
            raise ApiError("Invalid amount")
        fee, destination_amount = await _apply_transfer_pricing(parsed_amount)
        exchange_rate = Decimal("1.000000")
        if sender_card.balance < parsed_amount:
            raise ApiError("Insufficient balance")
    else:
        quote_result = await fx_service.quote(db, sender_card.currency, to_currency, amount)
        parsed_amount = quote_result["source_amount"]
        fee = quote_result["fee"]
        exchange_rate = quote_result["exchange_rate"]
        destination_amount = quote_result["destination_amount"]
        if sender_card.balance < parsed_amount:
            raise ApiError("Insufficient balance")

    recipient_card = await get_or_create_currency_card(db, recipient.id, to_currency)

    new_sender_balance = sender_card.balance - parsed_amount
    sender_card.balance = new_sender_balance
    recipient_card.balance = recipient_card.balance + destination_amount
    await db.flush()

    # The fee above (source currency, both branches) was deducted from the
    # sender and withheld from the recipient — credit it to the platform's
    # own wallet now so it's real, collectible revenue instead of value that
    # just vanished from the ledger.
    await platform_wallet_service.credit_fee(db, sender_card.currency, fee)

    recipient_display = recipient.name or recipient.username
    sender_display = (sender.name if sender else None) or (sender.username if sender else None) or "BukkaPay User"
    purpose_enum = TransferPurpose(purpose_category) if purpose_category else None

    sender_txn = Transaction(
        user_id=user_id,
        card_id=sender_card.id,
        title=f"Sent to {recipient_display}" + ("" if same_currency else f" ({to_currency})"),
        category="transfer",
        amount=parsed_amount,
        type=TransactionType.DEBIT,
        icon="send",
        exchange_rate=None if same_currency else exchange_rate,
        fee_amount=fee,
        purpose_category=purpose_enum,
        purpose_subcategory=purpose_subcategory,
        destination_country_code=destination_country_code,
        destination_zone=zone,
    )
    recipient_txn = Transaction(
        user_id=recipient.id,
        card_id=recipient_card.id,
        title=f"Received from {sender_display}" + ("" if same_currency else f" ({sender_card.currency})"),
        category="transfer",
        amount=destination_amount,
        type=TransactionType.CREDIT,
        icon="receive",
        exchange_rate=None if same_currency else exchange_rate,
        fee_amount=fee,
        purpose_category=purpose_enum,
        purpose_subcategory=purpose_subcategory,
        destination_country_code=destination_country_code,
        destination_zone=zone,
    )
    db.add(sender_txn)
    db.add(recipient_txn)
    await db.flush()

    if not same_currency:
        db.add(InternationalTransfer(
            sender_id=user_id,
            recipient_id=recipient.id,
            from_currency=sender_card.currency,
            to_currency=to_currency,
            source_amount=parsed_amount,
            exchange_rate_applied=exchange_rate,
            fee_amount=fee,
            destination_amount=destination_amount,
            sender_transaction_id=sender_txn.id,
            recipient_transaction_id=recipient_txn.id,
            purpose_category=purpose_enum,
            purpose_subcategory=purpose_subcategory,
            destination_country_code=destination_country_code,
            destination_zone=zone,
        ))
        await db.flush()

    await notification_service.create_notification(
        db, user_id, NotificationType.INFO, "Transfer Sent",
        f"{sender_card.currency} {parsed_amount:.2f} sent to {recipient_display}", related_type="transfer",
    )
    await notification_service.create_notification(
        db, recipient.id, NotificationType.SUCCESS, "Money Received",
        f"{to_currency} {destination_amount:.2f} received from {sender_display}", related_type="transfer",
    )

    return {
        "success": True,
        "sourceAmount": f"{parsed_amount:.2f}",
        "sourceCurrency": sender_card.currency,
        "fee": f"{fee:.2f}",
        "exchangeRate": f"{exchange_rate:.6f}",
        "destinationAmount": f"{destination_amount:.2f}",
        "destinationCurrency": to_currency,
        "recipient": {"name": recipient.name, "walletId": recipient.wallet_id},
        "newBalance": f"{new_sender_balance:.2f}",
        "destinationZone": zone.value,
    }
