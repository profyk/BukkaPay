"""Board portal: invitations, two-step sign-in and the investor metrics.

Metrics are company aggregates only. Amounts are computed per currency from
the ledger and, where a live mid-rate exists, converted into one reporting
currency (stated with the rate time); anything without a rate is listed
separately rather than guessed."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.security import hash_secret, verify_secret
from app.models.board import BoardFinancial, BoardMember, BoardSession, BoardUpdate
from app.models.enums import TransactionType
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.merchant import Merchant, MerchantTransaction
from app.models.platform import Country
from app.models.user import User
from app.models.wallet import Transaction, WalletCard

INVITE_TTL = timedelta(days=7)
SESSION_TTL = timedelta(hours=12)
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
LOCK_FOR = timedelta(minutes=15)
ZERO = Decimal("0")
COSTS = ("staff_costs", "technology_costs", "cloud_costs", "marketing_costs", "compliance_legal_costs",
         "banking_costs", "psp_costs", "cybersecurity_costs", "office_admin_costs", "country_ops_costs", "other_costs")


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


# ─── invitations & sign-in ──────────────────────────────────────────────────

def invite_link(token: str) -> str:
    from app.core.config import get_settings

    return f"{get_settings().board_web_url.rstrip('/')}/accept?token={token}"


def member_status(m: BoardMember) -> str:
    if not m.active:
        return "revoked"
    if m.suspended_at:
        return "suspended"
    if m.accepted_at:
        return "active"
    if m.invite_expires_at and m.invite_expires_at < _now():
        return "expired"
    return "invited"


async def invite(db: AsyncSession, *, email: str, name: str, organisation: str | None, title: str | None,
                 by, role: str = "investor", by_label: str | None = None) -> tuple[BoardMember, str, bool]:
    from app.board.permissions import ROLES, validate_role

    email = email.strip().lower()
    validate_role(role)
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email))).scalar_one_or_none()
    if m and is_owner(m):
        raise ApiError("You already have access: use Open board portal", status_code=409)
    if m and m.accepted_at and m.active:
        raise ApiError("This person already has board access", status_code=409)
    token = secrets.token_urlsafe(32)
    if m is None:
        m = BoardMember(email=email, name=name)
        db.add(m)
    m.name, m.organisation, m.title, m.active, m.role = name, organisation, title, True, role
    m.suspended_at = m.suspended_reason = None
    m.invite_token_hash, m.invite_expires_at = _h(token), _now() + INVITE_TTL
    m.invited_by = by.id if by else None
    m.mfa_secret = m.mfa_pending_secret = m.mfa_enabled_at = None
    await db.flush()
    link = invite_link(token)
    sent = await _email(m.email, "You're invited to BukkaPay Boardroom",
                        [f"Hello {m.name},",
                         f"You've been invited to BukkaPay Boardroom as {ROLES[role]}. The Boardroom is where "
                         "BukkaPay shares approved company information with its board, investors and shareholders: "
                         "performance, financial reports, board papers and resolutions.",
                         "You'll choose a password and set up an authenticator app (such as Google Authenticator "
                         "or Microsoft Authenticator). You'll need both every time you sign in."],
                        button=("Accept your invitation", link),
                        note="This link works once and expires in 7 days. If you weren't expecting it, ignore this email.")
    return m, link, sent


async def _invited(db: AsyncSession, token: str) -> BoardMember:
    m = (await db.execute(select(BoardMember).where(BoardMember.invite_token_hash == _h(token)))).scalar_one_or_none()
    if m is None or not m.active or not m.invite_expires_at or m.invite_expires_at < _now():
        raise ApiError("This invitation link is invalid or has expired. Ask BukkaPay for a new one.", status_code=400)
    return m


def _otpauth(m: BoardMember, secret: str) -> dict:
    from urllib.parse import quote

    label = quote(f"BukkaPay Boardroom:{m.email}")
    return {"secret": secret, "otpauthUri": f"otpauth://totp/{label}?secret={secret}&issuer=BukkaPay%20Boardroom"}


async def accept_start(db: AsyncSession, token: str) -> dict:
    """Step 1 of accepting: who the invite is for, and a new authenticator secret."""
    from app.board.permissions import ROLES
    from app.business.mfa import generate_totp_secret

    m = await _invited(db, token)
    if not m.mfa_pending_secret:
        m.mfa_pending_secret = generate_totp_secret(20)
        await db.flush()
    return {"email": m.email, "name": m.name, "role": ROLES.get(m.role, m.role), **_otpauth(m, m.mfa_pending_secret)}


async def accept(db: AsyncSession, token: str, password: str, otp: str) -> BoardMember:
    """Step 2: password + the first code from the authenticator app."""
    from app.business.mfa import verify_totp

    m = await _invited(db, token)
    _check_password(password)
    if not m.mfa_pending_secret or not verify_totp(m.mfa_pending_secret, otp):
        raise ApiError("That authenticator code is wrong. Check the app and try again.", status_code=400)
    m.password_hash = hash_secret(password)
    m.mfa_secret, m.mfa_pending_secret, m.mfa_enabled_at = m.mfa_pending_secret, None, _now()
    m.invite_token_hash, m.invite_expires_at, m.accepted_at = None, None, _now()
    m.failed_attempts, m.locked_until = 0, None
    await db.flush()
    return m


def _check_password(password: str) -> None:
    if len(password) < 12:
        raise ApiError("Use at least 12 characters for your password")
    if password.isalpha():
        raise ApiError("Add a number or a symbol to your password")


def _check_lock(m: BoardMember) -> None:
    if m.locked_until and m.locked_until > _now():
        raise ApiError("Too many attempts. Try again in 15 minutes.", status_code=429)


async def _fail(db: AsyncSession, m: BoardMember, ip: str | None = None, why: str = "password") -> None:
    from app.models.board import BoardAccessLog

    m.failed_attempts = (m.failed_attempts or 0) + 1
    if m.failed_attempts >= MAX_ATTEMPTS:
        m.locked_until, m.failed_attempts = _now() + LOCK_FOR, 0
    db.add(BoardAccessLog(member_id=m.id, action="sign_in_failed", ip=ip, details={"step": why}))
    await db.commit()


def can_sign_in(m: BoardMember | None) -> bool:
    return bool(m and m.active and not m.suspended_at and m.password_hash and m.accepted_at and not is_owner(m))


async def start_login(db: AsyncSession, email: str, password: str, ip: str | None = None) -> dict:
    """Step 1: password. Members with an authenticator go straight to the
    code; members who joined before authenticators were required get an
    emailed code once and must then set one up. Same error for every failure."""
    from app.governance.owner import is_owner_email

    if is_owner_email(email):
        return await owner_start_login(db, password, ip)
    bad = ApiError("Email or password is incorrect", status_code=401)
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email.strip().lower()))).scalar_one_or_none()
    if not can_sign_in(m):
        raise bad
    _check_lock(m)
    ok, _ = verify_secret(password, m.password_hash)
    if not ok:
        await _fail(db, m, ip)
        raise bad
    if m.mfa_secret:
        m.login_code_hash = _h(f"{m.id}:password-ok:{secrets.token_hex(8)}")  # marks step 1 as passed
        m.login_code_expires_at = _now() + CODE_TTL
        await db.flush()
        return {"method": "totp"}
    code = f"{secrets.randbelow(1_000_000):06d}"
    m.login_code_hash, m.login_code_expires_at = _h(f"{m.id}:{code}"), _now() + CODE_TTL
    await db.flush()
    await _email(m.email, f"Your BukkaPay Boardroom sign-in code: {code}",
                 [f"Hello {m.name},", "Use this code to finish signing in to BukkaPay Boardroom. After signing in "
                  "you'll be asked to set up an authenticator app."],
                 code=code, note="The code expires in 10 minutes. If this wasn't you, change your password.")
    return {"method": "email"}


async def _totp_fresh(m: BoardMember, code: str) -> bool:
    """A TOTP code is accepted once: replays inside its window are refused."""
    from app.business.mfa import verify_totp
    from app.core.redis import get_redis

    if not m.mfa_secret or not verify_totp(m.mfa_secret, code):
        return False
    return bool(await get_redis().set(f"board:totp-used:{m.id}:{code.strip()}", "1", nx=True, ex=120))


async def finish_login(db: AsyncSession, email: str, code: str, ip: str | None,
                       user_agent: str | None = None) -> tuple[str, BoardMember]:
    from app.governance.owner import is_owner_email

    if is_owner_email(email):
        return await owner_finish_login(db, code, ip, user_agent)
    bad = ApiError("That code is wrong or has expired", status_code=401)
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email.strip().lower()))).scalar_one_or_none()
    if not can_sign_in(m) or not m.login_code_hash or (m.login_code_expires_at or _now()) < _now():
        raise bad
    _check_lock(m)
    if m.mfa_secret:
        if not await _totp_fresh(m, code):
            await _fail(db, m, ip, "authenticator")
            raise bad
    elif not secrets.compare_digest(m.login_code_hash, _h(f"{m.id}:{code.strip()}")):
        await _fail(db, m, ip, "email_code")
        raise bad
    m.login_code_hash = m.login_code_expires_at = None
    m.failed_attempts, m.last_login_at = 0, _now()
    token = await _new_session(db, m, ip, user_agent)
    return token, m


async def _new_session(db: AsyncSession, m: BoardMember, ip: str | None, user_agent: str | None) -> str:
    token = secrets.token_urlsafe(32)
    db.add(BoardSession(member_id=m.id, token_hash=_h(token), expires_at=_now() + SESSION_TTL, ip=ip,
                        last_seen_at=_now(), user_agent=(user_agent or "")[:300] or None))
    await db.flush()
    return token


IDLE_TIMEOUT = timedelta(minutes=30)


async def member_for_token(db: AsyncSession, token: str) -> BoardMember | None:
    row = (await db.execute(select(BoardSession, BoardMember).join(BoardMember, BoardMember.id == BoardSession.member_id)
                            .where(BoardSession.token_hash == _h(token), BoardSession.revoked_at.is_(None),
                                   BoardSession.expires_at > _now()))).first()
    if row is None:
        return None
    s, m = row
    if not m.active or m.suspended_at:
        return None
    now = _now()
    if s.last_seen_at and now - s.last_seen_at > IDLE_TIMEOUT:
        s.revoked_at = now  # idle too long
        await db.commit()
        return None
    if not s.last_seen_at or now - s.last_seen_at > timedelta(seconds=60):
        s.last_seen_at = now
    return m


def mfa_ready(m: BoardMember) -> bool:
    """The owner proved MFA in the admin panel; everyone else needs an authenticator."""
    return is_owner(m) or bool(m.mfa_secret)


async def mfa_setup(db: AsyncSession, m: BoardMember) -> dict:
    from app.business.mfa import generate_totp_secret

    if m.mfa_secret:
        raise ApiError("Your authenticator app is already set up", status_code=409)
    m.mfa_pending_secret = m.mfa_pending_secret or generate_totp_secret(20)
    await db.flush()
    return _otpauth(m, m.mfa_pending_secret)


async def mfa_confirm(db: AsyncSession, m: BoardMember, otp: str) -> None:
    from app.business.mfa import verify_totp

    if m.mfa_secret:
        raise ApiError("Your authenticator app is already set up", status_code=409)
    if not m.mfa_pending_secret or not verify_totp(m.mfa_pending_secret, otp):
        raise ApiError("That authenticator code is wrong. Check the app and try again.", status_code=400)
    m.mfa_secret, m.mfa_pending_secret, m.mfa_enabled_at = m.mfa_pending_secret, None, _now()
    await db.flush()


RESET_TTL = timedelta(hours=1)


async def forgot_password(db: AsyncSession, email: str) -> None:
    """Always looks the same to the caller, whether or not the email is a member."""
    from app.core.config import get_settings

    m = (await db.execute(select(BoardMember).where(BoardMember.email == email.strip().lower()))).scalar_one_or_none()
    if not can_sign_in(m):
        return
    token = secrets.token_urlsafe(32)
    m.reset_token_hash, m.reset_expires_at = _h(token), _now() + RESET_TTL
    await db.flush()
    link = f"{get_settings().board_web_url.rstrip('/')}/reset?token={token}"
    await _email(m.email, "Reset your BukkaPay Boardroom password",
                 [f"Hello {m.name},", "Someone asked to reset your BukkaPay Boardroom password. "
                  "You'll also need a code from your authenticator app."],
                 button=("Choose a new password", link),
                 note="This link works once and expires in 1 hour. If you didn't ask for it, ignore this email: "
                      "your password hasn't changed.")


async def reset_password(db: AsyncSession, token: str, password: str, otp: str | None) -> BoardMember:
    m = (await db.execute(select(BoardMember).where(BoardMember.reset_token_hash == _h(token)))).scalar_one_or_none()
    if not can_sign_in(m) or not m.reset_expires_at or m.reset_expires_at < _now():
        raise ApiError("This reset link is invalid or has expired. Ask for a new one.", status_code=400)
    # An email account on its own is not enough to take over a Boardroom account.
    if m.mfa_secret and not await _totp_fresh(m, otp or ""):
        raise ApiError("That authenticator code is wrong", status_code=400)
    _check_password(password)
    m.password_hash = hash_secret(password)
    m.reset_token_hash = m.reset_expires_at = None
    m.failed_attempts, m.locked_until = 0, None
    await end_sessions(db, m.id)
    await db.flush()
    return m


async def change_password(db: AsyncSession, m: BoardMember, current: str, new: str, otp: str) -> None:
    ok, _ = verify_secret(current, m.password_hash or "")
    if not m.password_hash or not ok:
        raise ApiError("Your current password is wrong", status_code=400)
    if m.mfa_secret and not await _totp_fresh(m, otp):
        raise ApiError("That authenticator code is wrong", status_code=400)
    _check_password(new)
    m.password_hash = hash_secret(new)
    await db.flush()


OWNER_PASS_TTL = 60  # seconds
OWNER_TITLE = "Owner"


def is_owner(m: BoardMember) -> bool:
    from app.governance.owner import OWNER_EMAIL

    return m.email.lower() == OWNER_EMAIL.lower()


async def _owner_member(db: AsyncSession, admin) -> BoardMember:
    """The owner's Boardroom record. It never has a Boardroom password: the
    owner always proves who they are with their admin credentials."""
    from app.governance.owner import OWNER_EMAIL

    email = OWNER_EMAIL.lower()
    m = (await db.execute(select(BoardMember).where(BoardMember.email == email))).scalar_one_or_none()
    if m is None:
        m = BoardMember(email=email, name=admin.name or "Owner")
        db.add(m)
    m.name = admin.name or m.name
    m.title, m.organisation, m.active = OWNER_TITLE, "BukkaPay", True
    m.password_hash = m.invite_token_hash = m.invite_expires_at = None
    m.suspended_at = m.suspended_reason = None
    m.accepted_at = m.accepted_at or _now()
    await db.flush()
    return m


async def _owner_admin(db: AsyncSession):
    """The owner's admin account, if it can sign in at all (active super admin with an authenticator)."""
    from app.governance.owner import OWNER_EMAIL
    from app.models.admin import AdminUser

    a = (await db.execute(select(AdminUser).where(AdminUser.email == OWNER_EMAIL.lower()))).scalar_one_or_none()
    if a is None or not a.is_active or str(getattr(a.role, "value", a.role)) != "super_admin":
        return None
    if not a.mfa_enabled or not a.mfa_secret:
        return None  # the Boardroom never lets the owner in on a password alone
    return a


