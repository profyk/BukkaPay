"""Real-time card authorization and clearing.

The issuer-processor calls ``authorize`` synchronously while the customer is
at the till or checkout (online, contactless, chip, or a phone wallet
token). We approve only if the card, wallet, customer and limits allow it
and the ledger can place a hold for the amount (plus any fee). Later
events — reversal, clearing (capture), refund — arrive as signed webhooks.

Ledger
------
authorize   wallet          → card:holds          (amount + fee)
reverse     card:holds      → wallet              (released part)
capture     card:holds      → card:payable:<iss>  (cleared amount)
            card:holds      → revenue:fees        (fee)
            card:holds      → wallet              (any unused hold)
            wallet/overdraft→ card:payable        (cleared above the hold)
refund      card:payable    → wallet
expire      card:holds      → wallet              (stale, never cleared)
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.cards import CardAuthorization, CardClearing, CardWalletToken, IssuedCard
from app.models.enums import NotificationType, TransactionType
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees, limits
from app.services import notification_service

ZERO = Decimal("0.00")
HOLD_DAYS = 7
# Hotels, car rental and cruise lines pre-authorize long before clearing.
LONG_HOLD_MCCS = {"3351", "3352", "3353", "3354", "3355", "3357", "3359", "3360", "3366", "3368", "3370",
                  "3501", "3502", "3503", "3504", "3505", "3506", "3507", "3508", "3509", "3510", "4411",
                  "7011", "7512", "7513", "7519"}
LONG_HOLD_DAYS = 31
ATM_MCCS = {"6010", "6011"}


@dataclass
class AuthorizationRequest:
    issuer: str
    issuer_authorization_id: str
    issuer_card_id: str
    amount: Decimal
    currency: str
    merchant_amount: Decimal | None = None
    merchant_currency: str | None = None
    merchant_name: str | None = None
    merchant_mcc: str | None = None
    merchant_country: str | None = None
    channel: str = "online"
    issuer_token_id: str | None = None


class Decline(Exception):
    def __init__(self, reason: str):
        self.reason = reason


async def _card_by_issuer_id(db: AsyncSession, issuer: str, issuer_card_id: str, *, lock: bool) -> IssuedCard:
    stmt = select(IssuedCard).where(IssuedCard.issuer == issuer, IssuedCard.issuer_card_id == issuer_card_id)
    if lock:
        stmt = stmt.with_for_update()
    card = (await db.execute(stmt)).scalar_one_or_none()
    if card is None:
        raise ApiError("Unknown card", status_code=404)
    return card


async def _daily_spend(db: AsyncSession, card: IssuedCard) -> Decimal:
    since = datetime.now(UTC) - timedelta(days=1)
    return Decimal(
        (
            await db.execute(
                select(func.coalesce(func.sum(CardAuthorization.amount), 0)).where(
                    CardAuthorization.issued_card_id == card.id,
                    CardAuthorization.status.in_(("approved", "captured")),
                    CardAuthorization.created_at >= since,
                )
            )
        ).scalar_one()
    )


def _is_international(req: AuthorizationRequest, user: User) -> bool:
    return bool(req.merchant_country and user.residence_country
                and req.merchant_country.upper() != user.residence_country.upper())


async def _check(db, req: AuthorizationRequest, card: IssuedCard, wallet: WalletCard, user: User) -> None:
    if card.status == "frozen":
        raise Decline("card_frozen")
    if card.status != "active":
        raise Decline("card_inactive")
    if user.frozen or user.deleted_at is not None:
        raise Decline("account_restricted")
    if wallet.frozen or wallet.blocked or wallet.flagged:
        raise Decline("wallet_restricted")
    if req.currency != card.billing_currency:
        raise Decline("currency_mismatch")
    controls = card.controls or {}
    channel = "atm" if (req.merchant_mcc in ATM_MCCS) else req.channel
    toggle = {"online": "online", "recurring": "online", "contactless": "contactless",
              "wallet_token": "contactless", "chip": "chip", "magstripe": "chip", "atm": "atm"}.get(channel)
    if toggle is None:
        raise Decline("channel_not_supported")
    if not controls.get(toggle, True):
        raise Decline(f"{toggle}_disabled")
    if _is_international(req, user) and not controls.get("international", True):
        raise Decline("international_disabled")
    if req.merchant_mcc and req.merchant_mcc in set(controls.get("blocked_mccs") or []):
        raise Decline("merchant_category_blocked")
    if controls.get("per_transaction_limit") and req.amount > Decimal(controls["per_transaction_limit"]):
        raise Decline("card_limit_exceeded")
    if controls.get("daily_limit") and await _daily_spend(db, card) + req.amount > Decimal(controls["daily_limit"]):
        raise Decline("card_limit_exceeded")
    try:
        await limits.check(db, user, "card_spend", req.amount, currency=req.currency,
                           country=user.residence_country)
    except ApiError as e:
        raise Decline("limit_exceeded") from e


async def _fee(db, req: AuthorizationRequest, user: User) -> fees.FeeResult:
    if req.merchant_mcc in ATM_MCCS or req.channel == "atm":
        return await fees.compute(db, "card_atm_withdrawal", req.amount, currency=req.currency,
                                  country=user.residence_country)
    foreign = (req.merchant_currency and req.merchant_currency != req.currency) or _is_international(req, user)
    if foreign:
        return await fees.compute(db, "card_foreign_transaction", req.amount, currency=req.currency,
                                  country=user.residence_country, merchant_category=req.merchant_mcc)
    return fees.FeeResult(fee=ZERO, rule_id=None, breakdown={})


async def authorize(db: AsyncSession, req: AuthorizationRequest) -> CardAuthorization:
    """Approve or decline. Idempotent on the issuer's authorization id: a
    retried request returns the original decision and never holds twice."""
    existing = (
        await db.execute(
            select(CardAuthorization).where(CardAuthorization.issuer == req.issuer,
                                            CardAuthorization.issuer_authorization_id == req.issuer_authorization_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    card = await _card_by_issuer_id(db, req.issuer, req.issuer_card_id, lock=True)
    wallet = await db.get(WalletCard, card.wallet_card_id)
    user = await db.get(User, card.user_id)
    token_id = None
    if req.issuer_token_id:
        token = (
            await db.execute(select(CardWalletToken).where(CardWalletToken.issuer == req.issuer,
                                                           CardWalletToken.issuer_token_id == req.issuer_token_id))
        ).scalar_one_or_none()
        token_id = token.id if token else None
        # A phone wallet payment is only valid from a live token of this card:
        # removed, suspended or someone else's tokens never spend.
        token_ok = token is not None and token.issued_card_id == card.id and token.status == "active"
    else:
        token_ok = True
    auth = CardAuthorization(
        issued_card_id=card.id, issuer=req.issuer, issuer_authorization_id=req.issuer_authorization_id,
        currency=req.currency, amount=posting.money(req.amount), merchant_amount=req.merchant_amount,
        merchant_currency=req.merchant_currency, merchant_name=req.merchant_name, merchant_mcc=req.merchant_mcc,
        merchant_country=req.merchant_country, channel=req.channel, wallet_token_id=token_id,
        held_amount=ZERO, captured_amount=ZERO, fee=ZERO,
    )
    try:
        if req.amount <= 0:
            raise Decline("invalid_amount")
        if not token_ok:
            raise Decline("token_inactive")
        await _check(db, req, card, wallet, user)
        fee = await _fee(db, req, user)
        total = posting.money(req.amount) + fee.fee
        try:
            async with db.begin_nested():
                entry = await posting.post(
                    db, kind="card_authorization",
                    description=f"Card hold: {req.merchant_name or 'card payment'}",
                    legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), total),
                          posting.credit(await ledger_accounts.card_holds(db, req.currency), total)],
                    details={"issued_card_id": str(card.id), "authorization": req.issuer_authorization_id},
                )
        except posting.InsufficientFunds as e:
            raise Decline("insufficient_funds") from e
        days = LONG_HOLD_DAYS if req.merchant_mcc in LONG_HOLD_MCCS else HOLD_DAYS
        auth.status = "approved"
        auth.fee = fee.fee
        auth.fee_breakdown = fee.breakdown or None
        auth.held_amount = total
        auth.hold_entry_id = entry.id
        auth.hold_expires_at = datetime.now(UTC) + timedelta(days=days)
    except Decline as d:
        auth.status = "declined"
        auth.decline_reason = d.reason
    db.add(auth)
    await db.flush()
    if auth.status == "declined" and auth.decline_reason in ("insufficient_funds", "card_frozen"):
        await notification_service.create_notification(
            db, card.user_id, NotificationType.WARNING, "Card payment declined",
            f"{req.currency} {auth.amount} at {req.merchant_name or 'a merchant'} was declined: "
            + ("not enough balance." if auth.decline_reason == "insufficient_funds" else "your card is frozen."),
            related_id=str(card.id), related_type="issued_card",
        )
    return auth


async def _auth_by_issuer_id(db, issuer: str, issuer_authorization_id: str) -> CardAuthorization | None:
    return (
        await db.execute(
            select(CardAuthorization)
            .where(CardAuthorization.issuer == issuer,
                   CardAuthorization.issuer_authorization_id == issuer_authorization_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def _release(db, auth: CardAuthorization, amount: Decimal, *, kind: str, description: str) -> None:
    card = await db.get(IssuedCard, auth.issued_card_id)
    wallet = await db.get(WalletCard, card.wallet_card_id)
    await posting.post(
        db, kind=kind, description=description,
        legs=[posting.debit(await ledger_accounts.card_holds(db, auth.currency), amount),
              posting.credit(await ledger_accounts.wallet_account(db, wallet), amount)],
        details={"authorization_id": str(auth.id)},
    )
    auth.held_amount -= amount


async def reverse(db: AsyncSession, issuer: str, issuer_authorization_id: str, amount: Decimal | None = None) -> bool:
    """Merchant cancelled (fully, or partially with `amount`)."""
    auth = await _auth_by_issuer_id(db, issuer, issuer_authorization_id)
    if auth is None or auth.status != "approved" or auth.held_amount <= 0:
        return False
    release = auth.held_amount if amount is None else min(posting.money(amount), auth.held_amount)
    if release <= 0:
        return False
    await _release(db, auth, release, kind="card_authorization_reversal",
                   description=f"Card hold released: {auth.merchant_name or 'card payment'}")
    if auth.held_amount <= 0:
        auth.status = "reversed"
    await db.flush()
    return True


async def clear(
    db: AsyncSession, *, issuer: str, issuer_transaction_id: str, issuer_card_id: str, amount: Decimal,
    currency: str, issuer_authorization_id: str | None = None, merchant_name: str | None = None,
    final: bool = True,
) -> CardClearing:
    """Capture. Clearing is not optional — the network has already paid the
    merchant — so it books even when there was no authorization (force
    post) or it exceeds the hold; any uncovered part becomes an overdraft
    receivable and the card is frozen until it is repaid."""
    existing = (
        await db.execute(select(CardClearing).where(CardClearing.issuer == issuer,
                                                    CardClearing.issuer_transaction_id == issuer_transaction_id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    card = await _card_by_issuer_id(db, issuer, issuer_card_id, lock=True)
    if currency != card.billing_currency:
        raise ApiError("Clearing currency does not match the card", status_code=422)
    amount = posting.money(amount)
    auth = await _auth_by_issuer_id(db, issuer, issuer_authorization_id) if issuer_authorization_id else None
    if auth is not None and auth.issued_card_id != card.id:
        raise ApiError("Authorization belongs to another card", status_code=422)
    wallet = (
        await db.execute(select(WalletCard).where(WalletCard.id == card.wallet_card_id).with_for_update()
                         .execution_options(populate_existing=True))
    ).scalar_one()
    wallet_acct = await ledger_accounts.wallet_account(db, wallet)
    holds = await ledger_accounts.card_holds(db, currency)
    payable = await ledger_accounts.card_issuer_payable(db, issuer, currency)

    held = auth.held_amount if auth is not None and auth.status == "approved" else ZERO
    # The fee was held with the authorization, pro rata to what clears.
    fee = ZERO
    if auth is not None and auth.fee > 0:
        fee = min(auth.fee, posting.money(auth.fee * amount / auth.amount)) if auth.amount else ZERO
    due = amount + fee
    from_hold = min(held, due)
    # A non-final (partial) capture keeps the rest of the hold open.
    release = (held - from_hold) if final else ZERO
    remaining = due - from_hold
    from_wallet = min(wallet.balance, remaining)
    shortfall = remaining - from_wallet

    legs = []
    if held:
        legs.append(posting.debit(holds, from_hold + release))
    net_wallet = from_wallet - release
    if net_wallet > 0:
        legs.append(posting.debit(wallet_acct, net_wallet))
    elif net_wallet < 0:
        legs.append(posting.credit(wallet_acct, -net_wallet))
    if shortfall > 0:
        legs.append(posting.debit(await ledger_accounts.card_overdraft(db, currency), shortfall))
    legs.append(posting.credit(payable, amount))
    if fee > 0:
        legs.append(posting.credit(await ledger_accounts.fee_revenue(db, currency), fee))
    entry = await posting.post(
        db, kind="card_capture", description=f"Card payment: {merchant_name or (auth and auth.merchant_name) or 'card'}",
        legs=legs, details={"issued_card_id": str(card.id), "issuer_transaction_id": issuer_transaction_id,
                            "authorization_id": str(auth.id) if auth else None},
    )
    if auth is not None:
        auth.held_amount = held - from_hold - release
        auth.captured_amount += amount
        if auth.held_amount <= 0:
            auth.status = "captured"
    clearing = CardClearing(
        issued_card_id=card.id, authorization_id=auth.id if auth else None, issuer=issuer,
        issuer_transaction_id=issuer_transaction_id, kind="capture", currency=currency, amount=amount, fee=fee,
        shortfall=shortfall, merchant_name=merchant_name or (auth.merchant_name if auth else None),
        journal_entry_id=entry.id,
    )
    db.add(clearing)
    db.add(Transaction(
        user_id=card.user_id, card_id=wallet.id,
        title=f"Card: {clearing.merchant_name or 'payment'}", category="card_payment",
        amount=amount + fee, type=TransactionType.DEBIT, icon="card", fee_amount=fee or None,
    ))
    if shortfall > 0:
        card.overdraft_outstanding += shortfall
    if shortfall > 0 and card.status == "active":
        from app.cards import issuers

        await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "frozen")
        card.status = "frozen"
        card.frozen_reason = "overdraft"
        await notification_service.create_notification(
            db, card.user_id, NotificationType.ALERT, "Card payment exceeded your balance",
            f"A card payment cleared for more than your balance. {currency} {shortfall} is owed; "
            "your card is paused until you top up.",
            related_id=str(card.id), related_type="issued_card",
        )
    await db.flush()
    return clearing


async def refund(
    db: AsyncSession, *, issuer: str, issuer_transaction_id: str, issuer_card_id: str, amount: Decimal,
    currency: str, merchant_name: str | None = None,
) -> CardClearing:
    existing = (
        await db.execute(select(CardClearing).where(CardClearing.issuer == issuer,
                                                    CardClearing.issuer_transaction_id == issuer_transaction_id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    card = await _card_by_issuer_id(db, issuer, issuer_card_id, lock=True)
    if currency != card.billing_currency:
        raise ApiError("Refund currency does not match the card", status_code=422)
    amount = posting.money(amount)
    wallet = await db.get(WalletCard, card.wallet_card_id)
    entry = await posting.post(
        db, kind="card_refund", description=f"Card refund: {merchant_name or 'merchant'}",
        legs=[posting.debit(await ledger_accounts.card_issuer_payable(db, issuer, currency), amount),
              posting.credit(await ledger_accounts.wallet_account(db, wallet), amount)],
        details={"issued_card_id": str(card.id), "issuer_transaction_id": issuer_transaction_id},
    )
    clearing = CardClearing(
        issued_card_id=card.id, issuer=issuer, issuer_transaction_id=issuer_transaction_id, kind="refund",
        currency=currency, amount=amount, fee=ZERO, shortfall=ZERO, merchant_name=merchant_name,
        journal_entry_id=entry.id,
    )
    db.add(clearing)
    db.add(Transaction(user_id=card.user_id, card_id=wallet.id, title=f"Card refund: {merchant_name or 'merchant'}",
                       category="card_refund", amount=amount, type=TransactionType.CREDIT, icon="card"))
    await db.flush()
    return clearing


async def expire_stale_holds(db: AsyncSession, *, now: datetime | None = None, limit: int = 500) -> int:
    """Release holds the merchant never cleared (bounded batch per run)."""
    now = now or datetime.now(UTC)
    ids = (
        await db.execute(
            select(CardAuthorization.id)
            .where(CardAuthorization.status == "approved", CardAuthorization.hold_expires_at < now)
            .order_by(CardAuthorization.hold_expires_at).limit(limit)
        )
    ).scalars().all()
    expired = 0
    for auth_id in ids:
        auth = (
            await db.execute(select(CardAuthorization).where(CardAuthorization.id == auth_id).with_for_update())
        ).scalar_one()
        if auth.status != "approved":
            continue
        if auth.held_amount > 0:
            await _release(db, auth, auth.held_amount, kind="card_hold_expiry",
                           description=f"Expired card hold: {auth.merchant_name or 'card payment'}")
        auth.status = "expired"
        expired += 1
    await db.flush()
    return expired


async def collect_overdrafts(db: AsyncSession, *, limit: int = 500) -> int:
    """Repay card overdrafts from wallet balance as soon as money arrives;
    a card paused for an overdraft resumes once it is fully repaid."""
    from app.cards import issuers

    ids = (
        await db.execute(
            select(IssuedCard.id).join(WalletCard, WalletCard.id == IssuedCard.wallet_card_id)
            .where(IssuedCard.overdraft_outstanding > 0, WalletCard.balance > 0).limit(limit)
        )
    ).scalars().all()
    collected = 0
    for card_id in ids:
        card = (await db.execute(select(IssuedCard).where(IssuedCard.id == card_id).with_for_update())).scalar_one()
        wallet = (
            await db.execute(select(WalletCard).where(WalletCard.id == card.wallet_card_id).with_for_update()
                             .execution_options(populate_existing=True))
        ).scalar_one()
        take = min(wallet.balance, card.overdraft_outstanding)
        if take <= 0:
            continue
        await posting.post(
            db, kind="card_overdraft_repayment", description="Card overdraft repaid from balance",
            legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), take),
                  posting.credit(await ledger_accounts.card_overdraft(db, card.billing_currency), take)],
            details={"issued_card_id": str(card.id)},
        )
        db.add(Transaction(user_id=card.user_id, card_id=wallet.id, title="Card overdraft repayment",
                           category="card_payment", amount=take, type=TransactionType.DEBIT, icon="card"))
        card.overdraft_outstanding -= take
        if card.overdraft_outstanding <= 0 and card.status == "frozen" and card.frozen_reason == "overdraft":
            await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "active")
            card.status = "active"
            card.frozen_reason = None
        collected += 1
    await db.flush()
    return collected


async def token_event(db: AsyncSession, issuer: str, issuer_token_id: str, status: str) -> bool:
    token = (
        await db.execute(select(CardWalletToken).where(CardWalletToken.issuer == issuer,
                                                       CardWalletToken.issuer_token_id == issuer_token_id))
    ).scalar_one_or_none()
    if token is None or status not in ("active", "suspended", "deleted"):
        return False
    token.status = status
    if status == "deleted":
        token.deleted_at = datetime.now(UTC)
    await db.flush()
    return True
