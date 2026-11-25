"""Card lifecycle: ONE Visa card per customer, spending from an "active
wallet" the customer chooses (default by country: ZA→ZAR, BW→BWP, ZW→USD).

* The first wallet is created → an outbox event asks for the card (and a
  periodic sweep catches any that were missed), so signup never waits.
* Issuers require identity verification, so a customer below KYC level 1
  gets a ``pending_kyc`` card that is issued as soon as they verify.
* Card details are never stored: reveal goes through the issuer.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cards import issuers
from app.cards.states import CARD
from app.core.errors import ApiError
from app.ledger import posting
from app.models.cards import CardWalletToken, IssuedCard, default_controls
from app.models.enums import NotificationType
from app.models.user import User
from app.models.wallet import WalletCard
from app.network import outbox
from app.services import notification_service

# Visa issuers need a verified identity: level 2 = ID document approved.
MIN_KYC_LEVEL = 2
LIVE_STATUSES = ("pending_kyc", "requested", "active", "frozen")
# Which wallet a new card spends from, by country of residence.
DEFAULT_CARD_CURRENCY = {"ZA": "ZAR", "BW": "BWP", "ZW": "USD"}


async def request_card(db: AsyncSession, wallet: WalletCard) -> None:
    """Queue card issuance when a customer gets a wallet (same transaction).
    Customers have one card, so later wallets don't ask for another."""
    if await user_card(db, wallet.user_id) is None:
        await outbox.enqueue(db, "card.issue", {"wallet_card_id": str(wallet.id)})


async def user_card(db: AsyncSession, user_id) -> IssuedCard | None:
    return (
        await db.execute(
            select(IssuedCard).where(IssuedCard.user_id == user_id, IssuedCard.status.in_(LIVE_STATUSES))
        )
    ).scalar_one_or_none()


async def default_wallet(db: AsyncSession, user: User, fallback: WalletCard | None = None) -> WalletCard | None:
    """The wallet a new card should spend from."""
    wallets = list((await db.execute(select(WalletCard).where(WalletCard.user_id == user.id)
                                     .order_by(WalletCard.created_at))).scalars())
    wanted = DEFAULT_CARD_CURRENCY.get((user.residence_country or "").upper())
    for w in wallets:
        if wanted and w.currency == wanted:
            return w
    for w in wallets:
        if w.is_default:
            return w
    return fallback or (wallets[0] if wallets else None)


async def live_card(db: AsyncSession, wallet_card_id) -> IssuedCard | None:
    return (
        await db.execute(
            select(IssuedCard).where(IssuedCard.wallet_card_id == wallet_card_id,
                                     IssuedCard.status.in_(LIVE_STATUSES))
        )
    ).scalar_one_or_none()


async def live_cards_by_wallet(db: AsyncSession, wallet_ids) -> dict:
    ids = list(wallet_ids)
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(IssuedCard).where(IssuedCard.wallet_card_id.in_(ids), IssuedCard.status.in_(LIVE_STATUSES))
        )
    ).scalars()
    return {c.wallet_card_id: c for c in rows}


