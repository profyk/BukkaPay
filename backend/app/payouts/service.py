"""Cross-border payouts: quote → confirm → execute → status → reconcile.

Ledger (W = sender's wallet currency, R = recipient currency; all amounts
converted exactly from minor units):

  confirm   wallet(W)            → payout:in_transit(W)     send + fee
  paid      payout:in_transit(W) → fees(W)                  fee
                                 → FX pool(W) ⇢ FX pool(R)  send → receive (+ our spread, FX revenue R)
                                 → payout:float:<rail>(R)   receive   (money the rail paid out for us)
  failed    payout:in_transit(W) → wallet(W)                everything back, automatically
  returned  mirror of `paid`, then of `confirm`             everything back

In-network: if the recipient's mobile number belongs to a BukkaPay
customer, there's no rail at all. The same quote and confirm book straight
into their wallet (rail "internal", no fee), instantly.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.money import Minor
from app.core.state_machine import InvalidTransition
from app.governance import audit
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, funds, posting
from app.models.enums import NotificationType, TransactionType
from app.models.payouts import Payout, PayoutRecipient
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees, limits, outbox
from app.payouts import rails as rails_mod
from app.payouts.states import PAYOUT
from app.services import notification_service

INTERNAL = "internal"
MIN_KYC_LEVEL = 2


def _dec(amount: int, currency: str) -> Decimal:
    return Minor(amount, currency).to_decimal()


def _minor(value: Decimal, currency: str) -> int:
    return Minor.from_decimal(posting.money(value), currency).amount


async def _in_transit(db, currency: str):
    return await ledger_accounts.system_account(db, f"payout:in_transit:{currency}", f"Payouts in transit ({currency})",
                                                "liability", currency)


async def _float(db, rail: str, currency: str):
    # Money we hold at (or owe to) the rail for payouts; reconciliation owns it.
    return await ledger_accounts.system_account(db, f"payout:float:{rail}:{currency}", f"{rail} payout float ({currency})",
                                                "asset", currency, allow_negative=True)


async def _in_network_user(db, recipient: PayoutRecipient, sender_id) -> User | None:
    if recipient.method != "mobile_wallet" or not recipient.msisdn:
        return None
    user = (await db.execute(select(User).where(User.phone == recipient.msisdn, User.deleted_at.is_(None),
                                                User.frozen.is_(False)))).scalars().first()
    return user if user is not None and user.id != sender_id else None


# ─── quote ──────────────────────────────────────────────────────────────────


async def quote(db: AsyncSession, user: User, *, source_wallet_id: str, recipient_id: str, amount: int,
                side: str = "send", purpose: str | None = None) -> Payout:
    if amount <= 0:
        raise ApiError("Enter an amount")
    wallet = await _own_wallet(db, user, source_wallet_id)
    recipient = await _own_recipient(db, user, recipient_id)
    w_ccy, r_ccy = wallet.currency, recipient.currency
    internal = await _in_network_user(db, recipient, user.id)
    rail_code = INTERNAL if internal else get_settings().payout_rail

    from app.services import swap_service

    rate = None
    spread = 0
    if side == "send":
        send = amount
        if w_ccy == r_ccy:
            receive = send
        else:
            q = await swap_service.quote(db, w_ccy, r_ccy, _dec(send, w_ccy))
            receive, spread, rate = _minor(q.receive, r_ccy), _minor(q.spread, r_ccy), q.rate
    elif side == "receive":
        receive = amount
        if w_ccy == r_ccy:
            send = receive
        else:
            q = await swap_service.quote_for_target(db, w_ccy, r_ccy, _dec(receive, r_ccy))
            send, spread, rate = _minor(q.amount, w_ccy), _minor(q.spread, r_ccy), q.rate
    else:
        raise ApiError("side must be send or receive")
    if receive <= 0:
        raise ApiError("Amount is too small")

    fee = 0
    if not internal:
        fee = _minor((await fees.compute(db, "payout", _dec(send, w_ccy), currency=w_ccy, country=user.residence_country,
                                         method=recipient.method)).fee, w_ccy)
        try:  # ask the rail early: a corridor it can't serve fails here, not after money moved
            await rails_mod.configured().quote(send=Minor(send, w_ccy), receive_currency=r_ccy,
                                               country=recipient.country, method=recipient.method)
        except rails_mod.RailUnavailable as e:
            raise ApiError("Payouts to this country are temporarily unavailable", status_code=503) from e
    await limits.check(db, user, "cross_border", _dec(send + fee, w_ccy), currency=w_ccy, country=user.residence_country)

    payout = Payout(
        reference="PO-" + secrets.token_hex(5).upper(), idempotency_key="po_" + uuid.uuid4().hex,
        user_id=user.id, source_wallet_id=wallet.id, recipient_id=recipient.id, rail=rail_code, status="quoted",
        country=recipient.country, method=recipient.method, send_currency=w_ccy, send_amount=send, fee_amount=fee,
        receive_currency=r_ccy, receive_amount=receive, fx_rate=rate, fx_spread_amount=spread,
        quote_expires_at=datetime.now(UTC) + timedelta(seconds=get_settings().payout_quote_ttl_seconds),
        purpose=(purpose or "")[:40] or None,
    )
    db.add(payout)
    await db.flush()
    return payout


# ─── confirm ────────────────────────────────────────────────────────────────


async def confirm(db: AsyncSession, user: User, payout_id: str) -> Payout:
    payout = await _lock(db, payout_id, user_id=user.id)
    if payout.status != "quoted":
        return payout  # replayed confirm: same answer, never a second debit
    if payout.quote_expires_at <= datetime.now(UTC):
        # (the expiry job marks it `expired`; this request changes nothing)
        raise ApiError("This quote has expired. Get a new quote to lock today's rate.", status_code=409)
    if user.frozen:
        raise ApiError("Your account is restricted", status_code=403)
    if (user.kyc_level or 0) < MIN_KYC_LEVEL:
        raise ApiError("Verify your identity to send money abroad", status_code=403)
    recipient = await db.get(PayoutRecipient, payout.recipient_id)
    if payout.rail != INTERNAL:
        from app.payouts.validation import required_extra

        for f in required_extra(payout.country, payout.method):
            if f == "purpose" and not payout.purpose:
                raise ApiError("Choose the reason for this payment")
        await _screen_recipient(db, user, recipient)
    wallet = (await db.execute(select(WalletCard).where(WalletCard.id == payout.source_wallet_id).with_for_update())
              ).scalar_one()
    total = payout.send_amount + payout.fee_amount
    await limits.check(db, user, "cross_border", _dec(total, payout.send_currency), currency=payout.send_currency,
                       country=user.residence_country)
    await funds.require(db, wallet, _dec(total, payout.send_currency), what="send this payment")
    entry = await posting.post(
        db, kind="payout_debit", description=f"Payout {payout.reference} to {recipient.first_name} {recipient.last_name}",
        legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), _dec(total, payout.send_currency)),
              posting.credit(await _in_transit(db, payout.send_currency), _dec(total, payout.send_currency))],
        details={"payout_id": str(payout.id), "reference": payout.reference, "sender_id": str(user.id)},
    )
    payout.debit_entry_id = entry.id
    payout.confirmed_at = datetime.now(UTC)
    await PAYOUT.move(db, payout, "confirmed", actor=str(user.id))
    db.add(Transaction(
        user_id=user.id, card_id=wallet.id, title=f"Sent to {recipient.first_name} {recipient.last_name} ({payout.country})",
        category="transfer", amount=_dec(total, payout.send_currency), type=TransactionType.DEBIT, icon="send",
        fee_amount=_dec(payout.fee_amount, payout.send_currency) or None, destination_country_code=payout.country,
    ))
    from app.network import compliance

    await compliance.evaluate(db, user=user, amount=_dec(total, payout.send_currency), currency=payout.send_currency,
                              kind="cross_border", reference=payout.reference, country=payout.country)
    if payout.rail == INTERNAL:
        await _settle_internal(db, payout, recipient)
    else:
        await outbox.enqueue(db, "payout.execute", {"payout_id": str(payout.id)})
    await db.flush()
    return payout


async def _screen_recipient(db, user: User, recipient: PayoutRecipient) -> None:
    """Sanctions hook: a confident hit blocks the payout and opens a case."""
    from app.models.platform import ComplianceCase
    from app.network import screening

    outcome = await screening.screen(name=f"{recipient.first_name} {recipient.last_name}", kind="person",
                                     country=recipient.country)
    if outcome.sanctions in ("match", "potential_match"):
        db.add(ComplianceCase(user_id=user.id, title=f"Payout recipient screening: {outcome.sanctions}", status="open",
                              priority="high", notes=[], evidence=[{"recipient_id": str(recipient.id),
                                                                    "hits": [h.__dict__ for h in outcome.hits]}]))
        await db.flush()
        raise ApiError("We need to review this recipient before you can pay them. Our team will be in touch.",
                       status_code=403)


# ─── execute (worker) ───────────────────────────────────────────────────────


async def execute(db: AsyncSession, payout_id: str) -> None:
    """Outbox handler. Sends the instruction with our idempotency key, so a
    retry after a timeout can never pay twice. Definitive refusal → reverse;
    unknown outcome → raise, the outbox retries with backoff."""
    payout = await _lock(db, payout_id)
    if payout.status != "confirmed":
        return
    recipient = await db.get(PayoutRecipient, payout.recipient_id)
    user = await db.get(User, payout.user_id)
    rail = rails_mod.by_code(payout.rail)
    instruction = rails_mod.PayoutInstruction(
        idempotency_key=payout.idempotency_key, reference=payout.reference,
        send=Minor(payout.send_amount, payout.send_currency), receive=Minor(payout.receive_amount, payout.receive_currency),
        beneficiary=rails_mod.Beneficiary(
            country=recipient.country, currency=recipient.currency, method=recipient.method,
            first_name=recipient.first_name, last_name=recipient.last_name, bank_code=recipient.bank_code,
            branch_code=recipient.branch_code, account_number=recipient.account_number, msisdn=recipient.msisdn,
            operator=recipient.operator, extra=recipient.extra or {}),
        sender=rails_mod.Sender(user_id=str(user.id), full_name=user.kyc_full_name or user.name,
                                country=user.residence_country or "", msisdn=user.phone),
        purpose=payout.purpose,
    )
    payout.attempts += 1
    try:
        result = await rail.create_payout(instruction)
    except rails_mod.RailRejected as e:
        await _fail(db, payout, str(e))
        return
    payout.provider_reference = result.provider_reference
    await PAYOUT.move(db, payout, "submitted")
    if result.status == "paid":
        await _settle(db, payout)
    await db.flush()


# ─── status events ──────────────────────────────────────────────────────────


async def apply_event(db: AsyncSession, rail_code: str, event: rails_mod.StatusEvent) -> str:
    """Returns processed | ignored | late. Duplicates never reach here
    (event ids are stored once); late or out-of-order events are refused by
    the state machine and flagged for operations instead of moving money."""
    payout = (await db.execute(select(Payout).where(Payout.rail == rail_code,
                                                    Payout.provider_reference == event.provider_reference)
                               .with_for_update())).scalar_one_or_none()
    if payout is None:
        return "ignored"
    try:
        if event.status == "processing":
            await PAYOUT.move(db, payout, "processing")
        elif event.status == "paid":
            if payout.status != "paid":
                await _settle(db, payout)
        elif event.status == "failed":
            await _fail(db, payout, event.reason or "The payout failed at the recipient's bank or wallet")
        elif event.status == "returned":
            await _return(db, payout, event.reason)
        else:
            return "ignored"
    except InvalidTransition as e:
        await audit.record(db, actor_type="system", actor_id=None, actor_email=None, action="payout.late_event",
                           target_type="payout", target_id=str(payout.id),
                           details={"event": event.status, "current": e.current, "event_id": event.event_id})
        return "late"
    await db.flush()
    return "processed"


async def _settle(db: AsyncSession, payout: Payout) -> None:
    w, r = payout.send_currency, payout.receive_currency
    send, fee, receive, spread = (_dec(payout.send_amount, w), _dec(payout.fee_amount, w),
                                  _dec(payout.receive_amount, r), _dec(payout.fx_spread_amount, r))
    legs = [posting.debit(await _in_transit(db, w), send + fee)]
    if fee > 0:
        legs.append(posting.credit(await ledger_accounts.fee_revenue(db, w), fee))
    if w == r:
        legs.append(posting.credit(await _float(db, payout.rail, r), receive))
    else:
        legs += [
            posting.credit(await chart.sys_account(db, "SYS_FX_POOL", w), send),
            posting.debit(await chart.sys_account(db, "SYS_FX_POOL", r), receive + spread),
            posting.credit(await _float(db, payout.rail, r), receive),
        ]
        if spread > 0:
            legs.append(posting.credit(await chart.sys_account(db, "SYS_REVENUE_FX", r), spread))
    entry = await posting.post(db, kind="payout_settlement", description=f"Payout {payout.reference} paid", legs=legs,
                               details={"payout_id": str(payout.id), "provider_reference": payout.provider_reference})
    payout.settle_entry_id = entry.id
    payout.completed_at = datetime.now(UTC)
    await PAYOUT.move(db, payout, "paid")
    recipient = await db.get(PayoutRecipient, payout.recipient_id)
    await notification_service.create_notification(
        db, payout.user_id, NotificationType.SUCCESS, "Money delivered",
        f"{recipient.first_name} received {payout.receive_currency} {receive:.2f}.",
        related_id=str(payout.id), related_type="payout",
    )


async def _settle_internal(db: AsyncSession, payout: Payout, recipient: PayoutRecipient) -> None:
    """In-network: straight into the recipient's BukkaPay wallet. No rail, no fee."""
    from app.services.wallet_service import get_or_create_currency_card

    target_user = await _in_network_user(db, recipient, payout.user_id)
    if target_user is None:  # the number changed hands since the quote: refund
        await _fail(db, payout, "The recipient's BukkaPay account is no longer available")
        return
    w, r = payout.send_currency, payout.receive_currency
    send, receive, spread = _dec(payout.send_amount, w), _dec(payout.receive_amount, r), _dec(payout.fx_spread_amount, r)
    target = await get_or_create_currency_card(db, target_user.id, r)
    legs = [posting.debit(await _in_transit(db, w), send)]
    if w == r:
        legs.append(posting.credit(await ledger_accounts.wallet_account(db, target), receive))
    else:
        legs += [posting.credit(await chart.sys_account(db, "SYS_FX_POOL", w), send),
                 posting.debit(await chart.sys_account(db, "SYS_FX_POOL", r), receive + spread),
                 posting.credit(await ledger_accounts.wallet_account(db, target), receive)]
        if spread > 0:
            legs.append(posting.credit(await chart.sys_account(db, "SYS_REVENUE_FX", r), spread))
    entry = await posting.post(db, kind="payout_internal", description=f"In-network transfer {payout.reference}",
                               legs=legs, details={"payout_id": str(payout.id), "recipient_id": str(target_user.id)})
    payout.settle_entry_id = entry.id
    payout.provider_reference = payout.reference
    payout.completed_at = datetime.now(UTC)
    await PAYOUT.move(db, payout, "submitted", reason="in_network")
    await PAYOUT.move(db, payout, "paid", reason="in_network")
    db.add(Transaction(user_id=target_user.id, card_id=target.id, title="Money received", category="transfer",
                       amount=receive, type=TransactionType.CREDIT, icon="send"))
    await notification_service.create_notification(
        db, target_user.id, NotificationType.SUCCESS, "Money received",
        f"You received {r} {receive:.2f} on BukkaPay.", related_type="transfer",
    )