async def owner_start_login(db: AsyncSession, password: str, ip: str | None) -> dict:
    """Owner sign-in on the Boardroom page, step 1: the ADMIN password."""
    bad = ApiError("Email or password is incorrect", status_code=401)
    admin = await _owner_admin(db)
    if admin is None:
        raise bad
    m = await _owner_member(db, admin)
    _check_lock(m)
    ok, _ = verify_secret(password, admin.password)
    if not ok:
        await _fail(db, m, ip)
        raise bad
    m.login_code_hash = _h(f"{m.id}:owner-password-ok:{secrets.token_hex(8)}")
    m.login_code_expires_at = _now() + CODE_TTL
    await db.flush()
    return {"method": "totp"}


async def owner_finish_login(db: AsyncSession, code: str, ip: str | None,
                             user_agent: str | None) -> tuple[str, BoardMember]:
    """Step 2: a code from the owner's ADMIN authenticator app, accepted once."""
    from app.business.mfa import verify_totp
    from app.core.redis import get_redis

    bad = ApiError("That code is wrong or has expired", status_code=401)
    admin = await _owner_admin(db)
    if admin is None:
        raise bad
    m = await _owner_member(db, admin)
    if not m.login_code_hash or (m.login_code_expires_at or _now()) < _now():
        raise bad
    _check_lock(m)
    fresh = verify_totp(admin.mfa_secret, code) and bool(
        await get_redis().set(f"board:totp-used:owner:{code.strip()}", "1", nx=True, ex=120))
    if not fresh:
        await _fail(db, m, ip, "authenticator")
        raise bad
    m.login_code_hash = m.login_code_expires_at = None
    m.failed_attempts, m.last_login_at = 0, _now()
    return await _new_session(db, m, ip, user_agent), m


