import secrets
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.integrations import stitch
from app.ledger import accounts as ledger_accounts
from app.ledger import chart, posting
from app.models.enums import (
    MerchantBusinessType,
    MerchantStaffRole,
    MerchantStaffStatus,
    MerchantTransactionStatus,
    MerchantTransactionType,
    NotificationType,
    SubscriptionStatus,
    TransactionType,
)
from app.models.merchant import Merchant, MerchantStaff, MerchantSubscription, MerchantTransaction
from app.models.user import User
from app.models.wallet import Transaction, WalletCard
from app.network import fees
from app.services import notification_service, pin_service
from app.services.stitch_service import STITCH_BANKS

SUBSCRIPTION_PLANS = {"starter": Decimal(0), "pro": Decimal(99), "business": Decimal(299)}

# Merchants hold one settlement balance today; per-merchant currency
# arrives with multi-country merchant onboarding.
MERCHANT_SETTLEMENT_CURRENCY = "ZAR"


async def get_merchants_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Merchant]:
    """Merchants this user owns, plus any they have active staff access to
    — so a staff member sees the business(es) they work for when they open
    the app with their own regular BukkaPay account."""
    owned = (await db.execute(select(Merchant).where(Merchant.user_id == user_id))).scalars().all()
    staff_merchant_ids = (
        await db.execute(
            select(MerchantStaff.merchant_id).where(
                MerchantStaff.user_id == user_id, MerchantStaff.status == MerchantStaffStatus.ACTIVE
            )
        )
    ).scalars().all()
    staffed = []
    if staff_merchant_ids:
        staffed = (
            await db.execute(select(Merchant).where(Merchant.id.in_(staff_merchant_ids)))
        ).scalars().all()
    seen_ids = {m.id for m in owned}
    return list(owned) + [m for m in staffed if m.id not in seen_ids]


async def get_merchant(db: AsyncSession, merchant_id: str) -> Merchant | None:
    try:
        merchant_uuid = uuid.UUID(merchant_id)
    except ValueError:
        return None
    result = await db.execute(select(Merchant).where(Merchant.id == merchant_uuid))
    return result.scalar_one_or_none()


async def get_merchant_by_payment_link(db: AsyncSession, payment_link: str) -> Merchant | None:
    result = await db.execute(select(Merchant).where(Merchant.payment_link == payment_link))
    return result.scalar_one_or_none()


async def create_merchant(db: AsyncSession, user_id: uuid.UUID, **fields) -> Merchant:
    if not fields.get("business_name"):
        raise ApiError("Business name is required")
    if not fields.get("business_type"):
        raise ApiError("Business type is required")
    from app.core import brand_guard

    brand_guard.check(fields.get("business_name"), fields.get("description"), what="business name")
    if fields["business_type"] not in MerchantBusinessType.__members__.values():
        raise ApiError(f"Unsupported business type: {fields['business_type']}")

    qr_code = f"BKP-{secrets.token_hex(8).upper()}"
    payment_link = f"pay-{secrets.token_hex(6)}"

    merchant = Merchant(
        user_id=user_id,
        qr_code=qr_code,
        payment_link=payment_link,
        subscription_plan=fields.get("subscription_plan") or "starter",
        **{k: v for k, v in fields.items() if k != "subscription_plan" and v is not None},
    )
    db.add(merchant)
    await db.flush()
    return merchant


async def delete_merchant(db: AsyncSession, merchant: Merchant) -> None:
    from app.models.ledger import LedgerAccount

    has_money_history = (await db.execute(
        select(LedgerAccount.id).where(LedgerAccount.merchant_id == merchant.id))).first()
    if has_money_history:
        raise ApiError("A business with payment history can't be deleted. Deactivate it instead.", status_code=409)
    await db.delete(merchant)
    await db.flush()


async def update_merchant(db: AsyncSession, merchant: Merchant, **fields) -> Merchant:
    for key, value in fields.items():
        if value is not None:
            setattr(merchant, key, value)
    await db.flush()
    return merchant


async def update_banking_details(
    db: AsyncSession, merchant: Merchant, *, bank_id: str, account_holder: str,
    account_number: str, account_type: str,
) -> Merchant:
    bank = next((b for b in STITCH_BANKS if b["id"] == bank_id), None)
    if bank is None:
        raise ApiError("Unsupported bank")
    if not account_holder.strip() or not account_number.strip():
        raise ApiError("Account holder name and account number are required")

    merchant.bank_id = bank_id
    merchant.bank_name = bank["name"]
    merchant.account_holder = account_holder.strip()
    merchant.account_number = account_number.strip()
    merchant.account_type = account_type or "savings"
    await db.flush()
    return merchant


