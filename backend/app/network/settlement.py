"""Weekly cross-border bulk settlement.

Book transfers pay recipients from the destination pool and leave the
sender's money in the source pool (app.network.treasury). Every week (and on
demand from the Treasury page) this nets the pools into a settlement run:

  pools with spare cash  ──►  pools that have fronted payouts

matched largest-first in USD terms, so there are as few bank transfers as
possible. Needs that no surplus can cover are listed as "unfunded" (fund them
from treasury / the FX partner).

A run is only a plan. For each line, treasury makes the transfer at the bank
(SADC-RTGS / TCIB / PAPSS / FX partner), then records the bank reference and
the amounts actually sent and received. That files a `treasury.rebalance`
maker-checker request; when a second admin approves it, the move is booked
(balanced, both currencies) and the line is settled.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.platform import ApprovalRequest
from app.models.settlement import SettlementBatch, SettlementLine
from app.models.wallet import CurrencyCorridor
from app.network import treasury

CENT = Decimal("0.01")
MIN_LINE_USD = Decimal("10")  # don't wire dust


async def _direct(db: AsyncSession, a: str, b: str) -> Decimal | None:
    row = (await db.execute(select(CurrencyCorridor.exchange_rate).where(
        CurrencyCorridor.from_currency == a, CurrencyCorridor.to_currency == b,
        CurrencyCorridor.is_active.is_(True)))).scalars().first()
    return Decimal(row) if row and Decimal(row) > 0 else None


async def rate(db: AsyncSession, a: str, b: str) -> Decimal | None:
    """Mid rate: 1 a = rate b. Direct pair, inverse pair, or via USD."""
    if a == b:
        return Decimal(1)
    if (r := await _direct(db, a, b)) is not None:
        return r
    if (r := await _direct(db, b, a)) is not None:
        return Decimal(1) / r
    if "USD" not in (a, b):
        ua, ub = await rate(db, a, "USD"), await rate(db, b, "USD")
        if ua and ub:
            return ua / ub
    return None


async def open_batch(db: AsyncSession) -> SettlementBatch | None:
    return (await db.execute(select(SettlementBatch).where(SettlementBatch.status.in_(("proposed", "in_progress")))
                             .order_by(SettlementBatch.created_at.desc()))).scalars().first()


async def generate(db: AsyncSession, *, actor: str, now: datetime | None = None) -> SettlementBatch | None:
    """Build this week's run. Replaces an untouched proposed run; refuses
    while a run has lines in progress. Returns None if nothing to settle."""
    now = now or datetime.now(UTC)
    current = await open_batch(db)
    if current is not None:
        lines = (await db.execute(select(SettlementLine).where(SettlementLine.batch_id == current.id))).scalars().all()
        if current.status == "in_progress" or any(ln.status != "pending" for ln in lines):
            raise ApiError(f"Run {current.reference} is in progress. Finish or cancel it first.", status_code=409)
        current.status = "cancelled"
        current.notes = (current.notes or "") + f" Replaced by a new run ({actor})."

    positions = await treasury.positions(db)
    needs, surplus, unfunded, unpriced = [], [], [], []
    for p in positions:
        amt = Decimal(p["amount"])
        if amt <= 0:
            continue
        usd = await rate(db, p["currency"], "USD")
        if usd is None:
            unpriced.append({"currency": p["currency"], "action": p["action"], "amount": f"{amt:.2f}",
                             "note": "No rate to USD: settle manually"})
            continue
        (needs if p["action"] == "top_up" else surplus).append([p["currency"], amt, amt * usd])
    if not needs and not unpriced:
        await db.flush()
        return None

    needs.sort(key=lambda x: x[2], reverse=True)
    surplus.sort(key=lambda x: x[2], reverse=True)
    last = (await db.execute(select(SettlementBatch).where(SettlementBatch.status == "settled")
                             .order_by(SettlementBatch.period_end.desc()))).scalars().first()
    today = now.date()
    iso = today.isocalendar()
    batch = SettlementBatch(
        reference=f"SET-{iso.year}-W{iso.week:02d}-{now.strftime('%H%M%S')}",
        period_start=(last.period_end + timedelta(days=1)) if last else today - timedelta(days=7),
        period_end=today, status="proposed", positions=positions, created_by=actor)
    db.add(batch)
    await db.flush()

    for need in needs:
        ccy_to, _, need_usd = need
        for s in surplus:
            if need_usd < MIN_LINE_USD:
                break
            ccy_from, s_amt, s_usd = s
            if s_usd < MIN_LINE_USD:
                continue
            take_usd = min(need_usd, s_usd)
            from_amount = (s_amt * take_usd / s_usd).quantize(CENT, rounding=ROUND_DOWN)
            r = await rate(db, ccy_from, ccy_to)
            to_amount = (from_amount * r).quantize(CENT, rounding=ROUND_DOWN) if r else None
            if from_amount <= 0:
                continue
            db.add(SettlementLine(batch_id=batch.id, from_currency=ccy_from, to_currency=ccy_to,
                                  from_amount=from_amount, expected_to_amount=to_amount,
                                  rate=r.quantize(Decimal("0.00000001")) if r else None))
            s[1] -= from_amount
            s[2] -= take_usd
            need_usd -= take_usd
        if need_usd >= MIN_LINE_USD:
            r = await rate(db, ccy_to, "USD")
            unfunded.append({"currency": ccy_to, "amount": f"{(need_usd / r).quantize(CENT):.2f}" if r else None,
                             "note": "No pool surplus covers this: fund from treasury or the FX partner"})
    batch.unfunded = unfunded + unpriced
    await db.flush()
    return batch


async def lines(db: AsyncSession, batch: SettlementBatch) -> list[SettlementLine]:
    return list((await db.execute(select(SettlementLine).where(SettlementLine.batch_id == batch.id)
                                  .order_by(SettlementLine.created_at))).scalars())


async def record_transfer(db: AsyncSession, ctx, line: SettlementLine, *, bank_reference: str,
                          sent: Decimal, received: Decimal) -> ApprovalRequest:
    """Treasury made the transfer: file it for a second admin to approve."""
    from app.governance import approvals

    if line.status == "requested" and line.approval_request_id:
        prior = await db.get(ApprovalRequest, line.approval_request_id)
        if prior is not None and prior.status in ("pending", "executed"):
            raise ApiError("This line is already waiting for approval", status_code=409)
    elif line.status != "pending":
        raise ApiError(f"This line is {line.status}", status_code=409)
    batch = await db.get(SettlementBatch, line.batch_id)
    if batch.status not in ("proposed", "in_progress"):
        raise ApiError(f"Run {batch.reference} is {batch.status}", status_code=409)
    if sent <= 0 or received <= 0:
        raise ApiError("Enter the amounts actually sent and received")
    req = await approvals.request(db, ctx, action="treasury.rebalance", payload={
        "from_currency": line.from_currency, "from_amount": f"{sent:.2f}",
        "to_currency": line.to_currency, "to_amount": f"{received:.2f}",
        "reference": bank_reference.strip()[:80], "settlement_line_id": str(line.id),
        "settlement_reference": batch.reference,
    }, reason=f"Settlement {batch.reference}: {line.from_currency} → {line.to_currency}, bank ref {bank_reference}")
    line.status, line.approval_request_id = "requested", req.id
    line.bank_reference = bank_reference.strip()[:80]
    line.actual_from_amount, line.actual_to_amount = sent, received
    batch.status = "in_progress"
    await db.flush()
    return req


async def mark_settled(db: AsyncSession, line_id, journal_reference: str) -> None:
    """Called by the approved treasury.rebalance."""
    line = await db.get(SettlementLine, line_id, with_for_update=True)
    if line is None or line.status == "settled":
        raise ApiError("Settlement line not found or already settled", status_code=409)
    line.status, line.journal_reference, line.settled_at = "settled", journal_reference, datetime.now(UTC)
    await _maybe_close(db, line.batch_id)


async def cancel_line(db: AsyncSession, line: SettlementLine) -> None:
    if line.status == "settled":
        raise ApiError("A settled line can't be cancelled; book a reverse rebalance instead", status_code=409)
    if line.status == "requested" and line.approval_request_id:
        prior = await db.get(ApprovalRequest, line.approval_request_id)
        if prior is not None and prior.status == "pending":
            raise ApiError("Reject the pending approval first", status_code=409)
    line.status = "cancelled"
    await _maybe_close(db, line.batch_id)


async def cancel_batch(db: AsyncSession, batch: SettlementBatch, *, actor: str) -> None:
    for ln in await lines(db, batch):
        if ln.status == "settled":
            raise ApiError("Part of this run is already booked; cancel the remaining lines instead", status_code=409)
        if ln.status == "requested":
            await cancel_line(db, ln)
    batch.status = "cancelled"
    batch.notes = (batch.notes or "") + f" Cancelled by {actor}."
    await db.flush()


async def _maybe_close(db: AsyncSession, batch_id) -> None:
    batch = await db.get(SettlementBatch, batch_id)
    statuses = {ln.status for ln in await lines(db, batch)}
    if statuses and statuses <= {"settled", "cancelled"}:
        batch.status = "settled" if "settled" in statuses else "cancelled"
        batch.settled_at = datetime.now(UTC)
    await db.flush()


def week_bounds(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)
