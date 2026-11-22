"""JIT virtual card webhooks for Card-as-a-Service issuers (Onafriq, EFT
Corporation, …), at the paths issuers are given:

    POST /webhooks/card/auth     authorisation: approve/decline + atomic hold
    POST /webhooks/card/settle   clearing: the held amount becomes final spend
    POST /webhooks/card/reverse  reversal: the hold is released to the wallet

The issuer is named in the `X-Card-Issuer` header; every body is signed
(`X-Card-Issuer-Signature`, HMAC of the raw body). Settle and reverse carry
an `eventId` and are processed exactly once (stored in provider_webhooks).
`/auth` always answers with a decision, never an error, and does no network
calls — a ledger hold under row locks — to stay well inside issuers' ~100 ms
budget.
"""

import json

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import cards as card_api
from app.cards import issuers
from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.platform import ProviderWebhook

router = APIRouter(prefix="/webhooks/card", tags=["card-webhooks"])


@router.post("/auth")
async def card_auth(request: Request, db: AsyncSession = Depends(get_db),
                    issuer: str = Header(alias="X-Card-Issuer"),
                    signature: str | None = Header(default=None, alias="X-Card-Issuer-Signature")) -> dict:
    return await card_api.issuer_authorize(issuer, request, db, signature)


async def _once(request: Request, db: AsyncSession, issuer_code: str, signature: str | None, event_type: str) -> dict:
    issuer = card_api._issuer_or_404(issuer_code)
    body = await request.body()
    if not issuers.verify(issuer, body, signature):
        raise ApiError("Invalid signature", status_code=401)
    try:
        data = json.loads(body)
        event_id = str(data["eventId"])
    except (ValueError, KeyError, TypeError) as e:
        raise ApiError("Malformed event: eventId is required", status_code=400) from e
    inserted = (await db.execute(
        insert(ProviderWebhook)
        .values(provider=f"card:{issuer.code}", event_id=event_id, event_type=event_type, signature_valid=True,
                payload=data, status="received", attempts=1)
        .on_conflict_do_nothing(constraint="uq_provider_webhooks_event")
        .returning(ProviderWebhook.id))).scalar_one_or_none()
    if inserted is None:
        return {"status": "duplicate", "eventId": event_id}
    record = await db.get(ProviderWebhook, inserted)
    try:
        async with db.begin_nested():
            handled = await card_api._apply_event(db, issuer.code, event_type, data)
        record.status = "processed" if handled else "ignored"
    except (ApiError, KeyError) as e:
        record.status, record.error = "failed", getattr(e, "message", str(e))[:500]
    await db.flush()
    return {"status": record.status, "eventId": event_id}


@router.post("/settle")
async def card_settle(request: Request, db: AsyncSession = Depends(get_db),
                      issuer: str = Header(alias="X-Card-Issuer"),
                      signature: str | None = Header(default=None, alias="X-Card-Issuer-Signature")) -> dict:
    return await _once(request, db, issuer, signature, "transaction.cleared")


@router.post("/reverse")
async def card_reverse(request: Request, db: AsyncSession = Depends(get_db),
                       issuer: str = Header(alias="X-Card-Issuer"),
                       signature: str | None = Header(default=None, alias="X-Card-Issuer-Signature")) -> dict:
    return await _once(request, db, issuer, signature, "authorization.reversed")