async def owner_pass(db: AsyncSession, admin) -> str:
    """The owner opens the board portal from the admin panel (which already
    needs their password and authenticator code). Returns a single-use pass
    that lives 60 seconds. The owner's board record never has a password of
    its own; on the board sign-in page the owner uses their admin password
    and admin authenticator (owner_start_login / owner_finish_login)."""
    from app.core.redis import get_redis

    m = await _owner_member(db, admin)
    m.login_code_hash = None
    await db.flush()
    code = secrets.token_urlsafe(32)
    await get_redis().set(f"board:owner-pass:{_h(code)}", str(m.id), ex=OWNER_PASS_TTL)
    return code


async def redeem_owner_pass(db: AsyncSession, code: str, ip: str | None) -> tuple[str, BoardMember]:
    from app.core.redis import get_redis

    r = get_redis()
    key = f"board:owner-pass:{_h(code)}"
    member_id = await r.get(key)
    await r.delete(key)  # single use, whatever happens next
    m = await db.get(BoardMember, uuid.UUID(member_id)) if member_id else None
    if m is None or not m.active or not is_owner(m):
        raise ApiError("This link has expired. Open the board portal again from the admin panel.", status_code=401)
    m.last_login_at = _now()
    return await _new_session(db, m, ip, None), m


async def end_sessions(db: AsyncSession, member_id, token: str | None = None) -> None:
    q = select(BoardSession).where(BoardSession.member_id == member_id, BoardSession.revoked_at.is_(None))
    if token:
        q = q.where(BoardSession.token_hash == _h(token))
    for s in (await db.execute(q)).scalars():
        s.revoked_at = _now()


