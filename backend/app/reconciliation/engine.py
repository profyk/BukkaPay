"""Reconciliation.

* ``run_ledger_integrity`` — internal checks: every journal balances, cached
  account balances equal their lines, wallet/merchant/campaign projections
  equal their accounts, and nothing is stuck pending too long.
* ``run_provider_statement`` — matches a provider statement (CSV rows from
  the PSP/bank/custodian) against our funding and withdrawal records:
  matched / unmatched on either side / amount mismatch / duplicate.

Exceptions are recorded as items for finance to investigate and resolve.
Nothing here ever edits a financial record to make totals agree.
"""

import csv
import io
from collections import Counter
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.ledger import FundingRequest, WithdrawalRequest
from app.models.platform import ReconciliationItem, ReconciliationRun, Transfer

STALE_AFTER = timedelta(hours=24)


async def _item(db, run, result, *, reference=None, ledger_amount=None, provider_amount=None, currency=None,
                details=None):
    db.add(ReconciliationItem(run_id=run.id, result=result, reference=reference, ledger_amount=ledger_amount,
                              provider_amount=provider_amount, currency=currency, details=details or {}))


async def run_ledger_integrity(db: AsyncSession, *, started_by: str) -> ReconciliationRun:
    run = ReconciliationRun(kind="ledger_integrity", status="running", started_by=started_by, summary={})
    db.add(run)
    await db.flush()
    counts: Counter = Counter()

    for row in (await db.execute(text("""
        SELECT e.reference, l.currency, sum(l.debit) d, sum(l.credit) c
        FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        GROUP BY e.reference, l.currency HAVING sum(l.debit) <> sum(l.credit)
    """))).all():
        counts["integrity_error"] += 1
        await _item(db, run, "integrity_error", reference=row.reference, currency=row.currency,
                    details={"check": "unbalanced_entry", "debits": str(row.d), "credits": str(row.c)})

    for row in (await db.execute(text("""
        SELECT a.code, a.currency, a.balance,
               COALESCE(sum(CASE WHEN a.type IN ('asset','expense') THEN l.debit - l.credit
                                 ELSE l.credit - l.debit END), 0) AS computed
        FROM ledger_accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
        GROUP BY a.id
        HAVING a.balance <> COALESCE(sum(CASE WHEN a.type IN ('asset','expense') THEN l.debit - l.credit
                                              ELSE l.credit - l.debit END), 0)
    """))).all():
        counts["integrity_error"] += 1
        await _item(db, run, "integrity_error", reference=row.code, ledger_amount=row.computed,
                    provider_amount=row.balance, currency=row.currency, details={"check": "account_cache"})

    for label, sql in (
        ("wallet_projection", """SELECT a.code, a.currency, a.balance, c.balance AS projected
            FROM ledger_accounts a JOIN wallet_cards c ON c.id = a.wallet_card_id WHERE c.balance <> a.balance"""),
        ("merchant_projection", """SELECT a.code, a.currency, a.balance, m.wallet_balance AS projected
            FROM ledger_accounts a JOIN merchants m ON m.id = a.merchant_id WHERE m.wallet_balance <> a.balance"""),
        ("campaign_projection", """SELECT a.code, a.currency, a.balance, g.current_amount AS projected
            FROM ledger_accounts a JOIN contribution_groups g ON g.id = a.contribution_group_id
            WHERE g.current_amount <> a.balance"""),
    ):
        for row in (await db.execute(text(sql))).all():
            counts["integrity_error"] += 1
            await _item(db, run, "integrity_error", reference=row.code, ledger_amount=row.balance,
                        provider_amount=row.projected, currency=row.currency, details={"check": label})

    # Cards: the holds account must equal the open authorizations' holds, and
    # the overdraft receivable must equal what cards still owe.
    for label, sql in (
        ("card_holds", """SELECT a.code, a.currency, a.balance,
                COALESCE((SELECT sum(h.held_amount) FROM card_authorizations h
                          WHERE h.status = 'approved' AND h.currency = a.currency), 0) AS projected
            FROM ledger_accounts a WHERE a.code LIKE 'card:holds:%'"""),
        ("card_overdraft", """SELECT a.code, a.currency, a.balance,
                COALESCE((SELECT sum(c.overdraft_outstanding) FROM issued_cards c
                          WHERE c.billing_currency = a.currency), 0) AS projected
            FROM ledger_accounts a WHERE a.code LIKE 'receivable:card_overdraft:%'"""),
        # Agent cash-out: the hold account must equal the open (unused) codes.
        ("agent_cashout_holds", """SELECT a.code, a.currency, a.balance,
                COALESCE((SELECT sum(t.amount + t.fee) FROM agent_transactions t
                          WHERE t.kind = 'cash_out' AND t.status = 'pending' AND t.currency = a.currency), 0)
                    AS projected
            FROM ledger_accounts a WHERE a.code LIKE 'agent:cashout_hold:%'"""),
    ):
        for row in (await db.execute(text(sql))).all():
            if row.balance != row.projected:
                counts["integrity_error"] += 1
                await _item(db, run, "integrity_error", reference=row.code, ledger_amount=row.balance,
                            provider_amount=row.projected, currency=row.currency, details={"check": label})

    cutoff = datetime.now(UTC) - STALE_AFTER
    for fr in (await db.execute(select(FundingRequest).where(
        FundingRequest.status.in_(("pending", "review")), FundingRequest.created_at < cutoff))).scalars():
        counts["stale_pending"] += 1
        await _item(db, run, "stale_pending", reference=fr.reference, ledger_amount=fr.amount,
                    provider_amount=fr.provider_amount, currency=fr.currency,
                    details={"type": "funding", "status": fr.status, "review_reason": fr.review_reason})
    for wr in (await db.execute(select(WithdrawalRequest).where(
        WithdrawalRequest.status == "submitted", WithdrawalRequest.created_at < cutoff))).scalars():
        counts["stale_pending"] += 1
        await _item(db, run, "stale_pending", reference=wr.reference, ledger_amount=wr.amount, currency=wr.currency,
                    details={"type": "withdrawal", "failure_reason": wr.failure_reason})
    for tr in (await db.execute(select(Transfer).where(
        Transfer.status.in_(("sender_debited", "instructed", "settled")), Transfer.created_at < cutoff))).scalars():
        counts["stale_pending"] += 1
        await _item(db, run, "stale_pending", reference=tr.reference, ledger_amount=tr.source_amount,
                    currency=tr.from_currency, details={"type": "cross_border", "status": tr.status})

    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    run.summary = {"exceptions": sum(counts.values()), **counts}
    await db.flush()
    return run