async def issue_for_wallet(db: AsyncSession, wallet_card_id) -> IssuedCard | None:
    """Idempotent: returns the customer's one live card, creating or
    completing it (the triggering wallet only matters if there's no card
    yet and no better default). Returns None when no issuer is available."""
    wallet = (
        await db.execute(select(WalletCard).where(WalletCard.id == wallet_card_id).with_for_update())
    ).scalar_one_or_none()
    if wallet is None:
        return None
    user = (await db.execute(select(User).where(User.id == wallet.user_id).with_for_update())).scalar_one()
    card = await user_card(db, user.id)
    if card is not None and card.status != "pending_kyc":
        return card
    if card is None:
        wallet = await default_wallet(db, user, fallback=wallet) or wallet
    try:
        issuer = issuers.configured()
    except issuers.IssuerUnavailable:
        return None
    if not issuer.supports_currency(wallet.currency):
        return None

    if card is None:
        card = IssuedCard(
            wallet_card_id=wallet.id, user_id=wallet.user_id, issuer=issuer.code, network=issuer.network,
            form="virtual", billing_currency=wallet.currency,
            cardholder_name=(user.kyc_full_name or user.name or "Card Holder")[:26],
            controls=default_controls(), status="pending_kyc",
        )
        db.add(card)
        await db.flush()
    if (user.kyc_level or 0) < MIN_KYC_LEVEL or user.frozen:
        return card

    try:
        created = await issuers.by_code(card.issuer).create_card(
            holder_name=card.cardholder_name, reference=str(card.id), currency=card.billing_currency,
            form=card.form,
        )
    except issuers.IssuerUnavailable:
        return card
    except issuers.IssuerRejected as e:
        await CARD.move(db, card, "failed", reason="issuer_rejected")
        card.failure_reason = str(e)[:500]
        await db.flush()
        return card

    card.issuer_card_id = created.issuer_card_id
    card.last4 = created.last4
    card.exp_month = created.exp_month
    card.exp_year = created.exp_year
    await CARD.move(db, card, created.status, reason="issued")
    await db.flush()

    await notification_service.create_notification(
        db, wallet.user_id, NotificationType.SUCCESS, "Your Visa card is ready",
        f"Your {wallet.currency} Visa card ending {card.last4} is ready for online and tap-to-pay payments.",
        related_id=str(card.id), related_type="issued_card",
    )
    await db.flush()
    return card


async def sweep_unissued(db: AsyncSession, *, limit: int = 200) -> int:
    """Issue cards for wallets that have none (or are waiting on KYC and the
    customer has since verified). Bounded per run so it scales."""
    no_card = ~exists().where(IssuedCard.user_id == WalletCard.user_id,
                              IssuedCard.status.in_(LIVE_STATUSES))
    waiting = exists().where(IssuedCard.wallet_card_id == WalletCard.id, IssuedCard.status == "pending_kyc")
    rows = (
        await db.execute(
            select(WalletCard.id)
            .join(User, User.id == WalletCard.user_id)
            .where(User.deleted_at.is_(None), no_card | (waiting & (User.kyc_level >= MIN_KYC_LEVEL)))
            .order_by(WalletCard.created_at)
            .limit(limit)
        )
    ).scalars().all()
    issued = 0
    seen_users: set = set()
    for wallet_id in rows:
        async with db.begin_nested():
            card = await issue_for_wallet(db, wallet_id)
        if card is not None and card.user_id in seen_users:
            continue
        if card is not None:
            seen_users.add(card.user_id)
        if card is not None and card.status == "active":
            issued += 1
    return issued


async def on_kyc_verified(db: AsyncSession, user_id) -> None:
    """Called when a customer's KYC level rises: issue their waiting cards."""
    waiting = (
        await db.execute(
            select(IssuedCard.wallet_card_id).where(IssuedCard.user_id == user_id,
                                                    IssuedCard.status == "pending_kyc")
        )
    ).scalars().all()
    for wallet_id in waiting:
        await outbox.enqueue(db, "card.issue", {"wallet_card_id": str(wallet_id)})


# ─── customer operations ────────────────────────────────────────────────────


async def list_for_user(db: AsyncSession, user_id) -> list[IssuedCard]:
    return list(
        (
            await db.execute(
                select(IssuedCard).where(IssuedCard.user_id == user_id, IssuedCard.status.in_(LIVE_STATUSES))
                .order_by(IssuedCard.created_at)
            )
        ).scalars()
    )


