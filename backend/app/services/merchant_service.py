import secrets
import time
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.enums import (
    MerchantTransactionStatus,
    MerchantTransactionType,
    NotificationType,
    SubscriptionStatus,
)
from app.models.merchant import Merchant, MerchantSubscription, MerchantTransaction
from app.models.user import User
from app.services import notification_service

SUBSCRIPTION_PLANS = {"starter": Decimal("0"), "pro": Decimal("99"), "business": Decimal("299")}


async def get_merchants_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[Merchant]:
    result = await db.execute(select(Merchant).where(Merchant.user_id == user_id))
    return list(result.scalars().all())


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
    await db.delete(merchant)
    await db.flush()


async def get_merchant_transactions(
    db: AsyncSession, merchant_id: uuid.UUID, limit: int | None = None
) -> list[MerchantTransaction]:
    stmt = (
        select(MerchantTransaction)
        .where(MerchantTransaction.merchant_id == merchant_id)
        .order_by(MerchantTransaction.created_at.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def merchant_pay(
    db: AsyncSession, merchant: Merchant, *, amount: str, payer_id: uuid.UUID | None,
    payer_name: str | None, reference: str | None,
) -> tuple[MerchantTransaction, Decimal]:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e

    transaction = MerchantTransaction(
        merchant_id=merchant.id,
        payer_id=payer_id,
        payer_name=payer_name or "Anonymous",
        amount=parsed_amount,
        type=MerchantTransactionType.PAYMENT,
        status=MerchantTransactionStatus.COMPLETED,
        reference=reference,
    )
    db.add(transaction)

    new_balance = merchant.wallet_balance + parsed_amount
    merchant.wallet_balance = new_balance
    await db.flush()
    return transaction, new_balance


async def withdraw(
    db: AsyncSession, merchant: Merchant, user_id: uuid.UUID, *, amount: str, currency: str | None,
    banking_details: dict,
) -> dict:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid withdrawal amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid withdrawal amount")
    if not banking_details.get("accountHolder") or not banking_details.get("accountNumber"):
        raise ApiError("Account holder name and account number are required")

    current_balance = merchant.wallet_balance
    if parsed_amount > current_balance:
        raise ApiError(f"Insufficient balance. Available: {current_balance:.2f}")

    new_balance = current_balance - parsed_amount
    merchant.wallet_balance = new_balance

    db.add(MerchantTransaction(
        merchant_id=merchant.id,
        amount=parsed_amount,
        type=MerchantTransactionType.WITHDRAWAL,
        status=MerchantTransactionStatus.PENDING,
        reference=f"WD-{int(time.time() * 1000)}",
    ))
    await db.flush()

    currency = currency or "ZAR"
    try:
        await notification_service.create_notification(
            db, user_id, NotificationType.INFO, "Withdrawal Requested",
            f"Your withdrawal of {currency} {parsed_amount:.2f} has been submitted and will "
            f"arrive in 1–3 business days.",
        )
    except Exception:
        pass

    return {
        "success": True,
        "message": "Withdrawal request submitted. Funds will arrive in 1–3 business days.",
        "newBalance": f"{new_balance:.2f}",
        "amount": f"{parsed_amount:.2f}",
        "currency": currency,
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
        return sum((t.amount for t in txs), Decimal("0"))

    def avg(txs: list[MerchantTransaction]) -> Decimal:
        return total(txs) / len(txs) if txs else Decimal("0")

    unique_customers = {t.payer_id for t in transactions if t.payer_id}
    month_customers = {t.payer_id for t in month_txs if t.payer_id}

    customer_map: dict[str, dict] = defaultdict(lambda: {"name": "Anonymous", "total": Decimal("0"), "count": 0})
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
            "remaining": float(max(Decimal("0"), daily_limit - daily_used)),
            "percentUsed": round(float(daily_used / daily_limit * 100)) if daily_limit > 0 else 0,
        },
    }
