"""The only code allowed to change a balance.

``post()`` takes a list of debit/credit legs, checks they balance per
currency, locks every affected account (and linked wallet card) in a fixed
order to avoid deadlocks, rejects the entry if a non-negative account would
go below zero, then writes the journal and updates the cached balances —
all inside the caller's database transaction. If anything later in that
transaction fails, the whole posting rolls back with it.
"""

import secrets
import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.ledger import DEBIT_NORMAL_TYPES, JournalEntry, JournalLine, LedgerAccount
from app.models.wallet import WalletCard

CENT = Decimal("0.01")


class InsufficientFunds(ApiError):
    def __init__(self, message: str = "Insufficient balance"):
        super().__init__(message, status_code=400)


class LedgerError(Exception):
    """A programming error: an unbalanced or malformed posting. Never shown
    to customers as a business error."""


@dataclass(frozen=True)
class Leg:
    account: LedgerAccount
    debit: Decimal = Decimal(0)
    credit: Decimal = Decimal(0)


def debit(account: LedgerAccount, amount: Decimal) -> Leg:
    return Leg(account=account, debit=amount)


def credit(account: LedgerAccount, amount: Decimal) -> Leg:
    return Leg(account=account, credit=amount)


def money(value: Decimal | str | int) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def parse_amount(value, *, field: str = "amount") -> Decimal:
    """Parse a client-supplied money amount: positive, at most 2 decimals."""
    try:
        parsed = Decimal(str(value).strip())
    except Exception as e:  # noqa: BLE001 — any parse failure is a client error
        raise ApiError(f"Invalid {field}") from e
    if not parsed.is_finite() or parsed <= 0:
        raise ApiError(f"Invalid {field}")
    if parsed != parsed.quantize(CENT):
        raise ApiError(f"Invalid {field}: at most 2 decimal places")
    return parsed.quantize(CENT)


def _new_reference() -> str:
    return "JRN-" + secrets.token_hex(8).upper()


def _signed_delta(account: LedgerAccount, leg: Leg) -> Decimal:
    if account.type in DEBIT_NORMAL_TYPES:
        return leg.debit - leg.credit
    return leg.credit - leg.debit


async def post(
    db: AsyncSession,
    *,
    kind: str,
    description: str,
    legs: list[Leg],
    details: dict | None = None,
    reverses: JournalEntry | None = None,
    insufficient_message: str = "Insufficient balance",
) -> JournalEntry:
    legs = [leg for leg in legs if leg.debit or leg.credit]
    if len(legs) < 2:
        raise LedgerError("a journal entry needs at least two non-zero legs")

    totals: dict[str, list[Decimal]] = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for leg in legs:
        if leg.debit and leg.credit:
            raise LedgerError("a leg is either a debit or a credit")
        if leg.debit < 0 or leg.credit < 0:
            raise LedgerError("leg amounts must be positive")
        if money(leg.debit) != leg.debit or money(leg.credit) != leg.credit:
            raise LedgerError("leg amounts must be rounded to cents before posting")
        totals[leg.account.currency][0] += leg.debit
        totals[leg.account.currency][1] += leg.credit
    for currency, (d, c) in totals.items():
        if d != c:
            raise LedgerError(f"unbalanced posting in {currency}: debits {d} != credits {c}")

    # Lock in id order. populate_existing refreshes any stale copies already
    # in the session so the balance check below sees committed values.
    account_ids = sorted({leg.account.id for leg in legs})
    locked = {
        a.id: a
        for a in (
            await db.execute(
                select(LedgerAccount)
                .where(LedgerAccount.id.in_(account_ids))
                .order_by(LedgerAccount.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    }
    card_ids = sorted({a.wallet_card_id for a in locked.values() if a.wallet_card_id})
    cards: dict[uuid.UUID, WalletCard] = {}
    if card_ids:
        cards = {
            c.id: c
            for c in (
                await db.execute(
                    select(WalletCard)
                    .where(WalletCard.id.in_(card_ids))
                    .order_by(WalletCard.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }

    merchant_ids = sorted({a.merchant_id for a in locked.values() if a.merchant_id})
    merchants: dict = {}
    if merchant_ids:
        from app.models.merchant import Merchant

        merchants = {
            m.id: m
            for m in (
                await db.execute(
                    select(Merchant)
                    .where(Merchant.id.in_(merchant_ids))
                    .order_by(Merchant.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }

    group_ids = sorted({a.contribution_group_id for a in locked.values() if a.contribution_group_id})
    groups: dict = {}
    if group_ids:
        from app.models.contribution import ContributionGroup

        groups = {
            g.id: g
            for g in (
                await db.execute(
                    select(ContributionGroup)
                    .where(ContributionGroup.id.in_(group_ids))
                    .order_by(ContributionGroup.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }

    new_balances: dict[uuid.UUID, Decimal] = {aid: locked[aid].balance for aid in account_ids}
    for leg in legs:
        acct = locked[leg.account.id]
        new_balances[acct.id] += _signed_delta(acct, leg)
    for aid, bal in new_balances.items():
        acct = locked[aid]
        if bal < 0 and not acct.allow_negative:
            raise InsufficientFunds(insufficient_message)

    entry = JournalEntry(
        reference=_new_reference(),
        kind=kind,
        description=description,
        details=details or {},
        reverses_entry_id=reverses.id if reverses else None,
    )
    db.add(entry)
    await db.flush()
    for i, leg in enumerate(legs, start=1):
        db.add(JournalLine(
            entry_id=entry.id,
            line_no=i,
            account_id=leg.account.id,
            currency=leg.account.currency,
            debit=leg.debit,
            credit=leg.credit,
        ))
    # Open the balance guard (app.ledger.ddl) only around our own writes.
    await db.execute(text("SELECT set_config('bukkapay.ledger_posting', 'on', true)"))
    for aid, bal in new_balances.items():
        acct = locked[aid]
        acct.balance = bal
        acct.version = (acct.version or 0) + 1
        if acct.wallet_card_id and acct.wallet_card_id in cards:
            cards[acct.wallet_card_id].balance = bal
        if acct.merchant_id and acct.merchant_id in merchants:
            merchants[acct.merchant_id].wallet_balance = bal
        if acct.contribution_group_id and acct.contribution_group_id in groups:
            groups[acct.contribution_group_id].current_amount = bal
    try:
        await db.flush()
    finally:
        await db.execute(text("SELECT set_config('bukkapay.ledger_posting', 'off', true)"))
    return entry


async def reverse(db: AsyncSession, entry: JournalEntry, *, description: str) -> JournalEntry:
    """Post the exact mirror of ``entry``. The original stays untouched."""
    lines = (
        await db.execute(select(JournalLine).where(JournalLine.entry_id == entry.id))
    ).scalars().all()
    accounts = {
        a.id: a
        for a in (
            await db.execute(
                select(LedgerAccount).where(LedgerAccount.id.in_({ln.account_id for ln in lines}))
            )
        ).scalars()
    }
    legs = [Leg(account=accounts[ln.account_id], debit=ln.credit, credit=ln.debit) for ln in lines]
    return await post(
        db,
        kind="reversal",
        description=description,
        legs=legs,
        details={"reverses": entry.reference, "original_kind": entry.kind},
        reverses=entry,
    )
