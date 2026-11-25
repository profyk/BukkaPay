"""Admin: weekly cross-border bulk settlement runs.

GET   /settlements                       runs (latest first) with their lines
POST  /settlements/run                   build a run now (also every Monday 06:00 UTC)
GET   /settlements/{id}/instructions.csv the transfers to make at the bank
POST  /settlement-lines/{id}/sent        treasury made the transfer → files approval
POST  /settlement-lines/{id}/cancel
POST  /settlements/{id}/cancel
"""

import csv
import io
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import AdminContext, require
from app.api.admin.network import row
from app.core.errors import ApiError
from app.db.deps import get_db
from app.ledger import posting
from app.models.platform import ApprovalRequest
from app.models.settlement import SettlementBatch, SettlementLine
from app.network import settlement, treasury
from app.schemas.base import CamelModel

router = APIRouter(tags=["admin-settlements"])


def _id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e


async def _batch_out(db: AsyncSession, b: SettlementBatch) -> dict:
    lines = await settlement.lines(db, b)
    approvals = {a.id: a.status for a in (await db.execute(select(ApprovalRequest).where(
        ApprovalRequest.id.in_([ln.approval_request_id for ln in lines if ln.approval_request_id])))).scalars()}
    return {**row(b), "lines": [{**row(ln), "approvalStatus": approvals.get(ln.approval_request_id)} for ln in lines]}


@router.get("/settlements")
async def list_runs(_=Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)):
    runs = (await db.execute(select(SettlementBatch).order_by(SettlementBatch.created_at.desc()).limit(30))).scalars()
    return {"positions": await treasury.positions(db), "runs": [await _batch_out(db, b) for b in runs]}


@router.post("/settlements/run", status_code=201)
async def run_now(ctx: AdminContext = Depends(require("ledger.adjust_request")), db: AsyncSession = Depends(get_db)):
    batch = await settlement.generate(db, actor=(ctx.admin.email if ctx.admin else "master_key"))
    if batch is None:
        return {"run": None, "message": "All pools are balanced: nothing to settle."}
    return {"run": await _batch_out(db, batch)}


@router.get("/settlements/{batch_id}/instructions.csv")
async def instructions(batch_id: str, _=Depends(require("ledger.view")), db: AsyncSession = Depends(get_db)):
    batch = await db.get(SettlementBatch, _id(batch_id))
    if batch is None:
        raise ApiError("Run not found", status_code=404)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["run", "line", "from_pool", "send_amount", "to_pool", "expected_receive", "mid_rate", "status"])
    for ln in await settlement.lines(db, batch):
        w.writerow([batch.reference, str(ln.id), ln.from_currency, f"{ln.from_amount:.2f}", ln.to_currency,
                    f"{ln.expected_to_amount:.2f}" if ln.expected_to_amount is not None else "", ln.rate or "", ln.status])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{batch.reference}.csv"'})


class SentIn(CamelModel):
    bank_reference: str = Field(min_length=3, max_length=80)
    sent_amount: str
    received_amount: str


@router.post("/settlement-lines/{line_id}/sent")
async def line_sent(line_id: str, body: SentIn, ctx: AdminContext = Depends(require("ledger.adjust_request")),
                    db: AsyncSession = Depends(get_db)):
    line = await db.get(SettlementLine, _id(line_id), with_for_update=True)
    if line is None:
        raise ApiError("Line not found", status_code=404)
    req = await settlement.record_transfer(
        db, ctx, line, bank_reference=body.bank_reference,
        sent=posting.parse_amount(body.sent_amount, field="sent amount"),
        received=posting.parse_amount(body.received_amount, field="received amount"))
    return {"line": row(line), "approvalId": str(req.id)}


@router.post("/settlement-lines/{line_id}/cancel")
async def line_cancel(line_id: str, _=Depends(require("ledger.adjust_request")), db: AsyncSession = Depends(get_db)):
    line = await db.get(SettlementLine, _id(line_id), with_for_update=True)
    if line is None:
        raise ApiError("Line not found", status_code=404)
    await settlement.cancel_line(db, line)
    return row(line)


@router.post("/settlements/{batch_id}/cancel")
async def batch_cancel(batch_id: str, ctx: AdminContext = Depends(require("ledger.adjust_request")),
                       db: AsyncSession = Depends(get_db)):
    batch = await db.get(SettlementBatch, _id(batch_id), with_for_update=True)
    if batch is None:
        raise ApiError("Run not found", status_code=404)
    await settlement.cancel_batch(db, batch, actor=(ctx.admin.email if ctx.admin else "master_key"))
    return row(batch)