async def _email(to: str, subject: str, paras: list[str], *, button: tuple[str, str] | None = None,
                 code: str | None = None, note: str | None = None) -> bool:
    from app.core.config import get_settings
    from app.integrations import email_brand as eb
    from app.integrations.resend_client import send_resend_email

    if not get_settings().resend_api_key:
        return False
    html = eb.heading(subject.split(":")[0]) + "".join(eb.paragraph(eb.esc(p)) for p in paras)
    if code:
        html += eb.code_box(code)
    if button:
        html += eb.button(*button)
    if note:
        html += eb.note(eb.esc(note))
    text = "\n\n".join(paras + ([code] if code else []) + ([f"{button[0]}: {button[1]}"] if button else []) + ([note] if note else []))
    try:
        await send_resend_email(to=to, subject=subject, html=eb.layout(html, preheader=subject), text=text)
    except Exception:  # noqa: BLE001 - the owner can share the link another way
        return False
    return True


# ─── metrics ────────────────────────────────────────────────────────────────

def _month(d: date | datetime) -> date:
    return date(d.year, d.month, 1)


def _months_back(n: int, today: date | None = None) -> list[date]:
    t = _month(today or _now().date())
    out = []
    for _ in range(n):
        out.append(t)
        t = _month(t - timedelta(days=1))
    return list(reversed(out))


