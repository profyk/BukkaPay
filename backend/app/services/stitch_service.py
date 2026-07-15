"""Stitch instant-EFT: wallet top-ups, bank withdrawals, and pay-by-EFT on
payment links. Port of stitch-routes.ts, with two deliberate deviations:

1. The Node handlers authenticated via `(req as any).userId || req.headers
   ["x-user-id"]` — since req.userId is never set anywhere in that app,
   every one of these endpoints actually ran on a raw client-supplied
   `x-user-id` header with zero verification, meaning anyone who knew (or
   guessed) a user's id could top up or withdraw their wallet. That's not
   "different but equivalent" behavior worth preserving — these endpoints
   use the same verified Bearer-session auth as everything else instead.
2. The idempotency guard against double-crediting a top-up was an
   in-process `Set<string>` (`claimedTopups`), which doesn't work once
   there's more than one API worker process. Moved to Redis.
"""

import secrets
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.redis import get_redis
from app.integrations import stitch
from app.models.enums import PaymentLinkStatus, TransactionType
from app.models.payment_link import PaymentLink
from app.models.wallet import Transaction, WalletCard

STITCH_BANKS = [
    {"id": "absa", "name": "Absa Bank"},
    {"id": "capitec", "name": "Capitec Bank"},
    {"id": "fnb", "name": "First National Bank"},
    {"id": "nedbank", "name": "Nedbank"},
    {"id": "standard_bank", "name": "Standard Bank"},
    {"id": "investec", "name": "Investec"},
    {"id": "discovery_bank", "name": "Discovery Bank"},
    {"id": "african_bank", "name": "African Bank"},
    {"id": "bidvest", "name": "Bidvest Bank"},
    {"id": "tymebank", "name": "TymeBank"},
]

CLAIMED_TOPUP_PREFIX = "stitch_claimed_topup:"
CLAIMED_TOPUP_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days — well past any realistic verify/callback race


def list_banks() -> list[dict]:
    return STITCH_BANKS


def get_status() -> bool:
    return stitch.is_stitch_payments_configured()


def _ensure_configured() -> None:
    if not stitch.is_stitch_payments_configured():
        raise ApiError("Stitch payments not configured", status_code=503)


