"""Admin: issued Visa cards and their authorizations. Freezing here sets
frozen_reason="admin", which the customer cannot undo from the app.
Every mutation is audited by `require` (same transaction)."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import require
from app.cards import service as card_service
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.cards import CardAuthorization, IssuedCard
from app.models.user import User
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-cards"])


class FreezeIn(CamelModel):
    reason: str


def _row(card: IssuedCard, user: User | None) -> dict:
    return {
        "id": str(card.id), "walletCardId": str(card.wallet_card_id), "userId": str(card.user_id),
        "userName": user.name if user else None, "userEmail": user.email if user else None,
        "issuer": card.issuer, "network": card.network, "status": card.status, "frozenReason": card.frozen_reason,
        "currency": card.billing_currency, "last4": card.last4, "expMonth": card.exp_month, "expYear": card.exp_year,
        "overdraftOutstanding": str(card.overdraft_outstanding), "createdAt": card.created_at.isoformat(),
    }


@router.get("/cards")
async def list_cards(
    status: str | None = None, q: str | None = None, limit: int = Query(default=50, le=200), offset: int = 0,
    _=Depends(require("wallets.view")), db: AsyncSession = Depends(get_db),
):
    stmt = select(IssuedCard, User).join(User, User.id == IssuedCard.user_id)
    if status:
        stmt = stmt.where(IssuedCard.status == status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.name.ilike(like), IssuedCard.last4 == q.strip()))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(IssuedCard.created_at.desc()).limit(limit).offset(offset))).all()
    counts = dict((await db.execute(select(IssuedCard.status, func.count()).group_by(IssuedCard.status))).all())
    return {"total": total, "counts": counts, "cards": [_row(c, u) for c, u in rows]}


async def _card(db: AsyncSession, card_id: str) -> IssuedCard:
    try:
        cid = uuid.UUID(card_id)
    except ValueError as e:
        raise ApiError("Card not found", status_code=404) from e
    card = (await db.execute(select(IssuedCard).where(IssuedCard.id == cid).with_for_update())).scalar_one_or_none()
    if card is None:
        raise ApiError("Card not found", status_code=404)
    return card


@router.get("/cards/{card_id}/authorizations")
async def card_authorizations(card_id: str, _=Depends(require("wallets.view")), db: AsyncSession = Depends(get_db)):
    card = await _card(db, card_id)
    rows = (await db.execute(
        select(CardAuthorization).where(CardAuthorization.issued_card_id == card.id)
        .order_by(CardAuthorization.created_at.desc()).limit(200)
    )).scalars()
    return [{
        "id": str(a.id), "status": a.status, "amount": str(a.amount), "fee": str(a.fee), "held": str(a.held_amount),
        "captured": str(a.captured_amount), "currency": a.currency, "merchantName": a.merchant_name,
        "merchantMcc": a.merchant_mcc, "merchantCountry": a.merchant_country, "channel": a.channel,
        "declineReason": a.decline_reason, "createdAt": a.created_at.isoformat(),
    } for a in rows]


@router.post("/cards/{card_id}/freeze")
async def freeze(card_id: str, body: FreezeIn, _=Depends(require("wallets.restrict")), db: AsyncSession = Depends(get_db)):
    if not body.reason.strip():
        raise ApiError("A reason is required")
    card = await card_service.set_frozen(db, await _card(db, card_id), True, reason="admin")
    return _row(card, await db.get(User, card.user_id))


@router.post("/cards/{card_id}/unfreeze")
async def unfreeze(card_id: str, body: FreezeIn, _=Depends(require("wallets.restrict")), db: AsyncSession = Depends(get_db)):
    if not body.reason.strip():
        raise ApiError("A reason is required")
    card = await card_service.set_frozen(db, await _card(db, card_id), False, reason="admin")
    return _row(card, await db.get(User, card.user_id))


class DisputeDecision(CamelModel):
    outcome: str  # submitted | won | lost
    note: str | None = None
    issuer_dispute_id: str | None = None


@router.get("/cards/disputes")
async def list_disputes(status: str | None = Query(default=None), _=Depends(require("wallets.restrict")),
                        db: AsyncSession = Depends(get_db)):
    from app.models.cards import CardDispute

    q = select(CardDispute).order_by(CardDispute.created_at.desc()).limit(200)
    if status:
        q = q.where(CardDispute.status == status)
    return [{"id": str(d.id), "cardId": str(d.issued_card_id), "userId": str(d.user_id), "status": d.status,
             "reason": d.reason, "details": d.details, "amount": str(d.amount), "currency": d.currency,
             "issuerDisputeId": d.issuer_dispute_id, "createdAt": d.created_at, "resolvedAt": d.resolved_at}
            for d in (await db.execute(q)).scalars()]


@router.post("/cards/disputes/{dispute_id}")
async def decide_dispute(dispute_id: str, body: DisputeDecision, ctx=Depends(require("wallets.restrict")),
                         db: AsyncSession = Depends(get_db)):
    from app.cards import disputes
    from app.models.cards import CardDispute

    try:
        did = uuid.UUID(dispute_id)
    except ValueError as e:
        raise ApiError("Dispute not found", status_code=404) from e
    dispute = (await db.execute(select(CardDispute).where(CardDispute.id == did).with_for_update())).scalar_one_or_none()
    if dispute is None:
        raise ApiError("Dispute not found", status_code=404)
    d = await disputes.resolve(db, dispute, body.outcome, note=body.note, issuer_dispute_id=body.issuer_dispute_id,
                               actor=str(ctx.admin.id) if ctx.admin else "master_key")
    return {"id": str(d.id), "status": d.status}


@router.post("/cards/{card_id}/cancel")
async def cancel(card_id: str, body: FreezeIn, _=Depends(require("wallets.restrict")), db: AsyncSession = Depends(get_db)):
    if not body.reason.strip():
        raise ApiError("A reason is required")
    card = await _card(db, card_id)
    if card.overdraft_outstanding > 0:
        raise ApiError("This card has an unpaid overdraft; collect it before cancelling", status_code=409)
    card = await card_service.cancel(db, card)
    return _row(card, await db.get(User, card.user_id))