def stream_of(code: str) -> str:
    """'revenue:merchant_fees:ZAR' -> 'merchant_fees'; anything unusual -> 'other'."""
    parts = (code or "").split(":")
    return parts[1] if len(parts) >= 3 and parts[0] == "revenue" else "other"


def _f(v: Decimal | None) -> float | None:
    return None if v is None else float(round(Decimal(v), 2))


def _pct(now, before) -> float | None:
    if not before:
        return None
    return round(float((Decimal(now) - Decimal(before)) / Decimal(before) * 100), 1)


async def reporting_currency(db: AsyncSession) -> str:
    latest = (await db.execute(select(BoardFinancial.currency).order_by(BoardFinancial.month.desc()).limit(1))).scalar()
    return latest or "USD"


async def overview(db: AsyncSession, *, months: int = 12) -> dict:
    from app.board.money import RateBook, month_end, snapshot_today

    reporting = await reporting_currency(db)
    await snapshot_today(db)
    book = await RateBook.load(db, reporting)
    today = _now().date()

    def on(m: date) -> date:
        return min(month_end(m), today)

    def cm(amount, ccy, m: date):  # one amount, converted at the month's own rate
        return book.convert(Decimal(amount), ccy, on(m), period=m.isoformat())

    def ct(by_ccy: dict, m: date):
        return book.total(by_ccy, on(m), period=m.isoformat())

    month_list = _months_back(months)
    start = datetime(month_list[0].year, month_list[0].month, 1, tzinfo=UTC)
    now = _now()

    def mcol(col):
        return cast(func.date_trunc(literal_column("'month'"), col), Date)

    # Users
    users_total = (await db.execute(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))).scalar_one()
    before = (await db.execute(select(func.count()).select_from(User).where(User.created_at < start))).scalar_one()
    signups = dict((await db.execute(select(mcol(User.created_at), func.count()).where(User.created_at >= start)
                                     .group_by(mcol(User.created_at)))).all())
    mau = dict((await db.execute(select(mcol(Transaction.created_at), func.count(distinct(Transaction.user_id)))
                                 .where(Transaction.created_at >= start).group_by(mcol(Transaction.created_at)))).all())
    tpv_rows = (await db.execute(select(mcol(Transaction.created_at), WalletCard.currency, func.sum(Transaction.amount),
                                        func.count())
                                 .join(WalletCard, WalletCard.id == Transaction.card_id)
                                 .where(Transaction.created_at >= start, Transaction.type == TransactionType.DEBIT)
                                 .group_by(mcol(Transaction.created_at), WalletCard.currency))).all()
    led = (await db.execute(select(mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.currency,
                                   func.sum(JournalLine.credit - JournalLine.debit))
                            .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
                            .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
                            .where(LedgerAccount.type.in_(("revenue", "expense")), JournalEntry.posted_at >= start)
                            .group_by(mcol(JournalEntry.posted_at), LedgerAccount.type, LedgerAccount.currency))).all()
    new_merchants = dict((await db.execute(select(mcol(Merchant.created_at), func.count()).where(Merchant.created_at >= start)
                                           .group_by(mcol(Merchant.created_at)))).all())
    act_merchants = dict((await db.execute(select(mcol(MerchantTransaction.created_at),
                                                  func.count(distinct(MerchantTransaction.merchant_id)))
                                           .where(MerchantTransaction.created_at >= start)
                                           .group_by(mcol(MerchantTransaction.created_at)))).all())
    fin = {f.month: f for f in (await db.execute(select(BoardFinancial).where(BoardFinancial.month >= month_list[0])))
           .scalars()}

    tpv: dict[date, dict[str, Decimal]] = {}
    txn_count: dict[date, int] = {}
    for m, c, a, n in tpv_rows:
        tpv.setdefault(m, {})[c] = Decimal(a or 0)
        txn_count[m] = txn_count.get(m, 0) + int(n)
    rev: dict[date, dict[str, Decimal]] = {}
    cost: dict[date, dict[str, Decimal]] = {}
    for m, typ, c, a in led:
        tgt = rev if str(typ) == "revenue" else cost
        sign = 1 if str(typ) == "revenue" else -1  # expenses are debit-normal
        tgt.setdefault(m, {})[c] = tgt.get(m, {}).get(c, ZERO) + sign * Decimal(a or 0)

    series, cumulative = [], before
    for m in month_list:
        cumulative += signups.get(m, 0)
        revenue = ct(rev.get(m, {}), m)
        direct = ct(cost.get(m, {}), m)
        f = fin.get(m)
        opex = None
        other_income = ZERO
        if f is not None:
            opex = sum((cm(getattr(f, k) or ZERO, f.currency, m) or ZERO) for k in COSTS)
            other_income = cm(f.other_income or ZERO, f.currency, m) or ZERO
        gross = revenue - direct
        net = None if opex is None else gross + other_income - opex
        series.append({
            "month": m.isoformat(), "signups": signups.get(m, 0), "users": cumulative, "mau": mau.get(m, 0),
            "transactions": txn_count.get(m, 0), "tpv": _f(ct(tpv.get(m, {}), m)),
            "revenue": _f(revenue), "directCosts": _f(direct), "grossProfit": _f(gross),
            "operatingCosts": _f(opex), "otherIncome": _f(other_income) if f else None, "netProfit": _f(net),
            "cash": _f(cm(f.cash_balance, f.currency, m)) if f and f.cash_balance is not None else None,
            "fundingRaised": _f(cm(f.funding_raised or ZERO, f.currency, m)) if f else None,
            "headcount": f.headcount if f else None,
            "costBreakdown": {k: _f(cm(getattr(f, k) or ZERO, f.currency, m)) for k in COSTS} if f else None,
            "newMerchants": new_merchants.get(m, 0), "activeMerchants": act_merchants.get(m, 0),
        })

    cur, prev = series[-1], series[-2] if len(series) > 1 else None
    # Trailing 30 days
    d30 = now - timedelta(days=30)
    act30 = (await db.execute(select(func.count(distinct(Transaction.user_id))).where(Transaction.created_at >= d30))).scalar_one()
    tpv30 = book.total({c: Decimal(a or 0) for c, a in (await db.execute(
        select(WalletCard.currency, func.sum(Transaction.amount)).join(WalletCard, WalletCard.id == Transaction.card_id)
        .where(Transaction.created_at >= d30, Transaction.type == TransactionType.DEBIT).group_by(WalletCard.currency))).all()},
        today)
    n30 = (await db.execute(select(func.count()).select_from(Transaction).where(
        Transaction.created_at >= d30, Transaction.type == TransactionType.DEBIT))).scalar_one()
    rev30 = book.total({c: Decimal(a or 0) for c, a in (await db.execute(
        select(LedgerAccount.currency, func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.account_id == LedgerAccount.id)
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(LedgerAccount.type == "revenue", JournalEntry.posted_at >= d30).group_by(LedgerAccount.currency))).all()},
        today)
    funds = {c: Decimal(a or 0) for c, a in (await db.execute(select(WalletCard.currency, func.sum(WalletCard.balance))
                                                            .group_by(WalletCard.currency))).all()}

    # Burn & runway from the last three months with management accounts
    nets = [Decimal(str(s["netProfit"])) for s in series[-3:] if s["netProfit"] is not None]
    burn = -sum(nets) / len(nets) if nets and sum(nets) < 0 else ZERO
    cash = next((Decimal(str(s["cash"])) for s in reversed(series) if s["cash"] is not None), None)
    runway = round(float(cash / burn), 1) if cash is not None and burn > 0 else None

    # Revenue by stream: ledger revenue accounts by code, each month at its own rate.
    stream_rows = (await db.execute(
        select(mcol(JournalEntry.posted_at), LedgerAccount.code, LedgerAccount.currency,
               func.sum(JournalLine.credit - JournalLine.debit))
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .where(LedgerAccount.type == "revenue", JournalEntry.posted_at >= start)
        .group_by(mcol(JournalEntry.posted_at), LedgerAccount.code, LedgerAccount.currency))).all()
    merged: dict[str, Decimal] = {}
    for m, code, c, a in stream_rows:
        v = cm(Decimal(a or 0), c, m)
        if v is not None:
            k = stream_of(code)
            merged[k] = merged.get(k, ZERO) + v

    countries = (await db.execute(select(Country.status, func.count()).where(Country.region == "Africa")
                                  .group_by(Country.status))).all()
    by_country = (await db.execute(select(User.residence_country, func.count()).where(User.deleted_at.is_(None))
                                   .group_by(User.residence_country).order_by(func.count().desc()).limit(12))).all()
    ytd = [s for s in series if s["month"][:4] == str(now.year)]

    method = book.methodology()
    return {
        "reportingCurrency": reporting, "fxAt": max((r["rateDate"] for r in method["ratesUsed"]), default=None),
        "unconverted": sorted({u["currency"] for u in method["unconverted"]}), "fxMethodology": method,
        "generatedAt": now.isoformat(),
        "kpis": {
            "users": users_total, "mau": act30, "mauChange": _pct(cur["mau"], prev["mau"]) if prev else None,
            "activation": round(act30 / users_total * 100, 1) if users_total else 0,
            "newUsersThisMonth": cur["signups"], "signupGrowth": _pct(cur["signups"], prev["signups"]) if prev else None,
            "tpv30": _f(tpv30), "revenue30": _f(rev30), "transactions30": n30,
            "takeRate": round(float(rev30 / tpv30 * 100), 2) if tpv30 else None,
            "arpu": _f(rev30 / act30) if act30 else None, "avgTicket": _f(tpv30 / n30) if n30 else None,
            "revenueGrowth": _pct(cur["revenue"] or 0, prev["revenue"] or 0) if prev else None,
            "merchants": (await db.execute(select(func.count()).select_from(Merchant))).scalar_one(),
            "activeMerchants": cur["activeMerchants"],
            "customerFunds": _f(book.total(funds, today)),
            "monthlyBurn": _f(burn), "cash": _f(cash), "runwayMonths": runway,
            "revenueYtd": _f(sum(Decimal(str(s["revenue"] or 0)) for s in ytd)),
            "netYtd": _f(sum(Decimal(str(s["netProfit"])) for s in ytd if s["netProfit"] is not None))
            if any(s["netProfit"] is not None for s in ytd) else None,
            "countriesLive": sum(n for st, n in countries if st == "live"),
            "countriesPilot": sum(n for st, n in countries if st == "pilot"),
        },
        "series": series,
        "revenueStreams": sorted(({"stream": k, "amount": _f(v)} for k, v in merged.items()),
                                 key=lambda r: r["amount"], reverse=True),
        "markets": [{"country": c or "Unknown", "users": n} for c, n in by_country],
        "cohorts": await cohorts(db),
    }


