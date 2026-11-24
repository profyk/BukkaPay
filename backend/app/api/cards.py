"""Visa cards on every wallet: customer endpoints, the issuer-processor's
real-time authorization and event webhooks, and a sandbox simulator.

Customer
  GET    /api/issued-cards                       my cards
  GET    /api/issued-cards/{id}                  one card + wallet tokens
  POST   /api/wallets/{walletId}/issued-card     issue (or finish issuing) the wallet's card
  POST   /api/issued-cards/{id}/freeze|unfreeze
  POST   /api/issued-cards/{id}/replace          PIN; lost/compromised → new card number
  PATCH  /api/issued-cards/{id}/controls         PIN; online/contactless/ATM/international, limits, MCC blocks
  POST   /api/issued-cards/{id}/reveal           PIN; issuer-hosted reveal session (PAN never stored here)
  POST   /api/issued-cards/{id}/wallet-tokens    PIN; Apple/Google/Samsung Pay push provisioning
  DELETE /api/issued-cards/{id}/wallet-tokens/{tokenId}
  GET    /api/issued-cards/{id}/authorizations   pending + recent card payments

Issuer-processor (signed: X-Card-Issuer-Signature: t=…,v1=…)
  POST /api/card-issuer/{issuer}/authorize       synchronous approve/decline
  POST /api/card-issuer/{issuer}/events          reversal, clearing, refund, token updates

Sandbox (non-production only)
  POST /api/sandbox/issued-cards/{id}/simulate   authorize/clear/reverse/refund through the signed path
"""

import json
import secrets
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.cards import issuers, processing
from app.cards import service as cards
from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import posting
from app.models.cards import CardAuthorization, IssuedCard
from app.models.platform import ProviderWebhook
from app.schemas.base import CamelModel, JsDateTime, MoneyStr, OptionalMoneyStr
from app.services import pin_service, wallet_service

router = APIRouter(prefix="/api", tags=["cards"])


# ─── schemas ────────────────────────────────────────────────────────────────


class CardControls(CamelModel):
    online: bool = True
    contactless: bool = True
    chip: bool = True
    atm: bool = False
    international: bool = True
    per_transaction_limit: str | None = None
    daily_limit: str | None = None
    blocked_mccs: list[str] = Field(default_factory=list)


class WalletTokenResponse(CamelModel):
    id: str
    wallet: str
    status: str
    device_name: str | None
    token_last4: str | None
    created_at: JsDateTime


class IssuedCardResponse(CamelModel):
    id: str
    wallet_card_id: str
    network: str
    form: str
    status: str
    billing_currency: str
    last4: str | None
    exp_month: int | None
    exp_year: int | None
    cardholder_name: str
    controls: CardControls
    frozen_reason: str | None
    overdraft_outstanding: MoneyStr
    created_at: JsDateTime
    wallet_tokens: list[WalletTokenResponse] = Field(default_factory=list)


def _card(card: IssuedCard, tokens=()) -> IssuedCardResponse:
    return IssuedCardResponse.model_validate({
        "id": str(card.id), "walletCardId": str(card.wallet_card_id), "network": card.network, "form": card.form,
        "status": card.status, "billingCurrency": card.billing_currency, "last4": card.last4,
        "expMonth": card.exp_month, "expYear": card.exp_year, "cardholderName": card.cardholder_name,
        "controls": CardControls.model_validate(card.controls or {}), "frozenReason": card.frozen_reason,
        "overdraftOutstanding": card.overdraft_outstanding or Decimal("0.00"), "createdAt": card.created_at,
        "walletTokens": [
            WalletTokenResponse.model_validate({
                "id": str(t.id), "wallet": t.wallet, "status": t.status, "deviceName": t.device_name,
                "tokenLast4": t.token_last4, "createdAt": t.created_at,
            }) for t in tokens
        ],
    })


class PinBody(CamelModel):
    pin: str


class ControlsBody(CamelModel):
    pin: str
    online: bool | None = None
    contactless: bool | None = None
    chip: bool | None = None
    atm: bool | None = None
    international: bool | None = None
    per_transaction_limit: str | None = None
    daily_limit: str | None = None
    blocked_mccs: list[str] | None = None


class WalletTokenBody(CamelModel):
    pin: str
    wallet: str
    device_name: str | None = None
    # Apple: certificates + nonce + nonceSignature; Google: deviceId + walletAccountId.
    device: dict = Field(default_factory=dict)


