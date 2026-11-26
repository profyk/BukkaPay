"""BukkaPay Boardroom API, authentication and session part (board.bukkapay.com).

Boardroom members are not admins and not customers: separate table,
separate sessions, separate API. A Boardroom token is refused by every
operational admin and customer endpoint, and nothing here returns a
customer, merchant or staff record.

Sign-in: password, then a code from an authenticator app (TOTP). Members
who joined before authenticators were required get one emailed code and
must set up an authenticator before they can open anything. Sessions last
12 hours, end after 30 minutes idle, and live in sessionStorage only.
Tokens travel in the Authorization header (never cookies), so cross-site
request forgery can't ride on them.
"""

import csv
import io

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.board import audit
from app.board import permissions as perms
from app.board import service as svc
from app.core.errors import ApiError
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.models.board import BoardAccessLog, BoardMember, BoardSession
from app.schemas.base import CamelModel

router = APIRouter(prefix="/api/board", tags=["board"])


def _ip(request: Request) -> str | None:
    return audit.ip_of(request)


def _token(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise ApiError("Sign in to the Boardroom", status_code=401)
    return auth[7:].strip()


async def board_session(request: Request, db: AsyncSession = Depends(get_db)) -> BoardMember:
    """Any signed-in member, even one who still has to set up MFA."""
    m = await svc.member_for_token(db, _token(request))
    if m is None:
        raise ApiError("Your session has ended. Sign in again.", status_code=401)
    request.state.board_member = m
    return m


async def board_member(m: BoardMember = Depends(board_session)) -> BoardMember:
    """A signed-in member who has passed MFA. Everything except MFA set-up needs this."""
    if not svc.mfa_ready(m):
        raise ApiError("Set up your authenticator app to continue", status_code=403)
    return m


def require(permission: str):
    """Deny by default: the member's role (from the database) must hold `permission`."""
    async def dep(m: BoardMember = Depends(board_member)) -> BoardMember:
        if not perms.can(m, permission):
            raise ApiError("You don't have access to this", status_code=403)
        return m
    return dep


async def _log(db: AsyncSession, m: BoardMember, action: str, request: Request, details: dict | None = None) -> None:
    db.add(BoardAccessLog(member_id=m.id, action=action, ip=_ip(request), details=details))
    await db.flush()


class AcceptStartIn(CamelModel):
    token: str = Field(min_length=10, max_length=200)


class AcceptIn(CamelModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=12, max_length=200)
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class LoginIn(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class OwnerPassIn(CamelModel):
    code: str = Field(min_length=20, max_length=200)


class CodeIn(CamelModel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class OtpIn(CamelModel):
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ForgotIn(CamelModel):
    email: str = Field(min_length=3, max_length=255)


class ResetIn(CamelModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=12, max_length=200)
    otp: str | None = Field(default=None, min_length=6, max_length=6, pattern=r"^\d{6}$")


class ChangePasswordIn(CamelModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=12, max_length=200)
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/auth/accept/start", dependencies=[Depends(rate_limit("board-accept", 20, 3600))])
async def accept_start(body: AcceptStartIn, db: AsyncSession = Depends(get_db)):
    return await svc.accept_start(db, body.token)


@router.post("/auth/accept", dependencies=[Depends(rate_limit("board-accept", 20, 3600))])
async def accept(body: AcceptIn, request: Request, db: AsyncSession = Depends(get_db)):
    m = await svc.accept(db, body.token, body.password, body.otp)
    await _log(db, m, "invitation_accepted", request)
    await audit.record(db, "member.accepted_invitation", member=m, target_type="board_member", target_id=m.id,
                       request=request)
    return {"email": m.email}


@router.post("/auth/login", dependencies=[Depends(rate_limit("board-login", 10, 900))])
async def login(body: LoginIn, request: Request, db: AsyncSession = Depends(get_db)):
    r = await svc.start_login(db, body.email, body.password, _ip(request))
    return {"codeSent": r["method"] == "email", "method": r["method"]}


@router.post("/auth/verify", dependencies=[Depends(rate_limit("board-verify", 10, 900))])
async def verify(body: CodeIn, request: Request, db: AsyncSession = Depends(get_db)):
    token, m = await svc.finish_login(db, body.email, body.code, _ip(request), request.headers.get("user-agent"))
    await _log(db, m, "signed_in", request, {"mfa": "totp" if m.mfa_secret else "email_code"})
    return {"token": token, "member": _me(m)}


def _me(m: BoardMember) -> dict:
    role = perms.role_of(m)
    return {"name": m.name, "email": m.email, "organisation": m.organisation, "title": m.title,
            "isOwner": svc.is_owner(m), "role": role,
            "roleLabel": perms.OWNER_LABEL if role == perms.OWNER_ROLE else perms.ROLES.get(role, role),
            "permissions": sorted(perms.permissions_of(m)),
            "mfaReady": svc.mfa_ready(m), "mfaSetupRequired": not svc.mfa_ready(m)}


@router.post("/auth/owner", dependencies=[Depends(rate_limit("board-owner", 10, 900))])
async def owner_sign_in(body: OwnerPassIn, request: Request, db: AsyncSession = Depends(get_db)):
    token, m = await svc.redeem_owner_pass(db, body.code, _ip(request))
    await _log(db, m, "owner_signed_in", request)
    return {"token": token, "member": _me(m)}


@router.get("/auth/me")
async def me(m: BoardMember = Depends(board_session)):
    return _me(m)


@router.post("/auth/mfa/setup", dependencies=[Depends(rate_limit("board-mfa", 10, 900))])
async def mfa_setup(m: BoardMember = Depends(board_session), db: AsyncSession = Depends(get_db)):
    return await svc.mfa_setup(db, m)


@router.post("/auth/mfa/confirm", dependencies=[Depends(rate_limit("board-mfa", 10, 900))])
async def mfa_confirm(body: OtpIn, request: Request, m: BoardMember = Depends(board_session),
                      db: AsyncSession = Depends(get_db)):
    await svc.mfa_confirm(db, m, body.otp)
    await audit.record(db, "member.mfa_enabled", member=m, target_type="board_member", target_id=m.id, request=request)
    return _me(m)


@router.post("/auth/forgot", dependencies=[Depends(rate_limit("board-forgot", 5, 3600))])
async def forgot(body: ForgotIn, db: AsyncSession = Depends(get_db)):
    await svc.forgot_password(db, body.email)
    return {"sent": True}  # same answer whether or not the email belongs to a member


@router.post("/auth/reset", dependencies=[Depends(rate_limit("board-reset", 10, 3600))])
async def reset(body: ResetIn, request: Request, db: AsyncSession = Depends(get_db)):
    m = await svc.reset_password(db, body.token, body.password, body.otp)
    await audit.record(db, "member.password_reset", member=m, target_type="board_member", target_id=m.id,
                       request=request)
    return {"email": m.email}


@router.post("/auth/password", dependencies=[Depends(rate_limit("board-password", 10, 3600))])
async def change_password(body: ChangePasswordIn, request: Request, m: BoardMember = Depends(board_member),
                          db: AsyncSession = Depends(get_db)):
    if svc.is_owner(m):
        raise ApiError("The owner signs in from the admin panel and has no Boardroom password", status_code=400)
    await svc.change_password(db, m, body.current_password, body.new_password, body.otp)
    await audit.record(db, "member.password_changed", member=m, target_type="board_member", target_id=m.id,
                       request=request)
    return {"changed": True}


@router.get("/auth/sessions")
async def my_sessions(request: Request, m: BoardMember = Depends(board_member), db: AsyncSession = Depends(get_db)):
    cur = svc._h(_token(request))
    rows = (await db.execute(select(BoardSession).where(BoardSession.member_id == m.id)
                             .order_by(BoardSession.created_at.desc()).limit(30))).scalars().all()
    history = (await db.execute(select(BoardAccessLog).where(
        BoardAccessLog.member_id == m.id, BoardAccessLog.action.in_(("signed_in", "owner_signed_in", "sign_in_failed")))
        .order_by(BoardAccessLog.created_at.desc()).limit(30))).scalars().all()
    return {"sessions": [{"id": str(x.id), "current": x.token_hash == cur, "createdAt": x.created_at.isoformat(),
                          "lastSeenAt": x.last_seen_at.isoformat() if x.last_seen_at else None,
                          "expiresAt": x.expires_at.isoformat(), "revoked": x.revoked_at is not None,
                          "ip": x.ip, "device": x.user_agent} for x in rows],
            "history": [{"action": h.action, "ip": h.ip, "at": h.created_at.isoformat()} for h in history]}


@router.post("/auth/sessions/{session_id}/revoke")
async def revoke_session(session_id: str, request: Request, m: BoardMember = Depends(board_member),
                         db: AsyncSession = Depends(get_db)):
    import uuid as _uuid

    try:
        sid = _uuid.UUID(session_id)
    except ValueError as e:
        raise ApiError("Not found", status_code=404) from e
    s = await db.get(BoardSession, sid)
    if s is None or s.member_id != m.id:  # only your own sessions
        raise ApiError("Not found", status_code=404)
    from datetime import UTC, datetime

    s.revoked_at = s.revoked_at or datetime.now(UTC)
    await audit.record(db, "member.session_revoked", member=m, target_type="board_session", target_id=s.id,
                       request=request)
    return {"revoked": True}


@router.post("/auth/logout")
async def logout(request: Request, m: BoardMember = Depends(board_session), db: AsyncSession = Depends(get_db)):
    await svc.end_sessions(db, m.id, _token(request))
    return {"signedOut": True}


@router.get("/overview")
async def overview(request: Request, months: int = Query(default=12, ge=3, le=36),
                   m: BoardMember = Depends(require("dashboard.view")), db: AsyncSession = Depends(get_db)):
    data = await svc.overview(db, months=months)
    if not perms.can(m, "financials.view"):
        # Investors and shareholders see the approved summary, not the cost lines.
        for row in data["series"]:
            row["costBreakdown"] = None
    await _log(db, m, "viewed_dashboard", request)
    return data


@router.get("/updates")
async def updates(request: Request, m: BoardMember = Depends(require("announcements.view")),
                  db: AsyncSession = Depends(get_db)):
    await _log(db, m, "viewed_updates", request)
    return [u for u in await svc.updates(db) if perms.audience_ok(m, u.get("audience"))]


@router.get("/export.csv")
async def export(request: Request, months: int = Query(default=12, ge=3, le=36),
                 m: BoardMember = Depends(require("reports.view")), db: AsyncSession = Depends(get_db)):
    data = await svc.overview(db, months=months)
    await _log(db, m, "exported_csv", request)
    cols = ["month", "signups", "users", "mau", "transactions", "tpv", "revenue", "directCosts", "grossProfit",
            "operatingCosts", "otherIncome", "netProfit", "cash", "fundingRaised", "headcount", "newMerchants",
            "activeMerchants"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([f"BukkaPay Boardroom metrics, amounts in {data['reportingCurrency']}, each month converted at "
                "its own month-end rate"])
    w.writerow(cols)
    for s in data["series"]:
        w.writerow(["" if s.get(c) is None else s.get(c) for c in cols])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="bukkapay-board-metrics.csv"',
                                      "Cache-Control": "no-store"})