# ─── Staff ───────────────────────────────────────────────────────────────────

def _generate_staff_code() -> str:
    date_str = datetime.now(UTC).strftime("%Y%m%d")
    random_part = secrets.randbelow(9000) + 1000
    return f"STAFF-{date_str}-{random_part}"


async def get_staff_membership(db: AsyncSession, merchant_id: uuid.UUID, user_id: uuid.UUID) -> MerchantStaff | None:
    result = await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.merchant_id == merchant_id,
            MerchantStaff.user_id == user_id,
            MerchantStaff.status == MerchantStaffStatus.ACTIVE,
        )
    )
    return result.scalar_one_or_none()


async def list_staff(db: AsyncSession, merchant_id: uuid.UUID) -> list[MerchantStaff]:
    result = await db.execute(
        select(MerchantStaff)
        .where(MerchantStaff.merchant_id == merchant_id, MerchantStaff.status != MerchantStaffStatus.REMOVED)
        .order_by(MerchantStaff.created_at.desc())
    )
    return list(result.scalars().all())


async def invite_staff(db: AsyncSession, merchant_id: uuid.UUID, *, name: str, role: str) -> MerchantStaff:
    if not name.strip():
        raise ApiError("Staff member name is required")
    if role not in MerchantStaffRole.__members__.values():
        raise ApiError(f"Unsupported role: {role}")

    staff = MerchantStaff(
        merchant_id=merchant_id, invite_code=_generate_staff_code(), name=name.strip(),
        role=role, status=MerchantStaffStatus.PENDING,
    )
    db.add(staff)
    await db.flush()
    return staff


async def get_staff_by_code(db: AsyncSession, invite_code: str) -> MerchantStaff | None:
    result = await db.execute(select(MerchantStaff).where(MerchantStaff.invite_code == invite_code))
    return result.scalar_one_or_none()


async def get_staff_by_id(db: AsyncSession, merchant_id: uuid.UUID, staff_id: str) -> MerchantStaff | None:
    try:
        staff_uuid = uuid.UUID(staff_id)
    except ValueError:
        return None
    result = await db.execute(
        select(MerchantStaff).where(MerchantStaff.id == staff_uuid, MerchantStaff.merchant_id == merchant_id)
    )
    return result.scalar_one_or_none()


async def link_staff(db: AsyncSession, user_id: uuid.UUID, invite_code: str) -> MerchantStaff:
    staff = await get_staff_by_code(db, invite_code)
    if staff is None:
        raise ApiError("Invite code not found", status_code=404)
    if staff.status != MerchantStaffStatus.PENDING:
        raise ApiError("This invite has already been used or removed")

    existing = await get_staff_membership(db, staff.merchant_id, user_id)
    if existing is not None:
        raise ApiError("You already have staff access to this business")

    staff.user_id = user_id
    staff.status = MerchantStaffStatus.ACTIVE
    staff.linked_at = datetime.now(UTC)
    await db.flush()
    return staff


async def update_staff_role(db: AsyncSession, staff: MerchantStaff, role: str) -> MerchantStaff:
    if role not in MerchantStaffRole.__members__.values():
        raise ApiError(f"Unsupported role: {role}")
    staff.role = role
    await db.flush()
    return staff


async def remove_staff(db: AsyncSession, staff: MerchantStaff) -> None:
    staff.status = MerchantStaffStatus.REMOVED
    await db.flush()