def parse_statement(csv_text: str) -> list[dict]:
    """CSV with header: reference,amount,currency[,direction][,date].
    direction is `in` (collection) or `out` (payout); default `in`."""
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    required = {"reference", "amount", "currency"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise ApiError("Statement must have columns: reference, amount, currency")
    rows = []
    for i, raw in enumerate(reader, start=2):
        row = {k.strip().lower(): (v or "").strip() for k, v in raw.items()}
        try:
            amount = Decimal(row["amount"])
        except InvalidOperation as e:
            raise ApiError(f"Line {i}: invalid amount") from e
        rows.append({"reference": row["reference"], "amount": amount, "currency": row["currency"].upper(),
                     "direction": (row.get("direction") or "in").lower(), "date": row.get("date")})
    return rows


async def run_provider_statement(
    db: AsyncSession, *, provider: str, csv_text: str, started_by: str,
) -> ReconciliationRun:
    rows = parse_statement(csv_text)
    run = ReconciliationRun(kind="provider_statement", provider=provider, status="running", started_by=started_by,
                            summary={})
    db.add(run)
    await db.flush()
    counts: Counter = Counter()
    seen: Counter = Counter((r["direction"], r["reference"]) for r in rows)

    fundings = {f.provider_reference: f for f in (await db.execute(
        select(FundingRequest).where(FundingRequest.provider == provider))).scalars()}
    fundings_by_ref = {f.reference: f for f in fundings.values()}
    withdrawals = {w.reference: w for w in (await db.execute(
        select(WithdrawalRequest).where(WithdrawalRequest.provider == provider))).scalars()}
    matched_in, matched_out = set(), set()

    for r in rows:
        key = (r["direction"], r["reference"])
        if seen[key] > 1:
            counts["duplicate"] += 1
            await _item(db, run, "duplicate", reference=r["reference"], provider_amount=r["amount"],
                        currency=r["currency"], details={"direction": r["direction"]})
            seen[key] = -1  # report once
            continue
        if seen[key] == -1:
            continue
        if r["direction"] == "in":
            rec = fundings.get(r["reference"]) or fundings_by_ref.get(r["reference"])
            ledger_amount = rec.amount if rec else None
            ok_status = rec is not None and rec.status == "completed"
            if rec:
                matched_in.add(rec.id)
        else:
            rec = withdrawals.get(r["reference"])
            ledger_amount = rec.amount if rec else None
            ok_status = rec is not None and rec.status in ("submitted", "completed")
            if rec:
                matched_out.add(rec.id)
        if rec is None:
            result = "unmatched_provider"
        elif ledger_amount != r["amount"] or rec.currency != r["currency"]:
            result = "amount_mismatch"
        elif not ok_status:
            result = "timing_difference"
        else:
            result = "matched"
        counts[result] += 1
        if result != "matched":
            await _item(db, run, result, reference=r["reference"], ledger_amount=ledger_amount,
                        provider_amount=r["amount"], currency=r["currency"],
                        details={"direction": r["direction"], "record_status": getattr(rec, "status", None)})

    for f in fundings.values():
        if f.status == "completed" and f.id not in matched_in:
            counts["unmatched_ledger"] += 1
            await _item(db, run, "unmatched_ledger", reference=f.reference, ledger_amount=f.amount,
                        currency=f.currency, details={"direction": "in", "provider_reference": f.provider_reference})
    for w in withdrawals.values():
        if w.status in ("submitted", "completed") and w.id not in matched_out:
            counts["unmatched_ledger"] += 1
            await _item(db, run, "unmatched_ledger", reference=w.reference, ledger_amount=w.amount,
                        currency=w.currency, details={"direction": "out"})

    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    run.summary = {"rows": len(rows), "exceptions": sum(v for k, v in counts.items() if k != "matched"),
                   **counts}
    await db.flush()
    return run
