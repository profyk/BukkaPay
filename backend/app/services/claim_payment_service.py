import random
import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.models.claim_payment import ClaimPayment
from app.models.enums import ClaimMethod, ClaimPaymentStatus, PickupStatus, TransactionType
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

MAX_PIN_ATTEMPTS = 5
CLAIM_TTL_DAYS = 7


def _generate_pickup_code() -> str:
    part = lambda: f"{random.randint(0, 99999):05d}"
    return f"{part()}{part()}{part()}"


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def create_claim(
    db: AsyncSession, sender_id: uuid.UUID, *, recipient_name: str, recipient_contact: str,
    amount: str, currency: str | None, note: str | None, pin: str,
) -> ClaimPayment:
    if len(pin) < 4 or len(pin) > 6:
        raise ApiError("PIN must be 4–6 digits")
    if not re.fullmatch(r"\d+", pin):
        raise ApiError("PIN must be numeric")

    sender_result = await db.execute(select(User).where(User.id == sender_id))
    sender = sender_result.scalar_one_or_none()
    if sender is None:
        raise ApiError("Sender not found", status_code=404)

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == sender_id))
    cards = list(cards_result.scalars().all())
    if not cards:
        raise ApiError("No wallet card found")
    card = cards[0]

    try:
        amount_num = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if amount_num <= 0:
        raise ApiError("Invalid amount")
    if card.balance < amount_num:
        raise ApiError("Insufficient balance")

    pin_hash = hash_secret(pin)
    expires_at = _now() + timedelta(days=CLAIM_TTL_DAYS)

    claim = ClaimPayment(
        sender_id=sender_id, recipient_name=recipient_name, recipient_contact=recipient_contact,
        amount=amount_num, currency=currency or "ZAR", note=note, pin_hash=pin_hash,
        require_pin=True, status=ClaimPaymentStatus.PENDING, claimed=False, attempts=0,
        expires_at=expires_at,
    )
    db.add(claim)

    # Escrow: deduct from sender immediately, credited on successful claim.
    card.balance = card.balance - amount_num
    db.add(Transaction(
        user_id=sender_id, card_id=card.id, title=f"Claim sent to {recipient_name}",
        category="transfer", amount=amount_num, type=TransactionType.DEBIT, icon="send",
    ))
    await db.flush()
    return claim


async def get_claim(db: AsyncSession, claim_id: str) -> ClaimPayment | None:
    try:
        claim_uuid = uuid.UUID(claim_id)
    except ValueError:
        return None
    result = await db.execute(select(ClaimPayment).where(ClaimPayment.id == claim_uuid))
    return result.scalar_one_or_none()


async def get_claim_owned(db: AsyncSession, claim_id: str, sender_id: uuid.UUID) -> ClaimPayment | None:
    try:
        claim_uuid = uuid.UUID(claim_id)
    except ValueError:
        return None
    result = await db.execute(
        select(ClaimPayment).where(ClaimPayment.id == claim_uuid, ClaimPayment.sender_id == sender_id)
    )
    return result.scalar_one_or_none()


async def get_claims_by_sender(db: AsyncSession, sender_id: uuid.UUID) -> list[ClaimPayment]:
    result = await db.execute(
        select(ClaimPayment).where(ClaimPayment.sender_id == sender_id).order_by(ClaimPayment.created_at)
    )
    return list(result.scalars().all())


async def cancel_claim(db: AsyncSession, claim: ClaimPayment) -> None:
    if claim.claimed:
        raise ApiError("Cannot cancel — already claimed")
    if claim.status == ClaimPaymentStatus.CANCELLED:
        raise ApiError("Already cancelled")

    claim.status = ClaimPaymentStatus.CANCELLED

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == claim.sender_id))
    cards = list(cards_result.scalars().all())
    if cards:
        card = cards[0]
        card.balance = card.balance + claim.amount
        db.add(Transaction(
            user_id=claim.sender_id, card_id=card.id,
            title=f"Refund — cancelled claim for {claim.recipient_name}",
            category="refund", amount=claim.amount, type=TransactionType.CREDIT, icon="refresh-cw",
        ))
    await db.flush()


