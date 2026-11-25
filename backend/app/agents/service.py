"""Cash agent network: cash in and cash out at local shops. No bank, no
payment partner: it all moves on BukkaPay's ledger.

An agent is a verified (KYB-approved) merchant. Its e-money float is its
merchant balance in the local currency.

Cash-in (customer hands the agent cash):
    agent merchant account(C) → customer wallet(C)              amount
    commission expense(C)     → agent merchant account(C)       commission (we pay it)
  The agent needs enough float; the customer pays nothing.

Cash-out (customer wants cash):
  1. In the app, the customer asks for an amount and gets a one-time code
     (valid 30 min). Funds are held:
       customer wallet(C) → agent:cashout_hold(C)               amount + fee
  2. At any agent in that currency, the agent enters the code, hands over
     the cash, and is credited:
       agent:cashout_hold(C) → agent merchant account(C)        amount + agent share of the fee
                             → fee revenue(C)                    our share of the fee
  Unused codes expire and the hold returns to the wallet automatically.

Codes are stored only as a keyed hash, are single use, and an agent that
enters too many wrong codes is locked out for a while.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import crypto
from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, funds, posting
from app.models.enums import NotificationType, TransactionType
from app.models.merchant import Merchant
from app.models.revenue import Agent, AgentTransaction
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import compliance, fees, limits
from app.pricing.service import get_setting
from app.services import notification_service

CENT = Decimal("0.01")


def _hash(code: str) -> str:
    return crypto.sign(f"agent-cashout:{code}")


def _ref(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5).upper()}"


async def _hold_account(db, currency: str):
    return await chart.sys_account(db, "SYS_AGENT_CASHOUT_HOLD", currency)


async def _commission_expense(db, currency: str):
    return await chart.sys_account(db, "SYS_EXPENSE_AGENT_COMMISSION", currency)


# ─── agents ─────────────────────────────────────────────────────────────────


async def apply(db: AsyncSession, merchant: Merchant, *, display_name: str, address: str, city: str | None,
                phone: str | None, opening_hours: str | None, latitude=None, longitude=None) -> Agent:
    if merchant.kyb_status != "approved":
        raise ApiError("Complete business verification before becoming a cash agent", status_code=403)
    existing = (await db.execute(select(Agent).where(Agent.merchant_id == merchant.id))).scalar_one_or_none()
    agent = existing or Agent(merchant_id=merchant.id, status="pending")
    agent.display_name = display_name.strip()[:80]
    agent.address = address.strip()[:300]
    agent.city = (city or "").strip()[:60] or None
    agent.phone = (phone or "").strip()[:20] or None
    agent.opening_hours = (opening_hours or "").strip()[:80] or None
    agent.country = merchant.country_code
    agent.currency = merchant.settlement_currency
    agent.latitude = Decimal(str(latitude)) if latitude is not None else None
    agent.longitude = Decimal(str(longitude)) if longitude is not None else None
    if existing is None:
        db.add(agent)
    await db.flush()
    return agent


async def set_status(db: AsyncSession, agent: Agent, status: str, *, actor: str) -> Agent:
    if status not in ("active", "suspended", "pending"):
        raise ApiError("status must be active, suspended or pending")
    agent.status = status
    if status == "active":
        agent.approved_at, agent.approved_by = datetime.now(UTC), actor
    await db.flush()
    return agent


async def agent_for_merchant(db: AsyncSession, merchant: Merchant, *, require_active: bool = True) -> Agent:
    agent = (await db.execute(select(Agent).where(Agent.merchant_id == merchant.id))).scalar_one_or_none()
    if agent is None:
        raise ApiError("This business isn't a BukkaPay cash agent yet", status_code=404)
    if require_active and agent.status != "active":
        raise ApiError("Your cash agent account isn't active", status_code=403)
    return agent


async def volume_today(db, agent: Agent) -> Decimal:
    since = datetime.now(UTC) - timedelta(days=1)
    return Decimal((await db.execute(select(func.coalesce(func.sum(AgentTransaction.amount), 0)).where(
        AgentTransaction.agent_id == agent.id, AgentTransaction.status == "completed",
        AgentTransaction.completed_at >= since))).scalar_one())


async def nearby(db: AsyncSession, *, country: str | None, city: str | None) -> list[Agent]:
    q = select(Agent).where(Agent.status == "active").order_by(Agent.city, Agent.display_name).limit(100)
    if country:
        q = q.where(Agent.country == country.upper())
    if city:
        q = q.where(func.lower(Agent.city) == city.strip().lower())
    return list((await db.execute(q)).scalars())


# ─── cash-in ────────────────────────────────────────────────────────────────


async def cash_in(db: AsyncSession, agent: Agent, *, customer: User, amount: Decimal, served_by) -> AgentTransaction:
    if amount <= 0:
        raise ApiError("Enter an amount")
    if customer.frozen or customer.deleted_at is not None:
        raise ApiError("This customer's account can't receive money", status_code=403)
    from app.services.wallet_service import get_or_create_currency_card

    wallet = await get_or_create_currency_card(db, customer.id, agent.currency)
    await limits.check(db, customer, "funding", amount, currency=agent.currency, country=customer.residence_country)
    if await volume_today(db, agent) + amount > agent.daily_limit:
        raise ApiError("This agent has reached today's limit", status_code=409)
    policy = await get_setting(db, "agents")
    commission = (amount * Decimal(policy["cash_in_commission_bps"]) / Decimal(10_000)).quantize(CENT, ROUND_HALF_UP)
    merchant = await db.get(Merchant, agent.merchant_id)
    agent_acct = await ledger_accounts.merchant_account(db, merchant, agent.currency)
    legs = [posting.debit(agent_acct, amount), posting.credit(await ledger_accounts.wallet_account(db, wallet), amount)]
    if commission > 0:
        legs += [posting.debit(await _commission_expense(db, agent.currency), commission),
                 posting.credit(agent_acct, commission)]
    try:
        entry = await posting.post(db, kind="agent_cash_in", description=f"Cash-in at {agent.display_name}", legs=legs,
                                   details={"agent_id": str(agent.id), "customer_id": str(customer.id)})
    except posting.InsufficientFunds as e:
        raise ApiError("Your agent float is too low for this cash-in. Top up your BukkaPay business balance first.",
                       status_code=402) from e
    tx = AgentTransaction(reference=_ref("CI"), kind="cash_in", status="completed", agent_id=agent.id, user_id=customer.id,
                          wallet_card_id=wallet.id, currency=agent.currency, amount=amount, fee=Decimal(0),
                          commission=commission, journal_entry_id=entry.id, served_by=served_by,
                          completed_at=datetime.now(UTC), details={})
    db.add(tx)
    db.add(Transaction(user_id=customer.id, card_id=wallet.id, title=f"Cash deposit at {agent.display_name}",
                       category="topup", amount=amount, type=TransactionType.CREDIT, icon="cash"))
    await notification_service.create_notification(
        db, customer.id, NotificationType.SUCCESS, "Cash deposited",
        f"{agent.currency} {amount:.2f} added to your wallet at {agent.display_name}. Ref {tx.reference}.",
        related_type="transfer",
    )
    await compliance.evaluate(db, user=customer, amount=amount, currency=agent.currency, kind="agent_cash_in",
                              reference=tx.reference)
    await db.flush()
    return tx


# ─── cash-out ───────────────────────────────────────────────────────────────


async def quote_cash_out(db: AsyncSession, user: User, wallet: WalletCard, amount: Decimal) -> Decimal:
    return (await fees.compute(db, "cash_out", amount, currency=wallet.currency, country=user.residence_country)).fee


async def request_cash_out(db: AsyncSession, user: User, wallet: WalletCard, amount: Decimal) -> tuple[AgentTransaction, str]:
    """Returns the transaction and the one-time code (shown once, never stored)."""
    if amount <= 0:
        raise ApiError("Enter an amount")
    if (user.kyc_level or 0) < 1:
        raise ApiError("Verify your identity to withdraw cash", status_code=403)
    await limits.check(db, user, "withdrawal", amount, currency=wallet.currency, country=user.residence_country)
    fee = await quote_cash_out(db, user, wallet, amount)
    await funds.require(db, wallet, amount + fee, what="withdraw cash")
    policy = await get_setting(db, "agents")
    entry = await posting.post(
        db, kind="agent_cash_out_hold", description="Cash-out code issued",
        legs=[posting.debit(await ledger_accounts.wallet_account(db, wallet), amount + fee),
              posting.credit(await _hold_account(db, wallet.currency), amount + fee)],
        details={"user_id": str(user.id)},
    )
    while True:  # 8 digits; retry on the (tiny) chance of a live collision
        code = f"{secrets.randbelow(10**8):08d}"
        clash = (await db.execute(select(AgentTransaction.id).where(AgentTransaction.code_hash == _hash(code)))).first()
        if not clash:
            break
    tx = AgentTransaction(reference=_ref("CO"), kind="cash_out", status="pending", user_id=user.id, wallet_card_id=wallet.id,
                          currency=wallet.currency, amount=amount, fee=fee, code_hash=_hash(code), hold_entry_id=entry.id,
                          expires_at=datetime.now(UTC) + timedelta(minutes=policy["code_ttl_minutes"]),
                          details={"attempts": 0})
    db.add(tx)
    db.add(Transaction(user_id=user.id, card_id=wallet.id, title="Cash withdrawal (code issued)", category="withdrawal",
                       amount=amount + fee, type=TransactionType.DEBIT, icon="cash", fee_amount=fee or None))
    await db.flush()
    return tx, code


LOCKOUT_SECONDS = 15 * 60


async def _wrong_code(agent: Agent) -> None:
    """Counts wrong codes per agent; past the limit the agent is locked out
    for LOCKOUT_SECONDS (8-digit codes can't be guessed in a few tries)."""
    from app.core.redis import get_redis

    redis = get_redis()
    key = f"agent:wrong_codes:{agent.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, LOCKOUT_SECONDS)


async def _locked_out(agent: Agent, max_attempts: int) -> bool:
    from app.core.redis import get_redis

    count = await get_redis().get(f"agent:wrong_codes:{agent.id}")
    return int(count or 0) >= max_attempts


async def complete_cash_out(db: AsyncSession, agent: Agent, *, code: str, served_by) -> AgentTransaction:
    policy = await get_setting(db, "agents")
    if await _locked_out(agent, policy["max_code_attempts"]):
        raise ApiError("Too many wrong codes. Try again in 15 minutes.", status_code=429)
    code = "".join(c for c in (code or "") if c.isdigit())
    tx = (await db.execute(select(AgentTransaction).where(AgentTransaction.code_hash == _hash(code))
                           .with_for_update())).scalar_one_or_none() if len(code) == 8 else None
    if tx is None or tx.kind != "cash_out":
        await _wrong_code(agent)
        raise ApiError("That code isn't valid. Check it with the customer.", status_code=404)
    if tx.status != "pending":
        raise ApiError("This code has already been used or cancelled", status_code=409)
    if tx.expires_at and tx.expires_at < datetime.now(UTC):
        # (the expiry job returns the money; this request changes nothing)
        raise ApiError("This code has expired. The customer's money goes back to their wallet.", status_code=410)
    if tx.currency != agent.currency:
        raise ApiError(f"This withdrawal is in {tx.currency}; you can only pay out {agent.currency}", status_code=409)
    if await volume_today(db, agent) + tx.amount > agent.daily_limit:
        raise ApiError("You've reached today's cash-out limit", status_code=409)
    agent_share = (tx.fee * Decimal(policy["cash_out_agent_share_pct"]) / 100).quantize(CENT, ROUND_HALF_UP)
    ours = tx.fee - agent_share
    merchant = await db.get(Merchant, agent.merchant_id)
    legs = [posting.debit(await _hold_account(db, tx.currency), tx.amount + tx.fee),
            posting.credit(await ledger_accounts.merchant_account(db, merchant, tx.currency), tx.amount + agent_share)]
    if ours > 0:
        legs.append(posting.credit(await chart.sys_account(db, "SYS_REVENUE_CASHOUT", tx.currency), ours))
    entry = await posting.post(db, kind="agent_cash_out", description=f"Cash-out at {agent.display_name}", legs=legs,
                               details={"agent_id": str(agent.id), "reference": tx.reference})
    tx.status, tx.agent_id, tx.commission, tx.journal_entry_id = "completed", agent.id, agent_share, entry.id
    tx.served_by, tx.completed_at = served_by, datetime.now(UTC)
    tx.code_hash = None  # single use: the code can never match again
    await notification_service.create_notification(
        db, tx.user_id, NotificationType.SUCCESS, "Cash collected",
        f"You collected {tx.currency} {tx.amount:.2f} at {agent.display_name}. Ref {tx.reference}.",
        related_type="transfer",
    )
    customer = await db.get(User, tx.user_id)
    await compliance.evaluate(db, user=customer, amount=tx.amount, currency=tx.currency, kind="agent_cash_out",
                              reference=tx.reference)
    await db.flush()
    return tx


async def cancel_cash_out(db: AsyncSession, user: User, tx_id: str) -> AgentTransaction:
    try:
        tid = uuid.UUID(tx_id)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e
    tx = (await db.execute(select(AgentTransaction).where(AgentTransaction.id == tid, AgentTransaction.user_id == user.id)
                           .with_for_update())).scalar_one_or_none()
    if tx is None:
        raise ApiError("Not found", status_code=404)
    if tx.status == "pending":
        await _release(db, tx, "cancelled")
    return tx


async def _release(db: AsyncSession, tx: AgentTransaction, status: str) -> None:
    from app.models.ledger import JournalEntry

    hold = await db.get(JournalEntry, tx.hold_entry_id)
    await posting.reverse(db, hold, description=f"Cash-out {tx.reference} {status}: refunded")
    tx.status, tx.code_hash = status, None
    db.add(Transaction(user_id=tx.user_id, card_id=tx.wallet_card_id, title="Cash withdrawal refunded",
                       category="refund", amount=tx.amount + tx.fee, type=TransactionType.CREDIT, icon="refresh-cw"))
    await db.flush()


async def expire_codes(db: AsyncSession, *, limit: int = 500) -> int:
    rows = (await db.execute(select(AgentTransaction).where(AgentTransaction.status == "pending",
                                                            AgentTransaction.expires_at < datetime.now(UTC))
                             .limit(limit).with_for_update(skip_locked=True))).scalars().all()
    for tx in rows:
        await _release(db, tx, "expired")
    return len(rows)