class ProvisioningResponse(CamelModel):
    token: WalletTokenResponse
    activation_data: str
    encrypted_pass_data: str | None
    ephemeral_public_key: str | None


class RevealResponse(CamelModel):
    kind: str
    expires_at: JsDateTime
    url: str | None = None
    token: str | None = None
    pan: str | None = None
    cvv: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    cardholder_name: str | None = None


class AuthorizationResponse(CamelModel):
    id: str
    status: str
    amount: MoneyStr
    fee: MoneyStr
    currency: str
    merchant_amount: OptionalMoneyStr
    merchant_currency: str | None
    merchant_name: str | None
    merchant_country: str | None
    channel: str
    decline_reason: str | None
    created_at: JsDateTime


# ─── customer ───────────────────────────────────────────────────────────────


@router.get("/issued-cards")
async def list_cards(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[IssuedCardResponse]:
    return [_card(c) for c in await cards.list_for_user(db, user_id)]


@router.get("/issued-cards/{card_id}")
async def get_card(card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    card = await cards.get_for_user(db, card_id, user_id)
    return _card(card, await cards.tokens_for(db, card))


@router.post("/wallets/{wallet_id}/issued-card")
async def issue_card(wallet_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    wallet = await wallet_service.get_wallet_card(db, wallet_id, user_id)
    if wallet is None:
        raise ApiError("Wallet not found", status_code=404)
    try:
        issuer = issuers.configured()
    except issuers.IssuerUnavailable as e:
        raise ApiError(str(e), status_code=503) from e
    if not issuer.supports_currency(wallet.currency):
        raise ApiError(f"Cards are not available for {wallet.currency} wallets yet", status_code=409)
    card = await cards.issue_for_wallet(db, wallet.id)
    if card is None:
        raise ApiError("Card issuing is temporarily unavailable", status_code=503)
    return _card(card)


@router.post("/issued-cards/{card_id}/freeze")
async def freeze(card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    # Freezing is deliberately PIN-free: a customer who lost their phone or
    # card must be able to stop it instantly.
    return _card(await cards.set_frozen(db, await cards.get_for_user(db, card_id, user_id, lock=True), True))


@router.post("/issued-cards/{card_id}/unfreeze")
async def unfreeze(card_id: str, body: PinBody, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    return _card(await cards.set_frozen(db, await cards.get_for_user(db, card_id, user_id, lock=True), False))


class ActiveWalletBody(CamelModel):
    wallet_id: str
    pin: str


@router.post("/issued-cards/{card_id}/active-wallet")
async def set_active_wallet(card_id: str, body: ActiveWalletBody, user_id=Depends(get_current_user_id),
                            db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    """Choose which wallet the card spends from (ZAR, BWP, USD…)."""
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id, lock=True)
    return _card(await cards.set_active_wallet(db, card, body.wallet_id, user_id=user_id))


@router.post("/issued-cards/{card_id}/terminate")
async def terminate(card_id: str, body: PinBody, user_id=Depends(get_current_user_id),
                    db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    """Close the card for good (a new one can be requested later)."""
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id, lock=True)
    if card.overdraft_outstanding > 0:
        raise ApiError("Repay your card overdraft before closing the card", status_code=409)
    return _card(await cards.cancel(db, card))


class DisputeBody(CamelModel):
    clearing_id: str
    reason: str
    details: str | None = None


class DisputeResponse(CamelModel):
    id: str
    clearing_id: str
    status: str
    reason: str
    amount: MoneyStr
    currency: str
    created_at: JsDateTime


def _dispute(d) -> DisputeResponse:
    return DisputeResponse.model_validate({"id": str(d.id), "clearingId": str(d.clearing_id), "status": d.status,
                                           "reason": d.reason, "amount": d.amount, "currency": d.currency,
                                           "createdAt": d.created_at})


@router.get("/issued-cards/{card_id}/disputes")
async def list_disputes(card_id: str, user_id=Depends(get_current_user_id),
                        db: AsyncSession = Depends(get_db)) -> list[DisputeResponse]:
    from app.models.cards import CardDispute

    card = await cards.get_for_user(db, card_id, user_id)
    rows = (await db.execute(select(CardDispute).where(CardDispute.issued_card_id == card.id)
                             .order_by(CardDispute.created_at.desc()))).scalars()
    return [_dispute(d) for d in rows]


@router.post("/issued-cards/{card_id}/disputes", status_code=201)
async def open_dispute(card_id: str, body: DisputeBody, user_id=Depends(get_current_user_id),
                       db: AsyncSession = Depends(get_db)) -> DisputeResponse:
    from app.cards import disputes

    card = await cards.get_for_user(db, card_id, user_id)
    return _dispute(await disputes.open_dispute(db, card, clearing_id=body.clearing_id, reason=body.reason,
                                                details=body.details))


@router.post("/issued-cards/{card_id}/disputes/{dispute_id}/withdraw")
async def withdraw_dispute(card_id: str, dispute_id: str, user_id=Depends(get_current_user_id),
                           db: AsyncSession = Depends(get_db)) -> DisputeResponse:
    import uuid

    from app.cards import disputes
    from app.models.cards import CardDispute

    card = await cards.get_for_user(db, card_id, user_id)
    try:
        did = uuid.UUID(dispute_id)
    except ValueError as e:
        raise ApiError("Dispute not found", status_code=404) from e
    dispute = (await db.execute(select(CardDispute).where(CardDispute.id == did, CardDispute.issued_card_id == card.id)
                                .with_for_update())).scalar_one_or_none()
    if dispute is None:
        raise ApiError("Dispute not found", status_code=404)
    return _dispute(await disputes.withdraw(db, dispute))


@router.post("/issued-cards/{card_id}/replace")
async def replace(card_id: str, body: PinBody, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id, lock=True)
    if card.overdraft_outstanding > 0:
        raise ApiError("Repay your card overdraft before replacing the card", status_code=409)
    new = await cards.replace(db, card)
    if new is None:
        raise ApiError("Card issuing is temporarily unavailable", status_code=503)
    return _card(new)


@router.patch("/issued-cards/{card_id}/controls")
async def update_controls(card_id: str, body: ControlsBody, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> IssuedCardResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id, lock=True)
    changes = body.model_dump(exclude={"pin"}, exclude_unset=True)
    return _card(await cards.update_controls(db, card, changes))


@router.post("/issued-cards/{card_id}/reveal", dependencies=[Depends(rate_limit("card_reveal", 10, 3600))])
async def reveal(card_id: str, body: PinBody, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> RevealResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id)
    session = await cards.reveal(db, card)
    return RevealResponse.model_validate({
        "kind": session.kind, "expiresAt": session.expires_at, "url": session.url, "token": session.token,
        "pan": session.pan, "cvv": session.cvv, "expMonth": card.exp_month, "expYear": card.exp_year,
        "cardholderName": card.cardholder_name,
    })


@router.post("/issued-cards/{card_id}/wallet-tokens")
async def add_to_wallet(card_id: str, body: WalletTokenBody, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> ProvisioningResponse:
    await pin_service.verify_pin(db, user_id, body.pin)
    card = await cards.get_for_user(db, card_id, user_id, lock=True)
    token, data = await cards.provision_token(db, card, wallet=body.wallet,
                                              device={**body.device, "deviceName": body.device_name})
    return ProvisioningResponse.model_validate({
        "token": WalletTokenResponse.model_validate({
            "id": str(token.id), "wallet": token.wallet, "status": token.status, "deviceName": token.device_name,
            "tokenLast4": token.token_last4, "createdAt": token.created_at,
        }),
        "activationData": data.activation_data, "encryptedPassData": data.encrypted_pass_data,
        "ephemeralPublicKey": data.ephemeral_public_key,
    })


@router.delete("/issued-cards/{card_id}/wallet-tokens/{token_id}", status_code=204)
async def remove_from_wallet(card_id: str, token_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> None:
    await cards.delete_token(db, await cards.get_for_user(db, card_id, user_id), token_id)


@router.get("/issued-cards/{card_id}/authorizations")
async def authorizations(card_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[AuthorizationResponse]:
    card = await cards.get_for_user(db, card_id, user_id)
    rows = (
        await db.execute(
            select(CardAuthorization).where(CardAuthorization.issued_card_id == card.id)
            .order_by(CardAuthorization.created_at.desc()).limit(100)
        )
    ).scalars()
    return [AuthorizationResponse.model_validate({
        "id": str(a.id), "status": a.status, "amount": a.amount, "fee": a.fee, "currency": a.currency,
        "merchantAmount": a.merchant_amount, "merchantCurrency": a.merchant_currency,
        "merchantName": a.merchant_name, "merchantCountry": a.merchant_country, "channel": a.channel,
        "declineReason": a.decline_reason, "createdAt": a.created_at,
    }) for a in rows]


# ─── issuer-processor webhooks ──────────────────────────────────────────────


def _issuer_or_404(code: str) -> issuers.CardIssuer:
    try:
        return issuers.by_code(code)
    except issuers.IssuerUnavailable as e:
        raise ApiError("Unknown card issuer", status_code=404) from e


def _amount(value) -> Decimal:
    return posting.parse_amount(value)


@router.post("/card-issuer/{issuer_code}/authorize")
async def issuer_authorize(
    issuer_code: str, request: Request, db: AsyncSession = Depends(get_db),
    signature: str | None = Header(default=None, alias="X-Card-Issuer-Signature"),
) -> dict:
    issuer = _issuer_or_404(issuer_code)
    body = await request.body()
    if not issuer.verify_webhook(body, request.headers):
        raise ApiError("Invalid signature", status_code=401)
    try:
        data = issuer.parse_authorization(json.loads(body))
    except (ValueError, issuers.IssuerUnavailable) as e:
        return {"approved": False, "declineReason": "invalid_request", "detail": str(e)[:200]}
    try:
        req = processing.AuthorizationRequest(
            issuer=issuer.code, issuer_authorization_id=str(data["authorizationId"]),
            issuer_card_id=str(data["cardId"]), amount=_amount(data["amount"]), currency=str(data["currency"]),
            merchant_amount=_amount(data["merchantAmount"]) if data.get("merchantAmount") else None,
            merchant_currency=data.get("merchantCurrency"), merchant_name=data.get("merchantName"),
            merchant_mcc=data.get("merchantMcc"),
            merchant_country=(data.get("merchantCountry") or "").upper() or None,
            channel=data.get("channel") or "online", issuer_token_id=data.get("tokenId"),
        )
    except (KeyError, ApiError) as e:
        return {"approved": False, "declineReason": "invalid_request", "detail": str(e)}
    import time

    from app.core.config import get_settings

    budget = get_settings().paymentology_auth_budget_ms / 1000
    started = time.monotonic()
    try:
        auth = await processing.authorize(db, req)
    except ApiError as e:
        # The network expects a decision, never an error: unknown card etc. = decline.
        return {"approved": False, "authorizationId": req.issuer_authorization_id,
                "declineReason": "unknown_card" if e.status_code == 404 else "processing_error", "approvedAmount": "0.00"}
    if time.monotonic() - started > budget:
        # Past the processor's timeout it has already stood in (declined or
        # used its own rules): undo our decision so no hold is left behind.
        # A retry with the same authorization id is decided afresh.
        await db.rollback()
        return {"approved": False, "authorizationId": req.issuer_authorization_id,
                "declineReason": "issuer_timeout", "approvedAmount": "0.00"}
    return {"approved": auth.status != "declined", "authorizationId": req.issuer_authorization_id,
            "declineReason": auth.decline_reason, "approvedAmount": str(auth.amount) if auth.status != "declined" else "0.00"}


async def _apply_event(db: AsyncSession, issuer: str, event_type: str, data: dict) -> bool:
    if event_type == "authorization.reversed":
        amt = _amount(data["amount"]) if data.get("amount") else None
        return await processing.reverse(db, issuer, str(data["authorizationId"]), amt)
    if event_type == "transaction.cleared":
        await processing.clear(
            db, issuer=issuer, issuer_transaction_id=str(data["transactionId"]), issuer_card_id=str(data["cardId"]),
            amount=_amount(data["amount"]), currency=str(data["currency"]),
            issuer_authorization_id=data.get("authorizationId"), merchant_name=data.get("merchantName"),
            final=bool(data.get("final", True)),
        )
        return True
    if event_type == "transaction.refunded":
        await processing.refund(
            db, issuer=issuer, issuer_transaction_id=str(data["transactionId"]), issuer_card_id=str(data["cardId"]),
            amount=_amount(data["amount"]), currency=str(data["currency"]), merchant_name=data.get("merchantName"),
        )
        return True
    if event_type == "token.updated":
        return await processing.token_event(db, issuer, str(data["tokenId"]), str(data["status"]))
    if event_type in ("dispute.won", "dispute.lost", "dispute.submitted"):
        from app.cards import disputes

        return await disputes.issuer_outcome(db, issuer, str(data["disputeId"]), event_type.split(".", 1)[1],
                                             note=data.get("note"))
    return False


@router.post("/card-issuer/{issuer_code}/events")
async def issuer_events(
    issuer_code: str, request: Request, db: AsyncSession = Depends(get_db),
    signature: str | None = Header(default=None, alias="X-Card-Issuer-Signature"),
) -> dict:
    issuer = _issuer_or_404(issuer_code)
    body = await request.body()
    if not issuer.verify_webhook(body, request.headers):
        raise ApiError("Invalid signature", status_code=401)
    try:
        payload = json.loads(body)
        event_type, payload = issuer.parse_event(payload)
        event_id = str(payload["id"])
    except (ValueError, KeyError, TypeError, issuers.IssuerUnavailable) as e:
        raise ApiError("Malformed event", status_code=400) from e
    provider = f"card:{issuer.code}"
    inserted = (
        await db.execute(
            insert(ProviderWebhook)
            .values(provider=provider, event_id=event_id, event_type=event_type, signature_valid=True,
                    payload=payload, status="received", attempts=1)
            .on_conflict_do_nothing(constraint="uq_provider_webhooks_event")
            .returning(ProviderWebhook.id)
        )
    ).scalar_one_or_none()
    if inserted is None:
        return {"status": "duplicate"}
    record = await db.get(ProviderWebhook, inserted)
    try:
        async with db.begin_nested():
            handled = await _apply_event(db, issuer.code, event_type, payload.get("data") or {})
        record.status = "processed" if handled else "ignored"
    except (ApiError, KeyError) as e:
        record.status = "failed"
        record.error = getattr(e, "message", str(e))[:500]
    await db.flush()
    # A failed event is stored for ops review and retry; acknowledging it
    # stops the issuer from hammering us with the same bad payload.
    return {"status": record.status}


# ─── sandbox simulator ──────────────────────────────────────────────────────


class SimulateBody(CamelModel):
    action: str  # authorize | clear | reverse | refund
    amount: str
    merchant_name: str = "Sandbox Store"
    merchant_country: str | None = None
    merchant_currency: str | None = None
    merchant_mcc: str | None = "5411"
    channel: str = "contactless"
    authorization_id: str | None = None


@router.post("/sandbox/issued-cards/{card_id}/simulate")
async def simulate(card_id: str, body: SimulateBody, request: Request, user_id=Depends(get_current_user_id),
                   db: AsyncSession = Depends(get_db)) -> dict:
    """Drive a sandbox card through the same signed issuer webhooks a real
    processor would call. Lets the app demo tap-to-pay end to end."""
    if get_settings().is_production:
        raise ApiError("Not found", status_code=404)
    card = await cards.get_for_user(db, card_id, user_id)
    if card.issuer != "sandbox" or not card.issuer_card_id:
        raise ApiError("Only sandbox cards can be simulated", status_code=409)
    if body.action == "authorize":
        auth_id = "sbxauth_" + secrets.token_hex(8)
        req = processing.AuthorizationRequest(
            issuer="sandbox", issuer_authorization_id=auth_id, issuer_card_id=card.issuer_card_id,
            amount=_amount(body.amount), currency=card.billing_currency,
            merchant_amount=_amount(body.amount), merchant_currency=body.merchant_currency or card.billing_currency,
            merchant_name=body.merchant_name, merchant_mcc=body.merchant_mcc,
            merchant_country=(body.merchant_country or "").upper() or None, channel=body.channel,
        )
        auth = await processing.authorize(db, req)
        return {"authorizationId": auth_id, "approved": auth.status != "declined", "declineReason": auth.decline_reason}
    event_type = {"clear": "transaction.cleared", "reverse": "authorization.reversed",
                  "refund": "transaction.refunded"}.get(body.action)
    if event_type is None:
        raise ApiError("Unknown action")
    data = {"cardId": card.issuer_card_id, "amount": body.amount, "currency": card.billing_currency,
            "authorizationId": body.authorization_id, "merchantName": body.merchant_name,
            "transactionId": "sbxtxn_" + secrets.token_hex(8)}
    if event_type == "transaction.cleared" and not body.authorization_id:
        raise ApiError("authorizationId is required to clear")
    handled = await _apply_event(db, "sandbox", event_type, data)
    return {"status": "processed" if handled else "ignored"}
