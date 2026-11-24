"""Cross-border payouts to bank accounts and mobile wallets.

Customer:   recipients (save/list/delete), quote, confirm (PIN + Idempotency-Key), status.
Providers:  POST /api/webhooks/payouts/{rail}: signed status events, stored once.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.ledger import idempotency
from app.models.payouts import Payout, PayoutRecipient
from app.models.platform import ProviderWebhook
from app.models.user import User
from app.payouts import rails as rails_mod
from app.payouts import service
from app.payouts.validation import RULES, validate_recipient
from app.schemas.base import CamelModel, JsDateTime, OptionalJsDateTime
from app.services import pin_service

router = APIRouter(prefix="/api", tags=["payouts"])


class RecipientIn(CamelModel):
    country: str = Field(min_length=2, max_length=2)
    currency: str = Field(min_length=3, max_length=3)
    method: Literal["bank", "mobile_wallet"]
    first_name: str
    last_name: str
    nickname: str | None = Field(default=None, max_length=60)
    bank_code: str | None = None
    bank_name: str | None = Field(default=None, max_length=80)
    branch_code: str | None = None
    account_number: str | None = None
    msisdn: str | None = None
    operator: str | None = None


class RecipientOut(CamelModel):
    id: str
    nickname: str | None
    country: str
    currency: str
    method: str
    first_name: str
    last_name: str
    bank_name: str | None
    account_hint: str  # never the full account number back to the client


def _recipient(r: PayoutRecipient) -> RecipientOut:
    hint = (f"•••• {r.account_number[-4:]}" if r.account_number else f"{r.msisdn[:-4]}••••" if r.msisdn else "")
    return RecipientOut(id=str(r.id), nickname=r.nickname, country=r.country, currency=r.currency, method=r.method,
                        first_name=r.first_name, last_name=r.last_name, bank_name=r.bank_name or r.operator,
                        account_hint=hint)


class QuoteIn(CamelModel):
    source_wallet_id: str
    recipient_id: str
    amount: int = Field(gt=0, description="Minor units (cents)")
    side: Literal["send", "receive"] = "send"
    purpose: str | None = Field(default=None, max_length=40)


class PayoutOut(CamelModel):
    id: str
    reference: str
    status: str
    rail: str
    in_network: bool
    country: str
    method: str
    send_currency: str
    send_amount: int
    fee_amount: int
    total_amount: int
    receive_currency: str
    receive_amount: int
    fx_rate: str | None
    fx_spread_amount: int
    quote_expires_at: JsDateTime
    failure_reason: str | None
    created_at: JsDateTime
    completed_at: OptionalJsDateTime = None


def _payout(p: Payout) -> PayoutOut:
    return PayoutOut(id=str(p.id), reference=p.reference, status=p.status, rail=p.rail, in_network=p.rail == service.INTERNAL,
                     country=p.country, method=p.method, send_currency=p.send_currency, send_amount=p.send_amount,
                     fee_amount=p.fee_amount, total_amount=p.send_amount + p.fee_amount,
                     receive_currency=p.receive_currency, receive_amount=p.receive_amount,
                     fx_rate=str(p.fx_rate) if p.fx_rate is not None else None, fx_spread_amount=p.fx_spread_amount,
                     quote_expires_at=p.quote_expires_at, failure_reason=p.failure_reason, created_at=p.created_at,
                     completed_at=p.completed_at)


@router.get("/payouts/corridors")
async def corridors(user_id=Depends(get_current_user_id)) -> list[dict]:
    return [{"country": c, "currency": r.currency, "bank": True, "mobileWallet": bool(r.mobile_operators),
             "operators": list(r.mobile_operators), "branchCode": r.branch_code is not None} for c, r in RULES.items()]


@router.get("/payouts/recipients")
async def list_recipients(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[RecipientOut]:
    rows = (await db.execute(select(PayoutRecipient).where(PayoutRecipient.user_id == user_id,
                                                           PayoutRecipient.deleted_at.is_(None))
                             .order_by(PayoutRecipient.created_at.desc()))).scalars()
    return [_recipient(r) for r in rows]


@router.post("/payouts/recipients", status_code=201)
async def add_recipient(body: RecipientIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> RecipientOut:
    clean = validate_recipient(country=body.country, method=body.method, currency=body.currency,
                               first_name=body.first_name, last_name=body.last_name, account_number=body.account_number,
                               branch_code=body.branch_code, bank_code=body.bank_code, msisdn=body.msisdn,
                               operator=body.operator)
    r = PayoutRecipient(user_id=user_id, nickname=body.nickname, bank_name=body.bank_name, extra={}, **clean)
    db.add(r)
    await db.flush()
    return _recipient(r)


@router.delete("/payouts/recipients/{recipient_id}", status_code=204)
async def delete_recipient(recipient_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> None:
    from datetime import UTC, datetime

    user = await db.get(User, user_id)
    r = await service._own_recipient(db, user, recipient_id)
    r.deleted_at = datetime.now(UTC)  # kept for the history of past payouts


@router.post("/payouts/quote", dependencies=[Depends(rate_limit("payout-quote", 60, 60))])
async def quote(body: QuoteIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> PayoutOut:
    user = await db.get(User, user_id)
    p = await service.quote(db, user, source_wallet_id=body.source_wallet_id, recipient_id=body.recipient_id,
                            amount=body.amount, side=body.side, purpose=body.purpose)
    return _payout(p)


class ConfirmIn(CamelModel):
    pin: str


@router.post("/payouts/{payout_id}/confirm", dependencies=[Depends(rate_limit("payment", 30, 60))])
async def confirm(payout_id: str, body: ConfirmIn, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
                  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> PayoutOut:
    if not idempotency_key:
        raise ApiError("An Idempotency-Key header is required", status_code=400)
    await pin_service.verify_pin(db, user_id, body.pin)
    async with idempotency.guard(db, scope=f"payout:{user_id}", key=idempotency_key, payload={"payout": payout_id}) as g:
        if g.replay is not None:
            return PayoutOut.model_validate(g.replay)
        user = await db.get(User, user_id)
        out = _payout(await service.confirm(db, user, payout_id))
        g.store(out.model_dump(by_alias=True, mode="json"))
    return out


@router.get("/payouts")
async def my_payouts(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[PayoutOut]:
    rows = (await db.execute(select(Payout).where(Payout.user_id == user_id, Payout.status != "quoted")
                             .order_by(Payout.created_at.desc()).limit(100))).scalars()
    return [_payout(p) for p in rows]


@router.get("/payouts/{payout_id}")
async def get_payout(payout_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> PayoutOut:
    import uuid

    try:
        pid = uuid.UUID(payout_id)
    except ValueError as e:
        raise ApiError("Transfer not found", status_code=404) from e
    p = (await db.execute(select(Payout).where(Payout.id == pid, Payout.user_id == user_id))).scalar_one_or_none()
    if p is None:
        raise ApiError("Transfer not found", status_code=404)
    return _payout(p)


@router.post("/webhooks/payouts/{rail_code}")
async def payout_webhook(rail_code: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        rail = rails_mod.by_code(rail_code)
    except rails_mod.RailUnavailable as e:
        raise ApiError("Unknown payout rail", status_code=404) from e
    body = await request.body()
    if not rail.verify_webhook(body, request.headers):
        raise ApiError("Invalid signature", status_code=401)
    import json

    try:
        payload = json.loads(body)
        event = rail.parse_webhook(payload)
    except (ValueError, KeyError, TypeError, rails_mod.RailUnavailable) as e:
        raise ApiError("Malformed event", status_code=400) from e
    inserted = (await db.execute(
        insert(ProviderWebhook)
        .values(provider=f"payout:{rail.code}", event_id=event.event_id, event_type=event.status, signature_valid=True,
                payload=payload, status="received", attempts=1)
        .on_conflict_do_nothing(constraint="uq_provider_webhooks_event")
        .returning(ProviderWebhook.id))).scalar_one_or_none()
    if inserted is None:
        return {"status": "duplicate"}
    record = await db.get(ProviderWebhook, inserted)
    async with db.begin_nested():
        outcome = await service.apply_event(db, rail.code, event)
    record.status = {"processed": "processed", "late": "ignored", "ignored": "ignored"}[outcome]
    return {"status": outcome}
