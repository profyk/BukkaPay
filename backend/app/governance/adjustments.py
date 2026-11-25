"""Admin money corrections (the `ledger.adjustment` maker-checker action).

Rules:
  * The customer is identified only by their wallet ID number (the public
    number on their profile) plus the currency. Never by name, email, phone
    or an internal id. The requester types it; the system resolves it and
    shows the checker the account holder's name before they approve, and
    refuses at execution if it no longer resolves to the same wallet.
  * Every adjustment is one balanced double-entry posting with a named
    source of funds. Money is never created from nothing:

      bank_deposit  credit   SYS_SAFEGUARD (cash really received at the bank) → wallet
                             needs the bank statement reference; each reference
                             can be credited once only
      goodwill      credit   BukkaPay goodwill expense (company money) → wallet
                             treasury must top up safeguarding by the same amount
                             (the reserve check shows the gap until it does)
      reversal      either   exact mirror of an earlier journal entry that touched
                             this customer (by its journal reference); an entry
                             can be reversed once only
      recovery      debit    wallet → BukkaPay goodwill expense (take back a
                             goodwill credit); never takes a wallet below zero

  * A maker files it, a different admin approves it (app.governance.approvals).
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant
from app.models.platform import ApprovalRequest
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

SOURCES = {
    "bank_deposit": ("credit",),
    "goodwill": ("credit",),
    "reversal": ("credit", "debit"),
    "recovery": ("debit",),
}
SOURCE_LABELS = {
    "bank_deposit": "Customer's bank deposit (matched to a statement line)",
    "goodwill": "Goodwill / compensation paid by BukkaPay",
    "reversal": "Reverse an earlier transaction",
    "recovery": "Recover an earlier goodwill credit",
}


async def goodwill_account(db: AsyncSession, currency: str) -> LedgerAccount:
    return await ledger_accounts.system_account(
        db, f"expense:goodwill:{currency}", f"Goodwill and compensation ({currency})", "expense", currency,
        allow_negative=True)


async def resolve(db: AsyncSession, wallet_id: str, currency: str) -> tuple[User, WalletCard]:
    wid = (wallet_id or "").strip()
    ccy = (currency or "").strip().upper()
    if not wid or len(ccy) != 3:
        raise ApiError("Enter the customer's wallet ID number and the currency")
    user = (await db.execute(select(User).where(func.upper(User.wallet_id) == wid.upper(),
                                                User.deleted_at.is_(None)))).scalar_one_or_none()
    if user is None:
        raise ApiError("No customer has that wallet ID number", status_code=404)
    card = (await db.execute(select(WalletCard).where(WalletCard.user_id == user.id, WalletCard.currency == ccy)
                             .order_by(WalletCard.created_at))).scalars().first()
    if card is None:
        raise ApiError(f"This customer has no {ccy} wallet", status_code=404)
    return user, card


async def _entry_for(db: AsyncSession, reference: str, user: User, card: WalletCard) -> JournalEntry:
    entry = (await db.execute(select(JournalEntry).where(JournalEntry.reference == (reference or "").strip()))
             ).scalar_one_or_none()
    if entry is None:
        raise ApiError("No journal entry with that reference", status_code=404)
    wallet_acct = await ledger_accounts.wallet_account(db, card)
    merchant_ids = [m for (m,) in (await db.execute(select(Merchant.id).where(Merchant.user_id == user.id))).all()]
    touched = (await db.execute(select(func.count()).select_from(JournalLine).join(
        LedgerAccount, LedgerAccount.id == JournalLine.account_id).where(
        JournalLine.entry_id == entry.id,
        (LedgerAccount.id == wallet_acct.id) | (LedgerAccount.merchant_id.in_(merchant_ids) if merchant_ids
                                                 else LedgerAccount.id == wallet_acct.id)))).scalar_one()
    if not touched:
        raise ApiError("That entry didn't touch this customer's wallet or business", status_code=409)
    if entry.reverses_entry_id is not None:
        raise ApiError("That entry is itself a reversal", status_code=409)
    already = (await db.execute(select(JournalEntry.id).where(JournalEntry.reverses_entry_id == entry.id))).first()
    if already:
        raise ApiError("That entry has already been reversed", status_code=409)
    return entry


async def validate(db: AsyncSession, payload: dict, ctx=None) -> dict:
    """Run when the request is filed: checks everything and snapshots who the
    wallet belongs to, so the approver sees the name they are paying."""
    if payload.get("wallet_card_id") or payload.get("merchant_id"):
        raise ApiError("Adjustments are made by the customer's wallet ID number only (walletId + currency)")
    source = payload.get("source")
    direction = payload.get("direction")
    if source not in SOURCES:
        raise ApiError(f"Choose the source of funds: {', '.join(SOURCES)}")
    if direction not in SOURCES[source]:
        raise ApiError(f"A {source} adjustment can only be a {' or '.join(SOURCES[source])}")
    user, card = await resolve(db, payload.get("wallet_id", ""), payload.get("currency", ""))
    out = {**payload, "wallet_id": user.wallet_id, "currency": card.currency, "holder_name": user.name,
           "wallet_card_id_resolved": str(card.id)}
    if source == "reversal":
        entry = await _entry_for(db, payload.get("journal_reference", ""), user, card)
        out["journal_reference"] = entry.reference
        out.pop("amount", None)
        return await _with_controls(db, ctx, out, user)
    amount = posting.parse_amount(payload.get("amount", ""))
    out["amount"] = str(amount)
    if source == "bank_deposit":
        ref = (payload.get("evidence_reference") or "").strip()
        if len(ref) < 4:
            raise ApiError("Enter the bank statement reference for this deposit")
        out["evidence_reference"] = ref
        if await _deposit_reference_used(db, ref):
            raise ApiError("That bank deposit reference has already been credited or is waiting for approval",
                           status_code=409)
    return await _with_controls(db, ctx, out, user)


async def _with_controls(db: AsyncSession, ctx, out: dict, user: User) -> dict:
    """Insider-abuse checks (conflict of interest, company-cost limits, owner
    sign-off flags): app.governance.adjustment_controls. Computed server-side;
    anything the client sent under "controls" is replaced."""
    from app.governance import adjustment_controls

    out["controls"] = await adjustment_controls.assess(db, ctx, out, user) if ctx is not None else {}
    return out


async def _deposit_reference_used(db: AsyncSession, ref: str, *, exclude_request=None) -> bool:
    posted = (await db.execute(select(JournalEntry.id).where(
        JournalEntry.kind == "manual_adjustment",
        JournalEntry.details["evidence_reference"].astext == ref))).first()
    if posted:
        return True
    q = select(ApprovalRequest.id).where(ApprovalRequest.action == "ledger.adjustment",
                                         ApprovalRequest.status == "pending",
                                         ApprovalRequest.payload["evidence_reference"].astext == ref)
    if exclude_request is not None:
        q = q.where(ApprovalRequest.id != exclude_request)
    return (await db.execute(q)).first() is not None


async def execute(db: AsyncSession, p: dict) -> dict:
    """Run on approval. Re-resolves the wallet and re-checks everything."""
    if not p.get("source") or not p.get("wallet_id"):
        raise ApiError("This request uses the old format. File it again with the customer's wallet ID number.")
    user, card = await resolve(db, p["wallet_id"], p["currency"])
    if str(card.id) != p.get("wallet_card_id_resolved"):
        raise ApiError("The wallet ID no longer points to the same wallet. File a new request.", status_code=409)
    source, direction = p["source"], p["direction"]
    wallet = await ledger_accounts.wallet_account(db, card)

    if source == "reversal":
        entry = await _entry_for(db, p["journal_reference"], user, card)
        rev = await posting.reverse(db, entry, description=f"Approved reversal of {entry.reference}: {p.get('reason', '')}"[:500])
        delta = Decimal((await db.execute(select(func.coalesce(func.sum(JournalLine.credit - JournalLine.debit), 0))
                                         .where(JournalLine.entry_id == rev.id,
                                                JournalLine.account_id == wallet.id))).scalar_one())
        if delta:
            db.add(Transaction(user_id=user.id, card_id=card.id, title="Correction (reversal)", category="adjustment",
                               amount=abs(delta), type="credit" if delta > 0 else "debit", icon="tool"))
        await _notify(db, user, card.currency, abs(delta), "credit" if delta > 0 else "debit", "Correction", rev.reference)
        await db.flush()
        return {"journal_reference": rev.reference, "reverses": entry.reference, "wallet_id": user.wallet_id,
                "holder_name": user.name}

    amount = posting.parse_amount(p["amount"])
    if source == "bank_deposit":
        if (await db.execute(select(JournalEntry.id).where(
                JournalEntry.kind == "manual_adjustment",
                JournalEntry.details["evidence_reference"].astext == p["evidence_reference"]))).first():
            raise ApiError("That bank deposit reference has already been credited", status_code=409)
        counter = await chart.sys_account(db, "SYS_SAFEGUARD", card.currency)
    else:  # goodwill / recovery
        counter = await goodwill_account(db, card.currency)
    legs = ([posting.debit(counter, amount), posting.credit(wallet, amount)] if direction == "credit"
            else [posting.debit(wallet, amount), posting.credit(counter, amount)])
    entry = await posting.post(
        db, kind="manual_adjustment", description=f"Approved {source.replace('_', ' ')}: {p.get('reason', '')}"[:500],
        legs=legs, insufficient_message="The wallet doesn't have enough balance for this debit",
        details={"source": source, "wallet_id": user.wallet_id, "evidence_reference": p.get("evidence_reference"),
                 "approval_payload": {k: str(v) for k, v in p.items()}})
    db.add(Transaction(user_id=user.id, card_id=card.id,
                       title={"bank_deposit": "Bank deposit", "goodwill": "Credit from BukkaPay",
                              "recovery": "Correction"}[source],
                       category="adjustment", amount=amount, type=direction, icon="tool"))
    await _notify(db, user, card.currency, amount, direction,
                  {"bank_deposit": "Bank deposit credited", "goodwill": "Credit from BukkaPay",
                   "recovery": "Correction"}[source], entry.reference)
    await db.flush()
    return {"journal_reference": entry.reference, "amount": str(amount), "currency": card.currency,
            "wallet_id": user.wallet_id, "holder_name": user.name, "source": source}


async def _notify(db: AsyncSession, user: User, currency: str, amount, direction: str, title: str, ref: str) -> None:
    """Every adjustment is visible to the customer: a manual change to someone's
    money is never silent."""
    from app.models.enums import NotificationType
    from app.services import notification_service

    if not amount:
        return
    verb = "added to" if direction == "credit" else "taken from"
    await notification_service.create_notification(
        db, user.id, NotificationType.INFO, title,
        f"{currency} {amount:.2f} was {verb} your wallet by BukkaPay (ref {ref}). "
        "If you don't recognise this, contact support.", related_type="transfer")