async def _fail(db: AsyncSession, payout: Payout, reason: str) -> None:
    await PAYOUT.move(db, payout, "failed", reason=reason[:200])
    payout.failure_reason = reason[:500]
    await _refund(db, payout, "failed")


async def _return(db: AsyncSession, payout: Payout, reason: str | None) -> None:
    await PAYOUT.move(db, payout, "returned", reason=reason)
    payout.failure_reason = (reason or "Returned by the recipient's bank or wallet")[:500]
    from app.models.ledger import JournalEntry

    settle = await db.get(JournalEntry, payout.settle_entry_id)
    await posting.reverse(db, settle, description=f"Payout {payout.reference} returned")
    await _refund(db, payout, "returned")


async def _refund(db: AsyncSession, payout: Payout, why: str) -> None:
    """Automatic: the whole amount, fee included, back to the sender's wallet."""
    from app.models.ledger import JournalEntry

    debit = await db.get(JournalEntry, payout.debit_entry_id)
    entry = await posting.reverse(db, debit, description=f"Payout {payout.reference} {why}: refunded")
    payout.reverse_entry_id = entry.id
    await PAYOUT.move(db, payout, "reversed", reason=why)
    total = _dec(payout.send_amount + payout.fee_amount, payout.send_currency)
    db.add(Transaction(user_id=payout.user_id, card_id=payout.source_wallet_id, title="Transfer refunded",
                       category="refund", amount=total, type=TransactionType.CREDIT, icon="refresh-cw"))
    await notification_service.create_notification(
        db, payout.user_id, NotificationType.WARNING, "Transfer refunded",
        f"Your transfer {payout.reference} couldn't be delivered ({payout.failure_reason}). "
        f"{payout.send_currency} {total:.2f} is back in your wallet.",
        related_id=str(payout.id), related_type="payout",
    )