async def cohorts(db: AsyncSession, n: int = 6) -> list[dict]:
    """Share of each signup-month cohort that transacted in each later month."""
    months = _months_back(n)
    start = datetime(months[0].year, months[0].month, 1, tzinfo=UTC)
    cm = cast(func.date_trunc(literal_column("'month'"), User.created_at), Date)
    sizes = dict((await db.execute(select(cm, func.count()).where(User.created_at >= start).group_by(cm))).all())
    am = cast(func.date_trunc(literal_column("'month'"), Transaction.created_at), Date)
    rows = (await db.execute(select(cm, am, func.count(distinct(Transaction.user_id)))
                             .join(User, User.id == Transaction.user_id)
                             .where(User.created_at >= start, Transaction.created_at >= start)
                             .group_by(cm, am))).all()
    act: dict[tuple, int] = {(c, a): k for c, a, k in rows}
    out = []
    for i, c in enumerate(months):
        size = sizes.get(c, 0)
        cells = []
        for a in months[i:]:
            k = act.get((c, a), 0)
            cells.append(round(k / size * 100, 1) if size else None)
        out.append({"cohort": c.isoformat(), "size": size, "retention": cells})
    return out


async def updates(db: AsyncSession, *, published_only: bool = True) -> list[dict]:
    q = select(BoardUpdate).order_by(BoardUpdate.created_at.desc())
    if published_only:
        q = q.where(BoardUpdate.published_at.is_not(None))
    return [{"id": str(u.id), "title": u.title, "period": u.period, "body": u.body, "category": u.category,
             "audience": u.audience or [], "documentIds": u.document_ids or [],
             "publishedAt": u.published_at.isoformat() if u.published_at else None,
             "createdAt": u.created_at.isoformat() if u.created_at else None}
            for u in (await db.execute(q)).scalars()]