async def get_merchant_transactions(
    db: AsyncSession, merchant_id: uuid.UUID, limit: int | None = None
) -> list[MerchantTransaction]:
    # No default cap here: compute_analytics (below) deliberately calls this
    # with no limit at all, since it needs the merchant's entire history to
    # compute accurate totals/top-customers/growth — capping it would
    # silently corrupt those numbers for any merchant past the cap. The
    # list endpoint that actually paginates for a user-facing view passes
    # its own explicit limit.
    stmt = (
        select(MerchantTransaction)
        .where(MerchantTransaction.merchant_id == merchant_id)
        .order_by(MerchantTransaction.created_at.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


INDIVIDUAL_ELIGIBLE = {
    MerchantBusinessType.STREET_VENDOR, MerchantBusinessType.TUCKSHOP, MerchantBusinessType.RENTAL,
    MerchantBusinessType.SERVICES, MerchantBusinessType.RETAIL, MerchantBusinessType.RESTAURANT,
    MerchantBusinessType.OTHER,
}
INDIVIDUAL_MIN_KYC = 2


async def _individual_rule(db: AsyncSession, merchant: Merchant, owner: User):
    from app.models.platform import TransactionLimit

    return (
        await db.execute(
            select(TransactionLimit)
            .where(TransactionLimit.product == "merchant_individual", TransactionLimit.active.is_(True),
                   TransactionLimit.kyc_level <= (owner.kyc_level or 0),
                   (TransactionLimit.country_code.is_(None)) | (TransactionLimit.country_code == merchant.country_code),
                   (TransactionLimit.currency.is_(None)) | (TransactionLimit.currency == merchant.settlement_currency))
            .order_by(TransactionLimit.kyc_level.desc())
        )
    ).scalars().first()


async def verify_as_individual(db: AsyncSession, merchant: Merchant) -> Merchant:
    """Instant approval for an individual seller: no business documents, the
    owner's verified ID stands in for KYB. Collections are capped."""
    owner = await db.get(User, merchant.user_id)
    if merchant.kyb_status == "approved":
        raise ApiError("This business is already verified", status_code=409)
    if merchant.business_type not in INDIVIDUAL_ELIGIBLE:
        raise ApiError("This business type needs full business verification", status_code=409)
    if owner is None or owner.frozen or (owner.kyc_level or 0) < INDIVIDUAL_MIN_KYC:
        raise ApiError("Verify your own ID in the BukkaPay app first", status_code=403)
    if await _individual_rule(db, merchant, owner) is None:
        raise ApiError("Individual seller accounts aren't available in this country yet", status_code=409)
    merchant.verification_tier = "individual"
    merchant.kyb_status = "approved"
    merchant.kyb_submitted_at = merchant.kyb_reviewed_at = datetime.now(UTC)
    merchant.kyb_rejection_reason = None
    merchant.kyb_details = {"tier": "individual", "verifiedVia": "owner_kyc", "ownerKycLevel": owner.kyc_level}
    await db.flush()
    return merchant


async def check_collection_cap(db: AsyncSession, merchant: Merchant, amount: Decimal) -> None:
    """Individual sellers may only collect up to their tier's limits; above
    that they upgrade to full business verification. Usage is measured from
    the ledger: what the seller actually received (credits to the merchant's
    accounts, i.e. after fees)."""
    if merchant.verification_tier != "individual":
        return
    from datetime import timedelta

    from sqlalchemy import func

    from app.models.ledger import JournalEntry, JournalLine, LedgerAccount

    owner = await db.get(User, merchant.user_id)
    rule = await _individual_rule(db, merchant, owner) if owner else None
    if rule is None or owner.frozen or (owner.kyc_level or 0) < INDIVIDUAL_MIN_KYC:
        raise ApiError("This seller can't accept payments right now", status_code=403)
    upgrade = " The seller can raise this by completing business verification."
    if rule.per_transaction_max is not None and amount > rule.per_transaction_max:
        raise ApiError(f"This seller accepts at most {merchant.settlement_currency} {rule.per_transaction_max} per payment.{upgrade}", status_code=403)
    now = datetime.now(UTC)
    for window, cap, label in ((timedelta(days=1), rule.daily_max, "daily"), (timedelta(days=30), rule.monthly_max, "monthly")):
        if cap is None:
            continue
        used = Decimal((await db.execute(
            select(func.coalesce(func.sum(JournalLine.credit), 0))
            .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
            .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
            .where(LedgerAccount.code.like(f"merchant:{merchant.id}:%"),
                   JournalEntry.kind.notin_(("opening_balance", "manual_adjustment")),
                   JournalEntry.posted_at >= now - window)
        )).scalar_one())
        if used + amount > cap:
            raise ApiError(f"This seller has reached their {label} collection limit.{upgrade}", status_code=403)


def require_can_transact(merchant: Merchant) -> None:
    if not merchant.is_active:
        raise ApiError("This merchant is not active", status_code=403)
    verified = merchant.kyb_status == "approved" or (
        # an individual seller applying to upgrade keeps trading under their caps
        merchant.verification_tier == "individual" and merchant.kyb_status == "pending"
    )
    if not verified:
        raise ApiError("This business hasn't completed verification yet and can't accept payments",
                       status_code=403)


async def merchant_pay(
    db: AsyncSession, merchant: Merchant, *, amount: str | None, payer_id: uuid.UUID,
    payer_name: str | None, reference: str | None, qr_payload: str | None = None,
) -> tuple[MerchantTransaction, Decimal]:
    """A signed-in customer pays a verified merchant from their wallet.
    With a signed QR payload, the amount/currency/reference of a dynamic QR
    come from the stored QR — never from the client."""
    require_can_transact(merchant)
    currency = merchant.settlement_currency
    qr = None
    if qr_payload:
        from app.merchants import qr as merchant_qr

        qr, qr_merchant = await merchant_qr.resolve(db, qr_payload)
        if qr_merchant.id != merchant.id:
            raise ApiError("This QR code belongs to a different merchant", status_code=400)
        currency = qr.currency
        if qr.kind == "dynamic":
            amount = str(qr.amount)
            reference = qr.reference or reference
    parsed_amount = posting.parse_amount(amount or "")
    if parsed_amount > merchant.daily_limit:
        raise ApiError(f"This exceeds the merchant's per-payment limit of {currency} {merchant.daily_limit}")
    await check_collection_cap(db, merchant, parsed_amount)
    card = (
        await db.execute(
            select(WalletCard)
            .where(WalletCard.user_id == payer_id, WalletCard.currency == currency)
            .order_by(WalletCard.is_default.desc(), WalletCard.created_at)
        )
    ).scalars().first()
    if card is None:
        raise ApiError(f"You need a {currency} wallet to pay this merchant")
    if card.frozen or card.blocked or card.flagged:
        raise ApiError("This card is restricted", status_code=403)
    payer = await db.get(User, payer_id)
    if payer is None or payer.frozen:
        raise ApiError("Your account is restricted", status_code=403)

    fee = await fees.compute(db, "merchant_payment", parsed_amount, currency=currency,
                             country=merchant.country_code, merchant_category=str(merchant.business_type))
    transaction = MerchantTransaction(
        merchant_id=merchant.id,
        payer_id=payer_id,
        payer_name=payer_name or payer.name or "BukkaPay customer",
        amount=parsed_amount,
        type=MerchantTransactionType.PAYMENT,
        status=MerchantTransactionStatus.COMPLETED,
        reference=reference,
    )
    db.add(transaction)
    await db.flush()
    entry = await posting.post(
        db, kind="merchant_payment", description=f"Payment to merchant {merchant.id}",
        legs=[
            posting.debit(await ledger_accounts.wallet_account(db, card), parsed_amount),
            posting.credit(await ledger_accounts.merchant_account(db, merchant, currency), parsed_amount - fee.fee),
            posting.credit(await chart.sys_account(db, "SYS_REVENUE_MERCHANT_FEES", currency), fee.fee),
        ],
        details={"merchant_id": str(merchant.id), "merchant_transaction_id": str(transaction.id),
                 "payer_card_id": str(card.id),
                 "sender_id": str(payer_id), "fee": str(fee.fee), "fee_breakdown": fee.breakdown,
                 "qr_id": str(qr.id) if qr else None},
    )
    if qr is not None and qr.kind == "dynamic":
        qr.status = "paid"
        qr.paid_at = datetime.now(UTC)
    db.add(Transaction(
        user_id=payer_id, card_id=card.id, title=f"Paid {merchant.business_name}", category="merchant",
        amount=parsed_amount, type=TransactionType.DEBIT, icon="store",
    ))
    from app.merchants import webhooks_out
    from app.network import compliance

    await webhooks_out.emit(db, merchant.id, "payment.succeeded", {
        "transactionId": str(transaction.id), "amount": str(parsed_amount), "fee": str(fee.fee),
        "net": str(parsed_amount - fee.fee), "currency": currency, "reference": reference,
        "ledgerReference": entry.reference,
    })
    await compliance.evaluate(db, user=payer, amount=parsed_amount, currency=currency, kind="merchant_payment",
                              reference=entry.reference)
    await db.flush()
    return transaction, merchant.wallet_balance


async def withdraw(
    db: AsyncSession, merchant: Merchant, user_id: uuid.UUID, *, amount: str, currency: str | None, pin: str | None,
) -> dict:
    """Real payout via Stitch disbursement to the merchant's saved banking
    details (set once from Settings — see update_banking_details), instead
    of re-entering bank details on every withdrawal and instead of the
    previous fake "pending, arrives in 1-3 days" flow that never actually
    moved any money."""
    await pin_service.verify_pin(db, user_id, pin)

    parsed_amount = posting.parse_amount(amount, field="withdrawal amount")
    require_can_transact(merchant)
    fee = await fees.compute(db, "withdrawal", parsed_amount, currency=merchant.settlement_currency,
                             country=merchant.country_code, method="bank_payout")
    if not merchant.bank_id or not merchant.account_number or not merchant.account_holder:
        raise ApiError("Set up your banking details in Settings before withdrawing")

    current_balance = merchant.wallet_balance
    if parsed_amount + fee.fee > current_balance:
        raise ApiError(f"Insufficient balance. Available: {current_balance:.2f}")

    if not stitch.is_stitch_payments_configured():
        raise ApiError("Payouts are not yet available — contact support", status_code=503)

    reference = f"MWD-{secrets.token_hex(5).upper()}"
    # Debit first (locked, non-negative), commit, then call the provider, so
    # a timeout can't pay out twice or lose the merchant's money.
    entry = await posting.post(
        db, kind="merchant_withdrawal", description=f"Merchant payout {reference}",
        legs=[
            posting.debit(await ledger_accounts.merchant_account(db, merchant), parsed_amount + fee.fee),
            posting.credit(await ledger_accounts.payouts_pending(db, merchant.settlement_currency), parsed_amount),
            posting.credit(await chart.sys_account(db, "SYS_REVENUE_CASHOUT", merchant.settlement_currency), fee.fee),
        ],
        details={"merchant_id": str(merchant.id), "reference": reference},
    )
    payout = MerchantTransaction(
        merchant_id=merchant.id,
        amount=parsed_amount,
        type=MerchantTransactionType.WITHDRAWAL,
        status=MerchantTransactionStatus.PENDING,
        reference=reference,
    )
    db.add(payout)
    await db.commit()
    new_balance = merchant.wallet_balance
    try:
        disbursement = await stitch.create_disbursement(
            amount=float(parsed_amount), currency=merchant.settlement_currency, reference=reference,
            recipient_name=merchant.account_holder, bank_id=merchant.bank_id,
            account_number=merchant.account_number, account_type=merchant.account_type or "savings",
        )
    except stitch.StitchRejected as e:
        await posting.reverse(db, entry, description=f"Merchant payout {reference} rejected by provider")
        payout.status = MerchantTransactionStatus.FAILED
        await db.commit()
        raise ApiError("The bank payout was rejected. Your balance has been restored.", status_code=502) from e
    except Exception:  # noqa: BLE001 - outcome unknown; stays pending for reconciliation
        disbursement = {"id": None, "status": "processing"}

    currency = merchant.settlement_currency
    try:
        await notification_service.create_notification(
            db, user_id, NotificationType.INFO, "Withdrawal Requested",
            f"Your withdrawal of {currency} {parsed_amount:.2f} to {merchant.bank_name} has been "
            f"submitted and will arrive in 1–2 business days.",
        )
    except Exception:
        pass

    return {
        "success": True,
        "message": "Withdrawal submitted. Funds typically arrive within 1–2 business days.",
        "newBalance": f"{new_balance:.2f}",
        "amount": f"{parsed_amount:.2f}",
        "currency": currency,
        "disbursementId": disbursement["id"],
        "status": disbursement["status"],
        "fee": f"{fee.fee:.2f}",
    }


async def subscribe(db: AsyncSession, merchant: Merchant, plan: str) -> datetime:
    if plan not in SUBSCRIPTION_PLANS:
        raise ApiError("Invalid plan")

    expires_at = datetime.now(UTC) + timedelta(days=30)
    price = SUBSCRIPTION_PLANS[plan]

    existing = await db.execute(
        select(MerchantSubscription).where(MerchantSubscription.merchant_id == merchant.id)
    )
    if existing.scalar_one_or_none() is None:
        db.add(MerchantSubscription(
            merchant_id=merchant.id, plan=plan, status=SubscriptionStatus.ACTIVE,
            price=price, billing_cycle="monthly", expires_at=expires_at,
        ))

    merchant.subscription_plan = plan
    merchant.subscription_status = SubscriptionStatus.ACTIVE
    merchant.subscription_expires_at = expires_at
    await db.flush()
    return expires_at


async def get_pay_info(db: AsyncSession, merchant: Merchant) -> dict:
    result = await db.execute(select(User).where(User.id == merchant.user_id))
    owner = result.scalar_one_or_none()
    return {
        "merchantId": merchant.id,
        "businessName": merchant.business_name,
        "businessType": merchant.business_type,
        "qrCode": merchant.qr_code,
        "ownerName": owner.name if owner else "Unknown",
    }


def compute_analytics(transactions: list[MerchantTransaction], daily_limit: Decimal) -> dict:
    now = datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)
    prev_month_start = month_ago - timedelta(days=30)

    def tx_at(tx: MerchantTransaction) -> datetime:
        ts = tx.created_at
        return ts if ts.tzinfo else ts.replace(tzinfo=UTC)

    today_txs = [t for t in transactions if tx_at(t) >= today]
    week_txs = [t for t in transactions if tx_at(t) >= week_ago]
    month_txs = [t for t in transactions if tx_at(t) >= month_ago]
    prev_month_txs = [t for t in transactions if prev_month_start <= tx_at(t) < month_ago]

    def total(txs: list[MerchantTransaction]) -> Decimal:
        return sum((t.amount for t in txs), Decimal(0))

    def avg(txs: list[MerchantTransaction]) -> Decimal:
        return total(txs) / len(txs) if txs else Decimal(0)

    unique_customers = {t.payer_id for t in transactions if t.payer_id}
    month_customers = {t.payer_id for t in month_txs if t.payer_id}

    customer_map: dict[str, dict] = defaultdict(lambda: {"name": "Anonymous", "total": Decimal(0), "count": 0})
    for t in transactions:
        key = str(t.payer_id) if t.payer_id else (t.payer_name or "anonymous")
        entry = customer_map[key]
        entry["name"] = t.payer_name or "Anonymous"
        entry["total"] += t.amount
        entry["count"] += 1
    top_customers = sorted(customer_map.values(), key=lambda c: c["total"], reverse=True)[:5]

    monthly_chart = []
    for i in range(29, -1, -1):
        day = today - timedelta(days=i)
        day_txs = [t for t in transactions if tx_at(t).date() == day.date()]
        monthly_chart.append({"date": day.date().isoformat(), "amount": float(total(day_txs)), "count": len(day_txs)})
    daily_chart = monthly_chart[-7:]

    completed = [t for t in transactions if t.status == MerchantTransactionStatus.COMPLETED]
    pending = [t for t in transactions if t.status == MerchantTransactionStatus.PENDING]
    failed = [t for t in transactions if t.status == MerchantTransactionStatus.FAILED]

    month_revenue = total(month_txs)
    prev_month_revenue = total(prev_month_txs)
    revenue_growth = (
        float((month_revenue - prev_month_revenue) / prev_month_revenue * 100) if prev_month_revenue > 0 else 0.0
    )

    daily_used = total(today_txs)

    return {
        "summary": {
            "todayRevenue": float(total(today_txs)), "todayCount": len(today_txs),
            "weekRevenue": float(total(week_txs)), "weekCount": len(week_txs),
            "monthRevenue": float(month_revenue), "monthCount": len(month_txs),
            "totalRevenue": float(total(transactions)), "totalCount": len(transactions),
            "avgTransaction": float(avg(transactions)),
            "revenueGrowth": round(revenue_growth, 1),
        },
        "customers": {
            "total": len(unique_customers), "thisMonth": len(month_customers),
            "topCustomers": [{"name": c["name"], "total": float(c["total"]), "count": c["count"]} for c in top_customers],
        },
        "dailyChart": daily_chart,
        "monthlyChart": monthly_chart,
        "statusBreakdown": {"completed": len(completed), "pending": len(pending), "failed": len(failed)},
        "dailyLimit": {
            "limit": float(daily_limit), "used": float(daily_used),
            "remaining": float(max(Decimal(0), daily_limit - daily_used)),
            "percentUsed": round(float(daily_used / daily_limit * 100)) if daily_limit > 0 else 0,
        },
    }
