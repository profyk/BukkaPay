"""Board portal API (board.bukkapay.com): invited board members and investors.
Read-only company aggregates; nothing here returns a customer, merchant or
staff record."""

import csv
import io

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.board import service as svc
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.models.board import BoardAccessLog, BoardMember
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api/board", tags=["board"])


def _ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    return (fwd.split(",")[0].strip() if fwd else None) or (request.client.host if request.client else None)


def _token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise ApiError("Sign in to the board portal", status_code=401)
    return auth[7:].strip()


async def board_member(request: Request, db: AsyncSession = Depends(get_db)) -> BoardMember:
    m = await svc.member_for_token(db, _token(request))
    if m is None:
        raise ApiError("Your session has ended. Sign in again.", status_code=401)
    return m


async def _log(db: AsyncSession, m: BoardMember, action: str, request: Request) -> None:
    db.add(BoardAccessLog(member_id=m.id, action=action, ip=_ip(request)))
    await db.flush()


class AcceptIn(CamelModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=12, max_length=200)


class LoginIn(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class OwnerPassIn(CamelModel):
    code: str = Field(min_length=20, max_length=200)


class CodeIn(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=6, max_length=6)


@router.post("/auth/accept", dependencies=[Depends(rate_limit("board-accept", 10, 3600))])
async def accept(body: AcceptIn, db: AsyncSession = Depends(get_db)):
    m = await svc.accept(db, body.token, body.password)
    return {"email": m.email}


@router.post("/auth/login", dependencies=[Depends(rate_limit("board-login", 10, 900))])
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    await svc.start_login(db, body.email, body.password)
    return {"codeSent": True}


@router.post("/auth/verify", dependencies=[Depends(rate_limit("board-verify", 10, 900))])
async def verify(body: CodeIn, request: Request, db: AsyncSession = Depends(get_db)):
    token, m = await svc.finish_login(db, body.email, body.code, _ip(request))
    await _log(db, m, "signed_in", request)
    return {"token": token, "member": _me(m)}


def _me(m: BoardMember) -> dict:
    return {"name": m.name, "email": m.email, "organisation": m.organisation, "title": m.title,
            "isOwner": svc.is_owner(m)}


@router.post("/auth/owner", dependencies=[Depends(rate_limit("board-owner", 10, 900))])
async def owner_sign_in(body: OwnerPassIn, request: Request, db: AsyncSession = Depends(get_db)):
    token, m = await svc.redeem_owner_pass(db, body.code, _ip(request))
    await _log(db, m, "owner_signed_in", request)
    return {"token": token, "member": _me(m)}


@router.get("/auth/me")
async def me(m: BoardMember = Depends(board_member)):
    return _me(m)


@router.post("/auth/logout")
async def logout(request: Request, m: BoardMember = Depends(board_member), db: AsyncSession = Depends(get_db)):
    await svc.end_sessions(db, m.id, _token(request))
    return {"signedOut": True}


@router.get("/overview")
async def overview(request: Request, months: int = Query(default=12, ge=3, le=36),
                   m: BoardMember = Depends(board_member), db: AsyncSession = Depends(get_db)):
    data = await svc.overview(db, months=months)
    await _log(db, m, "viewed_dashboard", request)
    return data


@router.get("/updates")
async def updates(request: Request, m: BoardMember = Depends(board_member), db: AsyncSession = Depends(get_db)):
    await _log(db, m, "viewed_updates", request)
    return await svc.updates(db)


@router.get("/export.csv")
async def export(request: Request, months: int = Query(default=12, ge=3, le=36),
                 m: BoardMember = Depends(board_member), db: AsyncSession = Depends(get_db)):
    data = await svc.overview(db, months=months)
    await _log(db, m, "exported_csv", request)
    cols = ["month", "signups", "users", "mau", "transactions", "tpv", "revenue", "directCosts", "grossProfit",
            "operatingCosts", "otherIncome", "netProfit", "cash", "fundingRaised", "headcount", "newMerchants",
            "activeMerchants"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"BukkaPay board metrics, amounts in {data['reportingCurrency']}"])
    w.writerow(cols)
    for s in data["series"]:
        w.writerow(["" if s.get(c) is None else s.get(c) for c in cols])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="bukkapay-board-metrics.csv"',
                                      "Cache-Control": "no-store"})