def ensure_claimable(claim: ClaimPayment) -> None:
    if claim.claimed:
        raise ApiError("Already claimed")
    if claim.status != ClaimPaymentStatus.PENDING:
        raise ApiError("Claim is not pending")


def ensure_not_expired(claim: ClaimPayment) -> None:
    if _now() > _aware(claim.expires_at):
        raise ApiError("This claim link has expired", status_code=410)


async def verify_pin(db: AsyncSession, claim: ClaimPayment, pin: str) -> None:
    if claim.claimed:
        raise ApiError("This payment has already been claimed")
    if claim.status == ClaimPaymentStatus.CANCELLED:
        raise ApiError("This claim has been cancelled")
    ensure_not_expired(claim)
    if claim.attempts >= MAX_PIN_ATTEMPTS:
        raise ApiError("Too many attempts. Contact the sender.", status_code=429)

    valid, _ = verify_secret(pin, claim.pin_hash)
    if not valid:
        claim.attempts += 1
        await db.flush()
        remaining = MAX_PIN_ATTEMPTS - claim.attempts
        raise ApiError(f"Incorrect PIN. {remaining} attempt(s) remaining.", status_code=401)


async def claim_via_bank(
    db: AsyncSession, claim: ClaimPayment, *, account_name: str, bank_name: str,
    account_number: str, branch_code: str | None,
) -> str:
    ensure_claimable(claim)
    claim.claimed = True
    claim.status = ClaimPaymentStatus.COMPLETED
    claim.claim_method = ClaimMethod.BANK
    claim.bank_details = {
        "accountName": account_name, "bankName": bank_name,
        "accountNumber": account_number, "branchCode": branch_code or "",
    }
    await db.flush()
    return f"R{claim.amount} will be transferred to your {bank_name} account within 1–2 business days."


async def claim_via_wallet(db: AsyncSession, claim: ClaimPayment, *, email: str) -> str:
    ensure_claimable(claim)

    receiver_result = await db.execute(select(User).where(User.email == email))
    receiver = receiver_result.scalar_one_or_none()
    if receiver is None:
        raise ApiError("No BukkaPay account found for this email. Please sign up first.", status_code=404)

    cards_result = await db.execute(select(WalletCard).where(WalletCard.user_id == receiver.id))
    cards = list(cards_result.scalars().all())
    if cards:
        card = cards[0]
        card.balance = card.balance + claim.amount
        db.add(Transaction(
            user_id=receiver.id, card_id=card.id,
            title=f"Claim received from {claim.recipient_name}",
            category="transfer", amount=claim.amount, type=TransactionType.CREDIT, icon="download",
        ))

    claim.claimed = True
    claim.status = ClaimPaymentStatus.COMPLETED
    claim.claim_method = ClaimMethod.WALLET
    await db.flush()
    return f"R{claim.amount} has been added to your BukkaPay wallet!"


async def claim_via_cash(db: AsyncSession, claim: ClaimPayment) -> str:
    ensure_claimable(claim)
    if claim.pickup_code:
        return claim.pickup_code

    claim.claim_method = ClaimMethod.CASH
    claim.pickup_code = _generate_pickup_code()
    claim.pickup_status = PickupStatus.PENDING
    await db.flush()
    return claim.pickup_code


async def redeem_pickup_code(db: AsyncSession, pickup_code: str) -> ClaimPayment:
    result = await db.execute(select(ClaimPayment).where(ClaimPayment.pickup_code == pickup_code))
    claim = result.scalar_one_or_none()
    if claim is None:
        raise ApiError("Invalid pickup code", status_code=404)
    if claim.claimed:
        raise ApiError("This pickup code has already been used")
    if claim.pickup_status == PickupStatus.COMPLETED:
        raise ApiError("Already redeemed")

    claim.claimed = True
    claim.status = ClaimPaymentStatus.COMPLETED
    claim.pickup_status = PickupStatus.COMPLETED
    await db.flush()
    return claim