async def get_for_user(db: AsyncSession, card_id: str, user_id, *, lock: bool = False) -> IssuedCard:
    try:
        cid = uuid.UUID(str(card_id))
    except ValueError as e:
        raise ApiError("Card not found", status_code=404) from e
    stmt = select(IssuedCard).where(IssuedCard.id == cid, IssuedCard.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    card = (await db.execute(stmt)).scalar_one_or_none()
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return card


def _require_issued(card: IssuedCard) -> None:
    if card.status == "pending_kyc":
        raise ApiError("Verify your identity to activate your card", status_code=403)
    if card.status not in ("active", "frozen") or not card.issuer_card_id:
        raise ApiError("This card is not active", status_code=409)


async def set_frozen(db: AsyncSession, card: IssuedCard, frozen: bool, *, reason: str = "customer") -> IssuedCard:
    _require_issued(card)
    if not frozen and card.status == "frozen":
        if card.overdraft_outstanding > 0:
            raise ApiError(
                f"Top up {card.billing_currency} {card.overdraft_outstanding} to repay your card overdraft first",
                status_code=409,
            )
        if card.frozen_reason == "admin" and reason != "admin":
            raise ApiError("This card was paused by BukkaPay. Contact support.", status_code=403)
        if card.frozen_reason == "no_funds":
            wallet = await db.get(WalletCard, card.wallet_card_id)
            if wallet is not None and Decimal(wallet.balance or 0) <= 0:
                raise ApiError("Your wallet is empty. Top up and your card switches back on by itself.",
                               status_code=402)
    target = "frozen" if frozen else "active"
    if card.status != target:
        await issuers.by_code(card.issuer).set_status(card.issuer_card_id, target)
        await CARD.move(db, card, target, reason=reason)
    card.frozen_reason = reason if frozen else None
    await db.flush()
    return card


async def sync_funds_lock(db: AsyncSession, wallet_card_id: str) -> int:
    """An empty wallet's card is paused at the issuer, so card machines and
    online shops are declined at the card network and never reach BukkaPay
    as a failed charge. It resumes by itself when money arrives. Only
    touches cards paused for this reason (never customer/admin/overdraft
    freezes). Idempotent; reads the balance at the time it runs."""
    wallet = await db.get(WalletCard, uuid.UUID(wallet_card_id))
    if wallet is None:
        return 0
    cards = (
        await db.execute(select(IssuedCard).where(IssuedCard.wallet_card_id == wallet.id,
                                                  IssuedCard.status.in_(("active", "frozen")))
                         .with_for_update())
    ).scalars().all()
    changed = 0
    empty = Decimal(wallet.balance or 0) <= 0
    for card in cards:
        if not card.issuer_card_id:
            continue
        if empty and card.status == "active":
            await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "frozen")
            await CARD.move(db, card, "frozen", reason="no_funds")
            card.frozen_reason = "no_funds"
            changed += 1
        elif not empty and card.status == "frozen" and card.frozen_reason == "no_funds":
            await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "active")
            await CARD.move(db, card, "active", reason="funds_back")
            card.frozen_reason = None
            changed += 1
    await db.flush()
    return changed


async def cancel(db: AsyncSession, card: IssuedCard) -> IssuedCard:
    if card.status in ("cancelled", "failed"):
        return card
    if card.issuer_card_id:
        await issuers.by_code(card.issuer).set_status(card.issuer_card_id, "cancelled")
    tokens = (
        await db.execute(select(CardWalletToken).where(CardWalletToken.issued_card_id == card.id,
                                                       CardWalletToken.status != "deleted"))
    ).scalars().all()
    for token in tokens:
        token.status = "deleted"
        token.deleted_at = datetime.now(UTC)
    await CARD.move(db, card, "cancelled", reason="terminated")
    card.cancelled_at = datetime.now(UTC)
    await db.flush()
    return card


async def replace(db: AsyncSession, card: IssuedCard) -> IssuedCard | None:
    """Cancel (lost/compromised) and issue a new card on the same wallet."""
    await cancel(db, card)
    return await issue_for_wallet(db, card.wallet_card_id)