# ─── housekeeping & reconciliation ──────────────────────────────────────────


async def expire_quotes(db: AsyncSession, *, limit: int = 500) -> int:
    rows = (await db.execute(select(Payout).where(Payout.status == "quoted", Payout.quote_expires_at < datetime.now(UTC))
                             .limit(limit).with_for_update(skip_locked=True))).scalars().all()
    for p in rows:
        await PAYOUT.move(db, p, "expired", reason="quote_ttl")
    await db.flush()
    return len(rows)


async def reconcile(db: AsyncSession, rail_code: str, day: date, *, started_by: str = "system:daily") -> dict:
    """Compare the rail's statement for `day` with our paid/returned payouts."""
    from app.models.platform import ReconciliationItem, ReconciliationRun

    run = ReconciliationRun(kind="payout_statement", provider=rail_code, status="running", started_by=started_by, summary={})
    db.add(run)
    await db.flush()
    try:
        lines = await rails_mod.by_code(rail_code).statement(day)
    except rails_mod.RailUnavailable as e:
        run.status, run.summary, run.finished_at = "failed", {"error": str(e)[:300]}, datetime.now(UTC)
        await db.flush()
        return run.summary
    start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    ours = {p.provider_reference: p for p in (await db.execute(
        select(Payout).where(Payout.rail == rail_code, Payout.completed_at >= start,
                             Payout.completed_at < start + timedelta(days=1),
                             Payout.status.in_(("paid", "returned", "reversed")))
    )).scalars() if p.provider_reference}
    counts = {"matched": 0, "amount_mismatch": 0, "unmatched_provider": 0, "unmatched_ledger": 0}
    seen = set()
    for line in lines:
        p = ours.get(line.provider_reference)
        seen.add(line.provider_reference)
        if p is None:
            result = "unmatched_provider"
        elif line.amount != Minor(p.receive_amount, p.receive_currency):
            result = "amount_mismatch"
        else:
            result = "matched"
        counts[result] += 1
        if result != "matched":
            db.add(ReconciliationItem(run_id=run.id, result=result, reference=line.provider_reference,
                                      ledger_amount=_dec(p.receive_amount, p.receive_currency) if p else None,
                                      provider_amount=line.amount.to_decimal(), currency=line.amount.currency,
                                      details={"status": line.status, "payout_id": str(p.id) if p else None}))
    for ref, p in ours.items():
        if ref not in seen and p.status == "paid":
            counts["unmatched_ledger"] += 1
            db.add(ReconciliationItem(run_id=run.id, result="unmatched_ledger", reference=ref,
                                      ledger_amount=_dec(p.receive_amount, p.receive_currency), currency=p.receive_currency,
                                      details={"payout_id": str(p.id)}))
    run.status, run.summary, run.finished_at = "completed", {"day": day.isoformat(), **counts}, datetime.now(UTC)
    await db.flush()
    return run.summary


