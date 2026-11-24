"""Real-time card authorization and clearing.

The issuer-processor calls ``authorize`` synchronously while the customer is
at the till or checkout (online, contactless, chip, or a phone wallet
token). We approve only if the card, wallet, customer and limits allow it
and the ledger can place a hold for the amount (plus any fee). Later
events — reversal, clearing (capture), refund — arrive as signed webhooks.

One card per customer spends from their ACTIVE wallet. Each authorization
records the wallet that funded it; when that wallet's currency differs
from the card's billing currency we convert at our FX quote (rate + spread)
and lock it on the authorization, so clearing settles at the same rate even
if the customer switches wallet in between.

Ledger (W = funding wallet currency, B = billing currency)
------
authorize   wallet(W)       → card:holds(W)       (amount + fee, converted to W)
capture     card:holds(W)   → FX pool(W) ⇢ FX pool(B) → card:payable(B), fees(B), FX revenue(B)
            (when W == B there's no FX leg)
reverse     card:holds(W)   → wallet(W)           (released part)
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

from app.cards.states import AUTHORIZATION, CARD
from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
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
# Basic fraud rules (on top of the customer's own controls and KYC limits).
VELOCITY_WINDOW = timedelta(minutes=2)
VELOCITY_MAX = 5
# Gambling, quasi-cash/crypto, money transfer: only for fully verified customers.
HIGH_RISK_MCCS = {"7995", "6051", "4829", "6540"}
HIGH_RISK_MIN_KYC = 3


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


async def _fraud(db, req: AuthorizationRequest, card: IssuedCard, user: User) -> None:
    recent = (
        await db.execute(
            select(func.count()).select_from(CardAuthorization).where(
                CardAuthorization.issued_card_id == card.id,
                CardAuthorization.created_at >= datetime.now(UTC) - VELOCITY_WINDOW,
            )
        )
    ).scalar_one()
    if recent >= VELOCITY_MAX:
        raise Decline("suspected_fraud")
    if req.merchant_mcc in HIGH_RISK_MCCS and (user.kyc_level or 0) < HIGH_RISK_MIN_KYC:
        raise Decline("merchant_category_blocked")


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
        await _fraud(db, req, card, user)
        fee = await _fee(db, req, user)
        total = posting.money(req.amount) + fee.fee
        hold, rate, spread = total, None, None
        if wallet.currency != req.currency:
            # Our FX: what the active wallet must give to cover the billing amount.
            from app.services import swap_service

            try:
                q = await swap_service.quote_for_target(db, wallet.currency, req.currency, total)
            except ApiError as e:
                raise Decline("fx_unavailable") from e
            hold, rate, spread = q.amount, q.rate, q.spread
        try:
            async with db.begin_nested():
                entry = await posting.post(
                    db, kind="card_authorization",
                    description=f"Card hold: {req.merchant_name or 'card payment'}",
                    legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), hold),
                          posting.credit(await ledger_accounts.card_holds(db, wallet.currency), hold)],
                    details={"issued_card_id": str(card.id), "authorization": req.issuer_authorization_id,
                             "billing": f"{req.currency} {total}", "fx_rate": str(rate) if rate else None},
                )
        except posting.InsufficientFunds as e:
            raise Decline("insufficient_funds") from e
        days = LONG_HOLD_DAYS if req.merchant_mcc in LONG_HOLD_MCCS else HOLD_DAYS
        auth.status = "approved"
        auth.fee = fee.fee
        auth.fee_breakdown = fee.breakdown or None
        auth.held_amount = hold
        auth.wallet_amount = hold
        auth.fx_rate = rate
        auth.fx_spread = spread
        auth.hold_entry_id = entry.id
        auth.hold_expires_at = datetime.now(UTC) + timedelta(days=days)
    except Decline as d:
        auth.status = "declined"
        auth.decline_reason = d.reason
    auth.wallet_card_id = wallet.id
    auth.wallet_currency = wallet.currency
    db.add(auth)
    await db.flush()
    if auth.status == "declined" and auth.decline_reason in ("insufficient_funds", "card_frozen"):
        await notification_service.create_notification(
            db, card.user_id, NotificationType.WARNING, "Card payment declined",
            f"{req.currency} {auth.amount} at {req.merchant_name or 'a merchant'} was declined: "
            + ("not enough balance." if auth.decline_reason == "insufficient_funds"
               else "your wallet is empty. Top up to use your card." if card.frozen_reason == "no_funds"
               else "your card is frozen."),
            related_id=str(card.id), related_type="issued_card",
        )
    elif auth.status == "approved":
        where = req.merchant_name or "a merchant"
        how = {"wallet_token": "with your phone", "contactless": "by tap", "online": "online"}.get(req.channel, "")
        await notification_service.create_notification(
            db, card.user_id, NotificationType.INFO, f"{req.currency} {auth.amount} at {where}",
            f"Card •••• {card.last4 or ''} paid {how}. Not you? Freeze the card in BukkaPay now.".replace("  ", " "),
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


async def _funding_wallet(db, auth: CardAuthorization) -> WalletCard:
    if auth.wallet_card_id is not None:
        return await db.get(WalletCard, auth.wallet_card_id)
    card = await db.get(IssuedCard, auth.issued_card_id)  # authorizations made before wallets were recorded
    return await db.get(WalletCard, card.wallet_card_id)


def _hold_currency(auth: CardAuthorization) -> str:
    return auth.wallet_currency or auth.currency


async def _release(db, auth: CardAuthorization, amount: Decimal, *, kind: str, description: str) -> None:
    """Give `amount` of the hold (in the funding wallet's currency) back."""
    wallet = await _funding_wallet(db, auth)
    await posting.post(
        db, kind=kind, description=description,
        legs=[posting.debit(await ledger_accounts.card_holds(db, _hold_currency(auth)), amount),
              posting.credit(await ledger_accounts.wallet_account(db, wallet), amount)],
        details={"authorization_id": str(auth.id)},
    )
    auth.held_amount -= amount


async def reverse(db: AsyncSession, issuer: str, issuer_authorization_id: str, amount: Decimal | None = None) -> bool:
    """Merchant cancelled (fully, or partially with `amount`)."""
    auth = await _auth_by_issuer_id(db, issuer, issuer_authorization_id)
    if auth is None or auth.status != "approved" or auth.held_amount <= 0:
        return False
    if amount is None:
        release = auth.held_amount
    else:
        # `amount` is in the billing currency: release the same share of the hold.
        billing_total = auth.amount + auth.fee
        share = posting.money(amount) / billing_total if billing_total else Decimal(1)
        release = min(auth.held_amount, posting.money((auth.wallet_amount or auth.held_amount) * share))
    if release <= 0:
        return False
    await _release(db, auth, release, kind="card_authorization_reversal",
                   description=f"Card hold released: {auth.merchant_name or 'card payment'}")
    if auth.held_amount <= 0:
        await AUTHORIZATION.move(db, auth, "reversed", reason="merchant_reversal")
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
    wallet_id = auth.wallet_card_id if auth is not None and auth.wallet_card_id else card.wallet_card_id
    wallet = (
        await db.execute(select(WalletCard).where(WalletCard.id == wallet_id).with_for_update()
                         .execution_options(populate_existing=True))
    ).scalar_one()
    w_ccy = wallet.currency
    wallet_acct = await ledger_accounts.wallet_account(db, wallet)
    holds = await ledger_accounts.card_holds(db, w_ccy)
    payable = await ledger_accounts.card_issuer_payable(db, issuer, currency)

    held = auth.held_amount if auth is not None and auth.status == "approved" else ZERO
    # The fee was held with the authorization, pro rata to what clears.
    fee = ZERO
    if auth is not None and auth.fee > 0:
        fee = min(auth.fee, posting.money(auth.fee * amount / auth.amount)) if auth.amount else ZERO
    due_billing = amount + fee
    # What the customer owes in their wallet's currency, and our FX spread.
    fx_spread = ZERO
    if w_ccy == currency:
        due = due_billing
    elif auth is not None and auth.wallet_amount and (auth.amount + auth.fee) > 0:
        share = due_billing / (auth.amount + auth.fee)  # locked at authorization
        due = posting.money(auth.wallet_amount * share)
        fx_spread = posting.money((auth.fx_spread or ZERO) * share)
    else:
        from app.services import swap_service

        q = await swap_service.quote_for_target(db, w_ccy, currency, due_billing)  # force post: today's rate
        due, fx_spread = q.amount, q.spread
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
        legs.append(posting.debit(await ledger_accounts.card_overdraft(db, w_ccy), shortfall))
    if w_ccy != currency:
        # Bridge W → B through the FX pools; our spread is FX revenue in B.
        legs.append(posting.credit(await chart.sys_account(db, "SYS_FX_POOL", w_ccy), due))
        legs.append(posting.debit(await chart.sys_account(db, "SYS_FX_POOL", currency), due_billing + fx_spread))
        if fx_spread > 0:
            legs.append(posting.credit(await chart.sys_account(db, "SYS_REVENUE_FX", currency), fx_spread))
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
            await AUTHORIZATION.move(db, auth, "captured", reason="cleared")
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
        amount=due, type=TransactionType.DEBIT, icon="card", fee_amount=fee or None,
    ))
    if shortfall > 0:
        card.overdraft_outstanding += shortfall
    if shortfall > 0 and card.status == "active":
        from app.cards import issuers

        await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "frozen")
        await CARD.move(db, card, "frozen", reason="overdraft")
        card.frozen_reason = "overdraft"
        await notification_service.create_notification(
            db, card.user_id, NotificationType.ALERT, "Card payment exceeded your balance",
            f"A card payment cleared for more than your balance. {w_ccy} {shortfall} is owed; "
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
    credit = await _credit_back(db, wallet, amount, currency)
    entry = await posting.post(
        db, kind="card_refund", description=f"Card refund: {merchant_name or 'merchant'}",
        legs=[posting.debit(await ledger_accounts.card_issuer_payable(db, issuer, currency), amount),
              *credit.legs],
        details={"issued_card_id": str(card.id), "issuer_transaction_id": issuer_transaction_id},
    )
    clearing = CardClearing(
        issued_card_id=card.id, issuer=issuer, issuer_transaction_id=issuer_transaction_id, kind="refund",
        currency=currency, amount=amount, fee=ZERO, shortfall=ZERO, merchant_name=merchant_name,
        journal_entry_id=entry.id,
    )
    db.add(clearing)
    db.add(Transaction(user_id=card.user_id, card_id=wallet.id, title=f"Card refund: {merchant_name or 'merchant'}",
                       category="card_refund", amount=credit.amount, type=TransactionType.CREDIT, icon="card"))
    await db.flush()
    return clearing


@dataclass
class _Credit:
    legs: list
    amount: Decimal  # credited to the wallet, in its currency


async def _credit_back(db, wallet: WalletCard, amount: Decimal, currency: str) -> _Credit:
    """Legs that pay `amount` of `currency` (already debited by the caller)
    into `wallet`, converting at the mid rate with no spread: money coming
    back to a customer is never charged a conversion margin."""
    acct = await ledger_accounts.wallet_account(db, wallet)
    if wallet.currency == currency:
        return _Credit([posting.credit(acct, amount)], amount)
    from app.services import swap_service

    q = await swap_service.quote(db, currency, wallet.currency, amount)
    return _Credit([
        posting.credit(await chart.sys_account(db, "SYS_FX_POOL", currency), amount),
        posting.debit(await chart.sys_account(db, "SYS_FX_POOL", wallet.currency), q.gross),
        posting.credit(acct, q.gross),
    ], q.gross)


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
        await AUTHORIZATION.move(db, auth, "expired", reason="hold_expired")
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
                  posting.credit(await ledger_accounts.card_overdraft(db, wallet.currency), take)],
            details={"issued_card_id": str(card.id)},
        )
        db.add(Transaction(user_id=card.user_id, card_id=wallet.id, title="Card overdraft repayment",
                           category="card_payment", amount=take, type=TransactionType.DEBIT, icon="card"))
        card.overdraft_outstanding -= take
        if card.overdraft_outstanding <= 0 and card.status == "frozen" and card.frozen_reason == "overdraft":
            await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "active")
            await CARD.move(db, card, "active", reason="overdraft_repaid")
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