async def set_active_wallet(db: AsyncSession, card: IssuedCard, wallet_id: str, *, user_id) -> IssuedCard:
    """Point the card at another of the customer's wallets. Payments already
    authorized keep settling from the wallet that funded them."""
    from app.services import swap_service

    try:
        wid = uuid.UUID(str(wallet_id))
    except ValueError as e:
        raise ApiError("Wallet not found", status_code=404) from e
    wallet = (await db.execute(select(WalletCard).where(WalletCard.id == wid, WalletCard.user_id == user_id))
              ).scalar_one_or_none()
    if wallet is None:
        raise ApiError("Wallet not found", status_code=404)
    if card.status not in LIVE_STATUSES:
        raise ApiError("This card is not active", status_code=409)
    if wallet.id == card.wallet_card_id:
        return card
    if wallet.frozen or wallet.blocked or wallet.flagged:
        raise ApiError("That wallet is restricted", status_code=403)
    if card.overdraft_outstanding > 0:
        raise ApiError("Repay your card overdraft before switching wallets", status_code=409)
    if wallet.currency != card.billing_currency:
        # Payments are billed in the card's currency: we must be able to convert.
        await swap_service.quote_for_target(db, wallet.currency, card.billing_currency, Decimal("1.00"))
    previous = card.wallet_card_id
    card.wallet_card_id = wallet.id
    from app.governance import audit

    await audit.record(db, actor_type="user", actor_id=str(user_id), actor_email=None,
                       action="card.active_wallet_changed", target_type="card", target_id=str(card.id),
                       details={"from_wallet": str(previous), "to_wallet": str(wallet.id), "currency": wallet.currency})
    await db.flush()
    # Pause / resume to match the new wallet's balance.
    await outbox.enqueue(db, "card.funds_lock", {"wallet_card_id": str(wallet.id)})
    return card


CONTROL_KEYS = {"online", "contactless", "chip", "atm", "international"}


async def update_controls(db: AsyncSession, card: IssuedCard, changes: dict) -> IssuedCard:
    controls = {**default_controls(), **(card.controls or {})}
    for key, value in changes.items():
        if value is None and key not in ("per_transaction_limit", "daily_limit"):
            continue
        if key in CONTROL_KEYS:
            controls[key] = bool(value)
        elif key in ("per_transaction_limit", "daily_limit"):
            controls[key] = None if value in (None, "") else str(posting.parse_amount(value, field=key))
        elif key == "blocked_mccs":
            mccs = [str(m).strip() for m in value or []]
            if any(not (len(m) == 4 and m.isdigit()) for m in mccs):
                raise ApiError("Merchant category codes are 4 digits")
            controls[key] = sorted(set(mccs))
    card.controls = controls
    await db.flush()
    return card


async def reveal(db: AsyncSession, card: IssuedCard) -> issuers.RevealSession:
    _require_issued(card)
    if card.status != "active":
        raise ApiError("Unfreeze the card to view its details", status_code=409)
    return await issuers.by_code(card.issuer).reveal(card.issuer_card_id)


WALLETS = ("apple_pay", "google_pay", "samsung_pay")


async def provision_token(db: AsyncSession, card: IssuedCard, *, wallet: str, device: dict) -> tuple[
    CardWalletToken, issuers.ProvisioningData
]:
    _require_issued(card)
    if card.status != "active":
        raise ApiError("Unfreeze the card to add it to a wallet", status_code=409)
    if wallet not in WALLETS:
        raise ApiError("Unsupported wallet")
    data = await issuers.by_code(card.issuer).provision_token(card.issuer_card_id, wallet=wallet, device=device)
    token = CardWalletToken(
        issued_card_id=card.id, issuer=card.issuer, issuer_token_id=data.issuer_token_id, wallet=wallet,
        status="requested", device_name=(device.get("deviceName") or None), token_last4=data.token_last4,
    )
    db.add(token)
    await db.flush()
    return token, data


async def tokens_for(db: AsyncSession, card: IssuedCard) -> list[CardWalletToken]:
    return list(
        (
            await db.execute(
                select(CardWalletToken).where(CardWalletToken.issued_card_id == card.id,
                                              CardWalletToken.status != "deleted")
                .order_by(CardWalletToken.created_at)
            )
        ).scalars()
    )


async def delete_token(db: AsyncSession, card: IssuedCard, token_id: str) -> None:
    token = next((t for t in await tokens_for(db, card) if str(t.id) == str(token_id)), None)
    if token is None:
        raise ApiError("Wallet token not found", status_code=404)
    await issuers.by_code(card.issuer).delete_token(token.issuer_token_id)
    token.status = "deleted"
    token.deleted_at = datetime.now(UTC)
    await db.flush()
