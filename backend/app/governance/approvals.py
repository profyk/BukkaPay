"""Maker-checker for high-risk operations.

An admin *requests* an action (with a reason and evidence); a different
admin holding ``approvals.decide`` approves or rejects it. Approval runs the
action immediately, inside the approver's transaction, and records the
result. The requester can never approve their own request.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import posting
from app.models.merchant import Merchant
from app.models.platform import (
    ApprovalRequest,
    Country,
    CountryCustodian,
    PaymentCorridor,
    PaymentProvider,
    ReconciliationRun,
)
from app.models.reference import Currency
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import countries, routing


def _uuid(value, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError as e:
        raise ApiError(f"Invalid {what}") from e


# ─── executors ──────────────────────────────────────────────────────────────


async def _country_set_status(db, p):
    country = await db.get(Country, str(p["country"]).upper())
    if country is None:
        raise ApiError("Country not found", status_code=404)
    await countries.set_status(db, country, p["status"])
    return {"country": country.code, "status": country.status}


async def _country_custodian_activate(db, p):
    link = await db.get(CountryCustodian, _uuid(p["id"], "custodian link"))
    if link is None:
        raise ApiError("Custodian assignment not found", status_code=404)
    current = (await db.execute(select(CountryCustodian).where(
        CountryCustodian.country_code == link.country_code, CountryCustodian.currency_code == link.currency_code,
        CountryCustodian.role == link.role, CountryCustodian.status == "active",
        CountryCustodian.id != link.id))).scalars().first()
    if current is not None:
        # Replacing who backs existing balances: only after a clean, completed
        # reconciliation proving the balances were migrated.
        run_id = p.get("reconciliation_run_id")
        run = await db.get(ReconciliationRun, _uuid(run_id, "reconciliation run")) if run_id else None
        if run is None or run.status != "completed" or (run.summary or {}).get("exceptions", 1) != 0:
            raise ApiError("Replacing an active custodian requires a completed reconciliation run with no "
                           "exceptions (reconciliation_run_id)", status_code=409)
        current.status = "retired"
        current.effective_to = datetime.now(UTC)
    link.status = "active"
    link.effective_from = datetime.now(UTC)
    country = await db.get(Country, link.country_code)
    if link.role == "primary":
        country.custodian_ready = True
    await db.flush()
    return {"activated": str(link.id), "retired": str(current.id) if current else None}


async def _corridor_set_status(db, p):
    corridor = await db.get(PaymentCorridor, _uuid(p["id"], "corridor"))
    if corridor is None:
        raise ApiError("Corridor not found", status_code=404)
    status = p["status"]
    if status not in ("draft", "pilot", "active", "suspended"):
        raise ApiError("Invalid corridor status")
    if status in ("pilot", "active"):
        await routing.check_route(db, corridor, corridor.min_amount)
    corridor.status = status
    await db.flush()
    return {"corridor": str(corridor.id), "status": status}


async def _provider_set_mode(db, p):
    provider = await db.get(PaymentProvider, _uuid(p["id"], "provider"))
    if provider is None:
        raise ApiError("Provider not found", status_code=404)
    if "mode" in p:
        if p["mode"] not in ("sandbox", "production"):
            raise ApiError("Invalid mode")
        provider.mode = p["mode"]
    if "status" in p:
        if p["status"] not in ("inactive", "active", "degraded", "suspended"):
            raise ApiError("Invalid status")
        provider.status = p["status"]
    await db.flush()
    return {"provider": provider.code, "mode": provider.mode, "status": provider.status}


async def _currency_wallets(db, p):
    currency = await db.get(Currency, str(p["code"]).upper())
    if currency is None:
        raise ApiError("Currency not found", status_code=404)
    currency.wallet_enabled = bool(p["enabled"])
    await db.flush()
    return {"currency": currency.code, "wallet_enabled": currency.wallet_enabled}


async def _ledger_adjustment(db, p):
    amount = posting.parse_amount(p["amount"])
    direction = p["direction"]
    if direction not in ("credit", "debit"):
        raise ApiError("direction must be credit or debit")
    if p.get("wallet_card_id"):
        card = await db.get(WalletCard, _uuid(p["wallet_card_id"], "wallet"))
        if card is None:
            raise ApiError("Wallet not found", status_code=404)
        target = await ledger_accounts.wallet_account(db, card)
        currency = card.currency
    elif p.get("merchant_id"):
        merchant = await db.get(Merchant, _uuid(p["merchant_id"], "merchant"))
        if merchant is None:
            raise ApiError("Merchant not found", status_code=404)
        target = await ledger_accounts.merchant_account(db, merchant)
        currency = target.currency
    else:
        raise ApiError("wallet_card_id or merchant_id is required")
    counter = await ledger_accounts.adjustments(db, currency)
    legs = ([posting.debit(counter, amount), posting.credit(target, amount)] if direction == "credit"
            else [posting.debit(target, amount), posting.credit(counter, amount)])
    entry = await posting.post(
        db, kind="manual_adjustment", description=f"Approved adjustment: {p.get('reason', '')}"[:500],
        legs=legs, details={"approval_payload": {k: str(v) for k, v in p.items()}},
    )
    if p.get("wallet_card_id"):
        db.add(Transaction(
            user_id=card.user_id, card_id=card.id, title="Account adjustment", category="adjustment",
            amount=amount, type="credit" if direction == "credit" else "debit", icon="tool",
        ))
    await db.flush()
    return {"journal_reference": entry.reference, "amount": str(amount), "currency": currency}


async def _wallet_unblock(db, p):
    card = await db.get(WalletCard, _uuid(p["card_id"], "wallet"))
    if card is None:
        raise ApiError("Wallet not found", status_code=404)
    card.blocked = False
    await db.flush()
    return {"card_id": str(card.id), "blocked": False}


async def _user_unfreeze(db, p):
    user = await db.get(User, _uuid(p["user_id"], "user"))
    if user is None:
        raise ApiError("User not found", status_code=404)
    user.frozen = False
    await db.flush()
    return {"user_id": str(user.id), "frozen": False}


async def _treasury_rebalance(db, p):
    from app.network import treasury

    return await treasury.record_rebalance(
        db, from_currency=p["from_currency"], from_amount=posting.parse_amount(p["from_amount"]),
        to_currency=p["to_currency"], to_amount=posting.parse_amount(p["to_amount"]),
        reference=str(p.get("reference") or "")[:80] or "rebalance", actor="maker-checker",
    )


EXECUTORS = {
    "country.set_status": _country_set_status,
    "country_custodian.activate": _country_custodian_activate,
    "corridor.set_status": _corridor_set_status,
    "provider.set_mode": _provider_set_mode,
    "currency.set_wallets": _currency_wallets,
    "ledger.adjustment": _ledger_adjustment,
    "wallet.unblock": _wallet_unblock,
    "user.unfreeze": _user_unfreeze,
    "treasury.rebalance": _treasury_rebalance,
}

# Permission needed to *request* each action (approving needs approvals.decide).
REQUEST_PERMISSION = {
    "country.set_status": "network.manage",
    "country_custodian.activate": "network.manage",
    "corridor.set_status": "network.manage",
    "provider.set_mode": "network.manage",
    "currency.set_wallets": "network.manage",
    "ledger.adjustment": "ledger.adjust_request",
    "wallet.unblock": "wallets.restrict",
    "user.unfreeze": "users.freeze",
    "treasury.rebalance": "ledger.adjust_request",
}


# ─── workflow ───────────────────────────────────────────────────────────────


async def request(db: AsyncSession, ctx, *, action: str, payload: dict, reason: str,
                  evidence: list | None = None) -> ApprovalRequest:
    if action not in EXECUTORS:
        raise ApiError(f"Unknown action: {action}")
    if not ctx.can(REQUEST_PERMISSION[action]):
        raise ApiError(f"Missing permission: {REQUEST_PERMISSION[action]}", status_code=403)
    if not reason or len(reason.strip()) < 5:
        raise ApiError("A reason is required")
    if action == "ledger.adjustment":
        posting.parse_amount(payload.get("amount", ""))
        if Decimal(str(payload.get("amount"))) <= 0:
            raise ApiError("Invalid amount")
    req = ApprovalRequest(action=action, payload=payload, reason=reason.strip(), evidence=evidence or [],
                          status="pending", requested_by=ctx.admin.id if ctx.admin else None)
    db.add(req)
    await db.flush()
    await ctx.audit(db, f"approval.requested:{action}", target_type="approval", target_id=req.id,
                    details={"payload": payload, "reason": reason})
    return req


async def decide(db: AsyncSession, ctx, request_id, *, approve: bool, note: str | None = None) -> ApprovalRequest:
    if not ctx.can("approvals.decide"):
        raise ApiError("Missing permission: approvals.decide", status_code=403)
    req = (await db.execute(select(ApprovalRequest).where(ApprovalRequest.id == _uuid(request_id, "request"))
                            .with_for_update())).scalar_one_or_none()
    if req is None:
        raise ApiError("Approval request not found", status_code=404)
    if req.status != "pending":
        raise ApiError(f"Request is already {req.status}", status_code=409)
    decider = ctx.admin.id if ctx.admin else None
    if req.requested_by is not None and decider == req.requested_by:
        raise ApiError("You can't approve your own request", status_code=403)
    if req.requested_by is None and decider is None:
        raise ApiError("A request made with the master key must be approved by a named admin", status_code=403)
    req.decided_by = decider
    req.decided_at = datetime.now(UTC)
    req.decision_note = note
    if not approve:
        req.status = "rejected"
        await db.flush()
        await ctx.audit(db, f"approval.rejected:{req.action}", target_type="approval", target_id=req.id)
        return req
    try:
        async with db.begin_nested():
            result = await EXECUTORS[req.action](db, req.payload)
        req.status = "executed"
        req.result = result
    except ApiError as e:
        req.status = "failed"
        req.result = {"error": e.message}
    await db.flush()
    await ctx.audit(db, f"approval.{req.status}:{req.action}", target_type="approval", target_id=req.id,
                    details={"result": req.result})
    return req
