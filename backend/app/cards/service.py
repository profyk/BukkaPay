"""Card lifecycle: every wallet gets a Visa card.

* A wallet is created → an outbox event asks for its card (and a periodic
  sweep catches any that were missed), so signup never waits on the issuer.
* Issuers require identity verification, so a customer below KYC level 1
  gets a ``pending_kyc`` card that is issued as soon as they verify.
* Card details are never stored: reveal goes through the issuer.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cards import issuers
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


async def request_card(db: AsyncSession, wallet: WalletCard) -> None:
    """Queue card issuance for a new wallet (same transaction as the wallet)."""
    await outbox.enqueue(db, "card.issue", {"wallet_card_id": str(wallet.id)})


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
    """Idempotent: returns the wallet's live card, creating or completing it.
    Returns None when no issuer is available (nothing is created)."""
    wallet = (
        await db.execute(select(WalletCard).where(WalletCard.id == wallet_card_id).with_for_update())
    ).scalar_one_or_none()
    if wallet is None:
        return None
    user = await db.get(User, wallet.user_id)
    card = await live_card(db, wallet.id)
    if card is not None and card.status != "pending_kyc":
        return card
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
        card.status = "failed"
        card.failure_reason = str(e)[:500]
        await db.flush()
        return card

    card.issuer_card_id = created.issuer_card_id
    card.last4 = created.last4
    card.exp_month = created.exp_month
    card.exp_year = created.exp_year
    card.status = created.status
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
    no_card = ~exists().where(IssuedCard.wallet_card_id == WalletCard.id,
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
    for wallet_id in rows:
        async with db.begin_nested():
            card = await issue_for_wallet(db, wallet_id)
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
    target = "frozen" if frozen else "active"
    if card.status != target:
        await issuers.by_code(card.issuer).set_status(card.issuer_card_id, target)
        card.status = target
    card.frozen_reason = reason if frozen else None
    await db.flush()
    return card


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
    card.status = "cancelled"
    card.cancelled_at = datetime.now(UTC)
    await db.flush()
    return card


async def replace(db: AsyncSession, card: IssuedCard) -> IssuedCard | None:
    """Cancel (lost/compromised) and issue a new card on the same wallet."""
    await cancel(db, card)
    return await issue_for_wallet(db, card.wallet_card_id)


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