# ─── helpers ────────────────────────────────────────────────────────────────


async def _lock(db, payout_id: str, *, user_id=None) -> Payout:
    try:
        pid = uuid.UUID(str(payout_id))
    except ValueError as e:
        raise ApiError("Transfer not found", status_code=404) from e
    q = select(Payout).where(Payout.id == pid).with_for_update()
    if user_id is not None:
        q = q.where(Payout.user_id == user_id)
    payout = (await db.execute(q)).scalar_one_or_none()
    if payout is None:
        raise ApiError("Transfer not found", status_code=404)
    return payout


async def _own_wallet(db, user: User, wallet_id: str) -> WalletCard:
    from app.services.wallet_service import get_wallet_card

    wallet = await get_wallet_card(db, str(wallet_id), user.id)
    if wallet is None:
        raise ApiError("Wallet not found", status_code=404)
    if wallet.frozen or wallet.blocked or wallet.flagged:
        raise ApiError("This wallet is restricted", status_code=403)
    return wallet


async def _own_recipient(db, user: User, recipient_id: str) -> PayoutRecipient:
    try:
        rid = uuid.UUID(str(recipient_id))
    except ValueError as e:
        raise ApiError("Recipient not found", status_code=404) from e
    r = (await db.execute(select(PayoutRecipient).where(PayoutRecipient.id == rid, PayoutRecipient.user_id == user.id,
                                                        PayoutRecipient.deleted_at.is_(None)))).scalar_one_or_none()
    if r is None:
        raise ApiError("Recipient not found", status_code=404)
    return r
