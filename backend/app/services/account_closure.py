"""Account deletion (closure), for customers in the app and for admins.

1. Blockers: an account can't close while it still holds or is moving
   money (wallet or business balance, a cash-out code, a payout in flight).
   The customer withdraws first; money is never deleted.
2. The identity details the law requires us to keep are sealed into
   `closed_accounts` for RETENTION_YEARS, then purged by a daily job.
3. The live account is anonymised at once: name, email, username, phone,
   photo, password, PIN, biometrics and Apple link removed; every session
   ended; push devices, saved contacts and beneficiaries deleted.
4. A confirmation goes to the email address the account had.

Transaction and ledger records stay (they hold no contact details beyond
the anonymised account), as financial record-keeping law requires.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.closure import ClosedAccount
from app.models.user import User, UserSession
from app.models.wallet import WalletCard

RETENTION_YEARS = 5


async def blockers(db: AsyncSession, user: User) -> list[str]:
    out: list[str] = []
    for w in (await db.execute(select(WalletCard).where(WalletCard.user_id == user.id))).scalars():
        if Decimal(w.balance or 0) != 0:
            out.append(f"Your {w.currency} wallet still has {w.currency} {Decimal(w.balance):.2f}. "
                       "Withdraw or send it first.")
    from app.models.merchant import Merchant

    for m in (await db.execute(select(Merchant).where(Merchant.user_id == user.id))).scalars():
        if Decimal(m.wallet_balance or 0) != 0:
            out.append(f"Your business {m.business_name} still has a balance. Withdraw it first.")
    from app.models.revenue import AgentTransaction

    if (await db.execute(select(func.count()).select_from(AgentTransaction).where(
            AgentTransaction.user_id == user.id, AgentTransaction.status == "pending"))).scalar_one():
        out.append("You have an unused cash withdrawal code. Cancel it first.")
    from app.models.payouts import Payout

    if (await db.execute(select(func.count()).select_from(Payout).where(
            Payout.user_id == user.id, Payout.status.in_(("confirmed", "submitted", "processing"))))).scalar_one():
        out.append("A transfer abroad is still on its way. Wait for it to finish.")
    return out


async def close(db: AsyncSession, user: User, *, by: str, reason: str | None = None, force: bool = False) -> ClosedAccount:
    if user.deleted_at is not None:
        raise ApiError("This account is already closed", status_code=409)
    problems = await blockers(db, user)
    if problems and not force:
        raise ApiError(" ".join(problems), status_code=409)
    now = datetime.now(UTC)
    original_email, original_name = user.email, user.name
    record = ClosedAccount(
        user_id=user.id, wallet_id=user.wallet_id, closed_by=by, reason=(reason or "")[:500] or None,
        closed_at=now, retain_until=now + timedelta(days=365 * RETENTION_YEARS),
        snapshot={
            "name": user.name, "email": user.email, "username": user.username, "phone": user.phone,
            "country_code": user.country_code, "residence_country": user.residence_country,
            "account_type": str(user.account_type), "kyc_level": user.kyc_level, "kyc_status": str(user.kyc_status),
            "kyc_full_name": user.kyc_full_name, "kyc_document_type": user.kyc_document_type,
            "kyc_document_number": user.kyc_document_number,
            "terms_accepted_at": user.terms_accepted_at.isoformat() if user.terms_accepted_at else None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
    )
    db.add(record)

    suffix = str(user.id)
    user.name = "Deleted User"
    user.email = f"deleted-{suffix}@bukkapay.internal"
    user.username = f"deleted-{suffix}"
    user.phone = None
    user.avatar = None
    user.password = None
    user.transaction_pin = None
    user.biometric_enabled = False
    user.apple_sub = None
    user.kyc_full_name = None
    user.kyc_document_number = None
    user.frozen = True
    user.deleted_at = now
    from app.core import session as session_cache

    for (token,) in (await db.execute(select(UserSession.token).where(UserSession.user_id == user.id))).all():
        await session_cache.cache_delete(token)
    await db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    from app.models.loyalty import Beneficiary
    from app.models.misc import Contact
    from app.push import service as push_service

    await push_service.remove_all_devices(db, user.id)
    for model in (Contact, Beneficiary):
        if hasattr(model, "user_id"):
            await db.execute(delete(model).where(model.user_id == user.id))
    await db.flush()
    await _confirm(original_email, original_name)
    return record


async def _confirm(email: str | None, name: str | None) -> None:
    if not email or email.endswith("@bukkapay.internal"):
        return
    try:
        from app.integrations import email_brand as eb
        from app.integrations.resend_client import send_resend_email

        body = (eb.heading("Your BukkaPay account is closed")
                + eb.paragraph(f"Hi {eb.esc(name or 'there')}, your BukkaPay account has been closed and you've been "
                               "signed out everywhere. Your profile, contacts and devices have been deleted.")
                + eb.paragraph("We keep identity and transaction records for five years because financial "
                               "regulations require it; they're stored securely and then deleted.")
                + eb.note("Didn't ask for this? Contact us straight away."))
        await send_resend_email(to=email, subject="Your BukkaPay account is closed", html=body,
                                text="Your BukkaPay account has been closed and you have been signed out everywhere. "
                                     "Identity and transaction records are kept for five years as financial "
                                     "regulations require, then deleted. Did not ask for this? Contact support.")
    except Exception:  # noqa: BLE001 - the closure must not fail because email is down
        from app.core.logging import log

        log.warning("account_closed_email_failed")


async def purge_expired(db: AsyncSession, *, now: datetime | None = None, limit: int = 500) -> int:
    now = now or datetime.now(UTC)
    rows = (await db.execute(select(ClosedAccount).where(ClosedAccount.retain_until < now,
                                                         ClosedAccount.purged_at.is_(None)).limit(limit))).scalars().all()
    for r in rows:
        r.snapshot, r.purged_at = None, now
    await db.flush()
    return len(rows)