async def _get_user_card(db: AsyncSession, card_id: str, user_id: uuid.UUID) -> WalletCard:
    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError as e:
        raise ApiError("Wallet card not found", status_code=404) from e
    result = await db.execute(
        select(WalletCard).where(WalletCard.id == card_uuid, WalletCard.user_id == user_id)
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise ApiError("Wallet card not found", status_code=404)
    return card


async def _is_topup_claimed(payment_request_id: str) -> bool:
    redis = get_redis()
    return bool(await redis.get(CLAIMED_TOPUP_PREFIX + payment_request_id))


async def _mark_topup_claimed(payment_request_id: str) -> None:
    redis = get_redis()
    await redis.set(CLAIMED_TOPUP_PREFIX + payment_request_id, "1", ex=CLAIMED_TOPUP_TTL_SECONDS)


async def initiate_topup(
    db: AsyncSession, user_id: uuid.UUID, *, wallet_card_id: str, amount: str, currency: str | None,
) -> dict:
    _ensure_configured()
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("walletCardId and amount are required") from e
    if parsed_amount < 10:
        raise ApiError("Minimum top-up amount is R10")

    await _get_user_card(db, wallet_card_id, user_id)

    settings = get_settings()
    reference = f"TOPUP-{secrets.token_hex(5).upper()}"
    redirect_url = (
        f"{settings.api_base_url}/api/stitch/topup/callback"
        f"?ref={reference}&cardId={wallet_card_id}&amount={parsed_amount}"
    )

    result = await stitch.create_payment_request(
        amount=float(parsed_amount), currency=currency or "ZAR", reference=reference,
        payer_reference="BukkaPay Top-up", redirect_url=redirect_url,
    )
    return {"paymentUrl": result["url"], "paymentRequestId": result["id"], "reference": reference}


async def topup_callback_redirect(db: AsyncSession, *, ref: str, card_id: str | None,
                                   payment_request_id: str | None, amount: str | None) -> str:
    settings = get_settings()
    app_url = settings.app_url

    if not payment_request_id:
        return f"{app_url}/topup?status=error&message=Missing+payment+ID"

    status = await stitch.get_payment_status(payment_request_id)
    if status != "completed":
        return f"{app_url}/topup?status={status}&ref={ref}"

    if await _is_topup_claimed(payment_request_id):
        return f"{app_url}/topup?status=success&ref={ref}"

    try:
        topup_amount = Decimal(amount or "0")
    except InvalidOperation:
        topup_amount = Decimal("0")
    if topup_amount <= 0 or not card_id:
        return f"{app_url}/topup?status=error&message=Invalid+amount"

    try:
        card_uuid = uuid.UUID(card_id)
    except ValueError:
        return f"{app_url}/topup?status=error&message=Card+not+found"
    result = await db.execute(select(WalletCard).where(WalletCard.id == card_uuid))
    card = result.scalar_one_or_none()
    if card is None:
        return f"{app_url}/topup?status=error&message=Card+not+found"

    card.balance = card.balance + topup_amount
    db.add(Transaction(
        user_id=card.user_id, card_id=card.id, title="Wallet Top-Up (Stitch)", category="topup",
        amount=topup_amount, type=TransactionType.CREDIT, icon="bank",
    ))
    await db.flush()

    await _mark_topup_claimed(payment_request_id)
    return f"{app_url}/topup?status=success&ref={ref}&amount={topup_amount}"


async def verify_topup(
    db: AsyncSession, user_id: uuid.UUID, *, payment_request_id: str, wallet_card_id: str, amount: str,
) -> dict:
    _ensure_configured()

    status = await stitch.get_payment_status(payment_request_id)
    if status == "pending":
        return {"status": "pending"}
    if status == "failed":
        raise ApiError("Payment was not completed", status_code=400)

    card = await _get_user_card(db, wallet_card_id, user_id)

    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("paymentRequestId, walletCardId, and amount are required") from e

    if await _is_topup_claimed(payment_request_id):
        return {"status": "completed", "newBalance": f"{card.balance:.2f}", "amount": f"{parsed_amount:.2f}"}

    card.balance = card.balance + parsed_amount
    db.add(Transaction(
        user_id=user_id, card_id=card.id, title="Wallet Top-Up (Stitch)", category="topup",
        amount=parsed_amount, type=TransactionType.CREDIT, icon="bank",
    ))
    await db.flush()

    await _mark_topup_claimed(payment_request_id)
    return {"status": "completed", "newBalance": f"{card.balance:.2f}", "amount": f"{parsed_amount:.2f}"}


async def withdraw(
    db: AsyncSession, user_id: uuid.UUID, *, wallet_card_id: str, amount: str, currency: str | None,
    bank_id: str, account_number: str, account_type: str | None, account_name: str,
) -> dict:
    _ensure_configured()

    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError(
            "walletCardId, amount, bankId, accountNumber, and accountName are required"
        ) from e
    if parsed_amount < 50:
        raise ApiError("Minimum withdrawal is R50")

    bank = next((b for b in STITCH_BANKS if b["id"] == bank_id), None)
    if bank is None:
        raise ApiError("Unsupported bank")

    card = await _get_user_card(db, wallet_card_id, user_id)
    if card.balance < parsed_amount:
        raise ApiError("Insufficient balance")

    new_balance = card.balance - parsed_amount
    card.balance = new_balance

    reference = f"WITHDRAW-{secrets.token_hex(5).upper()}"
    disbursement = await stitch.create_disbursement(
        amount=float(parsed_amount), currency=currency or "ZAR", reference=reference,
        recipient_name=account_name, bank_id=bank_id, account_number=account_number,
        account_type=account_type or "savings",
    )

    db.add(Transaction(
        user_id=user_id, card_id=card.id, title=f"Withdrawal to Bank ({bank['name']})",
        category="withdrawal", amount=parsed_amount, type=TransactionType.DEBIT, icon="bank-transfer-out",
    ))
    await db.flush()

    return {
        "success": True, "disbursementId": disbursement["id"], "status": disbursement["status"],
        "newBalance": f"{new_balance:.2f}", "reference": reference,
        "message": "Withdrawal submitted. Funds typically arrive within 1–2 business days.",
    }


async def initiate_payment_link_stitch(
    db: AsyncSession, link_id: str, *, payer_name: str, payer_email: str | None, amount: str | None,
) -> dict:
    _ensure_configured()
    if not payer_name:
        raise ApiError("payerName is required")

    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError as e:
        raise ApiError("Payment link not found", status_code=404) from e
    result = await db.execute(select(PaymentLink).where(PaymentLink.id == link_uuid))
    link = result.scalar_one_or_none()
    if link is None:
        raise ApiError("Payment link not found", status_code=404)
    # Node also allowed a (dead) "active" status here — see admin stats for
    # the same pattern; that value is never actually written, so only
    # "pending" is a real, reachable state.
    if link.status != PaymentLinkStatus.PENDING:
        raise ApiError("This payment link is no longer active")

    try:
        pay_amount = Decimal(amount) if amount else link.amount
    except InvalidOperation as e:
        raise ApiError("Valid amount is required") from e
    if pay_amount <= 0:
        raise ApiError("Valid amount is required")
    if link.allow_partial_payment and link.minimum_payment and pay_amount < link.minimum_payment:
        raise ApiError(f"Minimum payment is {link.currency} {link.minimum_payment}")

    settings = get_settings()
    reference = f"PLK-{str(link.id)[:8].upper()}-{secrets.token_hex(3).upper()}"
    redirect_url = f"{settings.api_base_url}/api/stitch/payment-link/callback?linkId={link.id}&ref={reference}"

    result = await stitch.create_payment_request(
        amount=float(pay_amount), currency="ZAR", reference=reference, payer_reference=payer_name,
        redirect_url=redirect_url,
    )
    return {"paymentUrl": result["url"], "paymentRequestId": result["id"], "reference": reference}


async def payment_link_callback_redirect(*, link_id: str, ref: str, payment_request_id: str | None) -> str:
    settings = get_settings()
    app_url = settings.app_url
    if not payment_request_id:
        return f"{app_url}/pay/{link_id}?status=error"
    status = await stitch.get_payment_status(payment_request_id)
    return f"{app_url}/pay/{link_id}?status={status}&ref={ref}"


async def verify_payment_link_stitch(payment_request_id: str) -> str:
    _ensure_configured()
    return await stitch.get_payment_status(payment_request_id)
