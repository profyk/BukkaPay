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

Ledger rewrite (2026-11): top-ups are recorded as ``funding_requests`` when
initiated and credited from that record using the amount Stitch reports as
paid - never values from the redirect or the client. Withdrawals debit the
wallet into a pending-payout account and are committed *before* the
provider is called, so a timeout can never lose or duplicate money.
"""

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.integrations import stitch
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.enums import TransactionType
from app.models.ledger import FundingRequest, WithdrawalRequest
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees, limits

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

STITCH_CURRENCY = "ZAR"  # Stitch instant EFT settles in ZAR only


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


async def initiate_topup(
    db: AsyncSession, user_id: uuid.UUID, *, wallet_card_id: str, amount: str, currency: str | None,
) -> dict:
    _ensure_configured()
    parsed_amount = posting.parse_amount(amount)
    if parsed_amount < 10:
        raise ApiError("Minimum top-up amount is R10")

    card = await _get_user_card(db, wallet_card_id, user_id)
    if card.currency != STITCH_CURRENCY:
        raise ApiError(f"Bank top-ups are only available for {STITCH_CURRENCY} wallets")
    if card.frozen or card.blocked:
        raise ApiError("This card is restricted", status_code=403)
    user = await db.get(User, user_id)
    await limits.check(db, user, "funding", parsed_amount, currency=card.currency, country=user.residence_country)

    settings = get_settings()
    reference = f"TOPUP-{secrets.token_hex(5).upper()}"
    redirect_url = f"{settings.api_base_url}/api/stitch/topup/callback?ref={reference}"

    result = await stitch.create_payment_request(
        amount=float(parsed_amount), currency=STITCH_CURRENCY, reference=reference,
        payer_reference="BukkaPay Top-up", redirect_url=redirect_url,
    )
    db.add(FundingRequest(
        user_id=user_id, wallet_card_id=card.id, provider="stitch", provider_reference=result["id"],
        reference=reference, amount=parsed_amount, currency=STITCH_CURRENCY, status="pending",
    ))
    await db.flush()
    return {"paymentUrl": result["url"], "paymentRequestId": result["id"], "reference": reference}


async def complete_funding(db: AsyncSession, funding: FundingRequest) -> FundingRequest:
    """Ask Stitch for the authoritative result and, on success, credit the
    wallet recorded at initiation. Safe to call any number of times: the row
    lock plus the status check make the credit happen exactly once."""
    funding = (
        await db.execute(
            select(FundingRequest).where(FundingRequest.id == funding.id).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if funding.status != "pending":
        return funding

    status, paid_amount = await stitch.get_payment_result(funding.provider_reference)
    if status == "pending":
        return funding
    if status == "failed":
        funding.status = "failed"
        await db.flush()
        return funding

    funding.provider_amount = paid_amount
    if paid_amount is None or posting.money(paid_amount) != funding.amount:
        # Never guess: hold for manual review instead of crediting. The money
        # is at Stitch either way; reconciliation resolves it.
        funding.status = "review"
        funding.review_reason = f"provider reported {paid_amount}, expected {funding.amount}"
        await db.flush()
        return funding

    if funding.purpose == "payment_link":
        return await _complete_link_funding(db, funding)
    if funding.purpose == "contribution":
        return await _complete_contribution_funding(db, funding)

    card = (
        await db.execute(select(WalletCard).where(WalletCard.id == funding.wallet_card_id))
    ).scalar_one()
    entry = await posting.post(
        db, kind="wallet_topup", description=f"Stitch top-up {funding.reference}",
        legs=[
            posting.debit(
                await ledger_accounts.provider_clearing(db, "stitch", funding.currency), funding.amount
            ),
            posting.credit(await ledger_accounts.wallet_account(db, card), funding.amount),
        ],
        details={"funding_request_id": str(funding.id), "provider_reference": funding.provider_reference},
    )
    funding.status = "completed"
    funding.journal_entry_id = entry.id
    funding.completed_at = datetime.now(UTC)
    db.add(Transaction(
        user_id=funding.user_id, card_id=card.id, title="Wallet Top-Up (Stitch)", category="topup",
        amount=funding.amount, type=TransactionType.CREDIT, icon="bank",
    ))
    await db.flush()
    return funding


async def _funding_by_provider_ref(db: AsyncSession, payment_request_id: str) -> FundingRequest | None:
    return (
        await db.execute(
            select(FundingRequest).where(
                FundingRequest.provider == "stitch", FundingRequest.provider_reference == payment_request_id
            )
        )
    ).scalar_one_or_none()


async def topup_callback_redirect(db: AsyncSession, *, ref: str, payment_request_id: str | None) -> str:
    """Browser return from Stitch. The redirect itself proves nothing - it
    only triggers a server-side status check against Stitch."""
    app_url = get_settings().app_url
    if not payment_request_id:
        return f"{app_url}/topup?status=error&message=Missing+payment+ID"
    funding = await _funding_by_provider_ref(db, payment_request_id)
    if funding is None or funding.reference != ref or funding.purpose != "wallet_topup":
        return f"{app_url}/topup?status=error&message=Unknown+top-up"
    funding = await complete_funding(db, funding)
    if funding.status == "completed":
        return f"{app_url}/topup?status=success&ref={funding.reference}&amount={funding.amount}"
    if funding.status == "review":
        return f"{app_url}/topup?status=review&ref={funding.reference}"
    return f"{app_url}/topup?status={funding.status}&ref={funding.reference}"


async def verify_topup(db: AsyncSession, user_id: uuid.UUID, *, payment_request_id: str) -> dict:
    _ensure_configured()
    funding = await _funding_by_provider_ref(db, payment_request_id)
    if funding is None or funding.user_id != user_id or funding.purpose != "wallet_topup":
        raise ApiError("Top-up not found", status_code=404)
    funding = await complete_funding(db, funding)
    card = (
        await db.execute(select(WalletCard).where(WalletCard.id == funding.wallet_card_id))
    ).scalar_one()
    if funding.status == "failed":
        raise ApiError("Payment was not completed", status_code=400)
    if funding.status == "pending":
        return {"status": "pending"}
    if funding.status == "review":
        return {"status": "review", "newBalance": f"{card.balance:.2f}", "amount": f"{funding.amount:.2f}"}
    return {"status": "completed", "newBalance": f"{card.balance:.2f}", "amount": f"{funding.amount:.2f}"}


async def withdraw(
    db: AsyncSession, user_id: uuid.UUID, *, wallet_card_id: str, amount: str, currency: str | None,
    bank_id: str, account_number: str, account_type: str | None, account_name: str,
) -> dict:
    _ensure_configured()
    parsed_amount = posting.parse_amount(amount)
    if parsed_amount < 50:
        raise ApiError("Minimum withdrawal is R50")
    bank = next((b for b in STITCH_BANKS if b["id"] == bank_id), None)
    if bank is None:
        raise ApiError("Unsupported bank")
    if not account_number or not account_name:
        raise ApiError("accountNumber and accountName are required")

    card = await _get_user_card(db, wallet_card_id, user_id)
    if card.currency != STITCH_CURRENCY:
        raise ApiError(f"Bank withdrawals are only available from {STITCH_CURRENCY} wallets")
    if card.frozen or card.blocked or card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    user = await db.get(User, user_id)
    if user.frozen:
        raise ApiError("Your account is restricted", status_code=403)
    await limits.check(db, user, "withdrawal", parsed_amount, currency=card.currency,
                       country=user.residence_country)
    fee = await fees.compute(db, "withdrawal", parsed_amount, currency=card.currency,
                             country=user.residence_country, method="bank_payout")
    total_debit = parsed_amount + fee.fee
    if card.balance < total_debit:
        raise ApiError(f"Insufficient balance (amount {parsed_amount:.2f} + fee {fee.fee:.2f})")

    reference = f"WITHDRAW-{secrets.token_hex(5).upper()}"
    request = WithdrawalRequest(
        user_id=user_id, wallet_card_id=card.id, provider="stitch", reference=reference,
        amount=parsed_amount, currency=card.currency, bank_id=bank_id,
        account_number_last4=account_number[-4:], account_name=account_name, status="submitted",
    )
    db.add(request)
    await db.flush()
    entry = await posting.post(
        db, kind="withdrawal", description=f"Withdrawal {reference} to {bank['name']}",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, card), total_debit),
            posting.credit(await ledger_accounts.payouts_pending(db, card.currency), parsed_amount),
            posting.credit(await ledger_accounts.fee_revenue(db, card.currency), fee.fee),
        ],
        details={"withdrawal_request_id": str(request.id), "sender_id": str(user_id),
                 "fee_breakdown": fee.breakdown},
    )
    request.debit_entry_id = entry.id
    db.add(Transaction(
        user_id=user_id, card_id=card.id, title=f"Withdrawal to Bank ({bank['name']})",
        category="withdrawal", amount=total_debit, type=TransactionType.DEBIT, icon="bank-transfer-out",
        fee_amount=fee.fee,
    ))
    # Durable before the provider call: if the process dies mid-call, the
    # money sits in payouts:pending with a submitted request - visible to
    # reconciliation - rather than vanishing or being paid twice.
    await db.commit()

    try:
        disbursement = await stitch.create_disbursement(
            amount=float(parsed_amount), currency=card.currency, reference=reference,
            recipient_name=account_name, bank_id=bank_id, account_number=account_number,
            account_type=account_type or "savings",
        )
    except stitch.StitchRejected as e:
        # Definitive rejection: nothing was sent, so give the money back.
        await posting.reverse(db, entry, description=f"Withdrawal {reference} rejected by provider")
        request.status = "failed"
        request.failure_reason = str(e)[:500]
        db.add(Transaction(
            user_id=user_id, card_id=card.id, title="Withdrawal reversed", category="refund",
            amount=total_debit, type=TransactionType.CREDIT, icon="refresh-cw",
        ))
        await db.commit()
        raise ApiError("The bank payout was rejected. Your balance has been restored.", status_code=502) from e
    except Exception as e:  # noqa: BLE001 - timeout/unknown: outcome uncertain, keep it pending
        request.failure_reason = f"provider outcome unknown: {type(e).__name__}"[:500]
        await db.commit()
        return {
            "success": True, "disbursementId": None, "status": "processing",
            "newBalance": f"{card.balance:.2f}", "reference": reference,
            "message": "Withdrawal submitted and being confirmed with the bank.",
        }

    request.provider_reference = disbursement.get("id")
    await db.flush()
    return {
        "success": True, "disbursementId": disbursement["id"], "status": disbursement["status"],
        "newBalance": f"{card.balance:.2f}", "reference": reference, "fee": f"{fee.fee:.2f}",
        "message": "Withdrawal submitted. Funds typically arrive within 1-2 business days.",
    }


async def _complete_link_funding(db: AsyncSession, funding: FundingRequest) -> FundingRequest:
    from app.services import payment_link_service

    link = await payment_link_service.lock_link(db, funding.payment_link_id)
    try:
        pay_amount = payment_link_service.validate_link_amount(link, funding.amount)
    except ApiError as e:
        # Paid at the bank but the link can no longer take it (e.g. someone
        # else paid it meanwhile). Hold for a refund decision.
        funding.status = "review"
        funding.review_reason = f"link not payable on completion: {e.message}"
        await db.flush()
        return funding
    clearing = await ledger_accounts.provider_clearing(db, "stitch", funding.currency)
    await payment_link_service.settle_link_payment(
        db, link, pay_amount, source=posting.debit(clearing, pay_amount), method="stitch_eft",
        payer_name=funding.payer_name, payer_email=funding.payer_email, payer_user_id=None,
        reference=funding.reference,
    )
    funding.status = "completed"
    funding.completed_at = datetime.now(UTC)
    await db.flush()
    return funding


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
    from app.services import payment_link_service

    link = await payment_link_service.lock_link(db, link_uuid)
    if link.currency != STITCH_CURRENCY:
        raise ApiError(f"Bank (EFT) payment is only available for {STITCH_CURRENCY} links")
    pay_amount = payment_link_service.validate_link_amount(link, amount)

    settings = get_settings()
    reference = f"PLK-{str(link.id)[:8].upper()}-{secrets.token_hex(3).upper()}"
    redirect_url = f"{settings.api_base_url}/api/stitch/payment-link/callback?linkId={link.id}&ref={reference}"
    result = await stitch.create_payment_request(
        amount=float(pay_amount), currency=STITCH_CURRENCY, reference=reference, payer_reference=payer_name,
        redirect_url=redirect_url,
    )
    db.add(FundingRequest(
        purpose="payment_link", payment_link_id=link.id, payer_name=payer_name, payer_email=payer_email,
        provider="stitch", provider_reference=result["id"], reference=reference,
        amount=pay_amount, currency=STITCH_CURRENCY, status="pending",
    ))
    await db.flush()
    return {"paymentUrl": result["url"], "paymentRequestId": result["id"], "reference": reference}


async def _complete_link_by_provider_ref(db: AsyncSession, link_id: str, payment_request_id: str) -> str:
    funding = await _funding_by_provider_ref(db, payment_request_id)
    if funding is None or funding.purpose != "payment_link" or str(funding.payment_link_id) != link_id:
        return "error"
    funding = await complete_funding(db, funding)
    return funding.status


async def payment_link_callback_redirect(
    db: AsyncSession, *, link_id: str, ref: str, payment_request_id: str | None,
) -> str:
    app_url = get_settings().app_url
    if not payment_request_id:
        return f"{app_url}/pay/{link_id}?status=error"
    status = await _complete_link_by_provider_ref(db, link_id, payment_request_id)
    return f"{app_url}/pay/{link_id}?status={status}&ref={ref}"


async def verify_payment_link_stitch(db: AsyncSession, link_id: str, payment_request_id: str) -> str:
    _ensure_configured()
    status = await _complete_link_by_provider_ref(db, link_id, payment_request_id)
    if status == "error":
        raise ApiError("Payment not found", status_code=404)
    return status


async def initiate_contribution_eft(db: AsyncSession, group, *, payer_name: str, payer_email: str | None,
                                    amount: str) -> dict:
    _ensure_configured()
    if group.currency != STITCH_CURRENCY:
        raise ApiError(f"EFT contributions are only available for {STITCH_CURRENCY} campaigns")
    parsed = posting.parse_amount(amount)
    settings = get_settings()
    reference = f"CON-{str(group.id)[:8].upper()}-{secrets.token_hex(3).upper()}"
    redirect_url = f"{settings.api_base_url}/api/stitch/contribution/callback?ref={reference}"
    result = await stitch.create_payment_request(
        amount=float(parsed), currency=STITCH_CURRENCY, reference=reference, payer_reference=payer_name,
        redirect_url=redirect_url,
    )
    db.add(FundingRequest(
        purpose="contribution", contribution_group_id=group.id, payer_name=payer_name, payer_email=payer_email,
        provider="stitch", provider_reference=result["id"], reference=reference, amount=parsed,
        currency=STITCH_CURRENCY, status="pending",
    ))
    await db.flush()
    return {"paymentUrl": result["url"], "paymentRequestId": result["id"], "reference": reference}


async def _complete_contribution_funding(db: AsyncSession, funding: FundingRequest) -> FundingRequest:
    from app.services import contribution_service

    group = await contribution_service.lock_group(db, funding.contribution_group_id)
    await contribution_service.record_funded_contribution(db, group, funding)
    funding.status = "completed"
    funding.completed_at = datetime.now(UTC)
    await db.flush()
    return funding


async def contribution_callback_redirect(db: AsyncSession, *, ref: str, payment_request_id: str | None) -> str:
    app_url = get_settings().app_url
    if not payment_request_id:
        return f"{app_url}/contributions?status=error"
    funding = await _funding_by_provider_ref(db, payment_request_id)
    if funding is None or funding.reference != ref or funding.purpose != "contribution":
        return f"{app_url}/contributions?status=error"
    funding = await complete_funding(db, funding)
    return f"{app_url}/contribute/{funding.contribution_group_id}?status={funding.status}&ref={ref}"
