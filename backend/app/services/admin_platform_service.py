import json

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.models.claim_payment import ClaimPayment
from app.models.contribution import ContributionGroup
from app.models.enums import KycStatus
from app.models.merchant import Merchant
from app.models.user import User

PRICING_REDIS_KEY = "admin:pricing_config"

DEFAULT_PRICING = {
    "transfer": {"fee_percentage": 0.5, "fee_fixed": 1.00, "min_amount": 10, "max_amount": 50000},
    "payment_link": {"fee_percentage": 1.5, "fee_fixed": 0, "min_amount": 10, "max_amount": 100000},
    "virtual_card": {"issuance_fee": 50, "monthly_fee": 15, "transaction_fee_percentage": 0.5},
    "withdrawal": {"fee_fixed": 8.50, "fee_percentage": 0, "min_amount": 50, "max_amount": 25000},
    "stokvel": {"management_fee_percentage": 0},
    "loyalty": {"points_per_rand": 1, "redemption_rate": 100},
}


async def get_stats(db: AsyncSession) -> dict:
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    total_txns = (await db.execute(text("SELECT count(*) FROM transactions"))).scalar_one()
    volume = (await db.execute(text("SELECT COALESCE(SUM(amount), 0) FROM transactions"))).scalar_one()
    total_links = (await db.execute(text("SELECT count(*) FROM payment_links"))).scalar_one()
    # The Node admin stats query filtered payment_links.status = 'active',
    # a value the create-payment-link flow never actually writes (default
    # is 'pending') — this always evaluated to 0 in the original too. Now
    # that status is a native enum, 'active' isn't even a valid member, so
    # querying for it would raise rather than just return zero rows;
    # hardcode the same always-0 result instead of reproducing that crash.
    active_links = 0

    frozen = (await db.execute(select(func.count()).select_from(User).where(User.frozen.is_(True)))).scalar_one()
    verified = (await db.execute(select(func.count()).select_from(User).where(User.verified.is_(True)))).scalar_one()
    not_frozen = (await db.execute(select(func.count()).select_from(User).where(User.frozen.is_(False)))).scalar_one()
    merchant_count = (await db.execute(select(func.count()).select_from(Merchant))).scalar_one()
    admin_count = (await db.execute(text("SELECT count(*) FROM admin_users WHERE is_active = true"))).scalar_one()
    pending_kyc = (
        await db.execute(select(func.count()).select_from(User).where(User.kyc_status == KycStatus.PENDING))
    ).scalar_one()

    recent_txns = await db.execute(text("""
        SELECT DATE(created_at) as date, COUNT(*)::int as count,
               COALESCE(SUM(amount::numeric), 0)::float as volume
        FROM transactions WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
    """))
    user_growth = await db.execute(text("""
        SELECT DATE(created_at) as date, COUNT(*)::int as count
        FROM users WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
    """))

    return {
        "totalUsers": total_users, "activeUsers": not_frozen, "frozenUsers": frozen,
        "verifiedUsers": verified, "totalTransactions": total_txns, "flaggedTransactions": 0,
        "totalVolume": float(volume or 0), "pendingKyc": pending_kyc,
        "totalMerchants": merchant_count, "totalPaymentLinks": total_links,
        "activePaymentLinks": active_links, "activeAdmins": admin_count,
        "recentTransactions": [{"date": str(r.date), "volume": r.volume, "count": r.count} for r in recent_txns],
        "userGrowth": [{"date": str(r.date), "count": r.count} for r in user_growth],
    }


async def list_merchants(db: AsyncSession, *, page: int, limit: int,
                         countries: list[str] | None = None) -> tuple[list[tuple[Merchant, User]], int]:
    stmt = select(Merchant, User).join(User, Merchant.user_id == User.id)
    count = select(func.count()).select_from(Merchant)
    if countries is not None:  # staff country scope
        stmt = stmt.where(Merchant.country_code.in_(countries))
        count = count.where(Merchant.country_code.in_(countries))
    rows = (await db.execute(stmt.order_by(Merchant.created_at.desc()).limit(limit)
                             .offset((page - 1) * limit))).all()
    total = (await db.execute(count)).scalar_one()
    return rows, total


async def list_savings_groups(db: AsyncSession, *, page: int, limit: int) -> tuple[list[ContributionGroup], int]:
    # stokvels* tables were retired (zero write path in the whole app —
    # see the migration notes); the admin "stokvels" view now surfaces the
    # actually-used contribution_groups ("susu"/savings groups) feature
    # instead, with the same response shape the admin panel already expects.
    stmt = (
        select(ContributionGroup).order_by(ContributionGroup.created_at.desc())
        .limit(limit).offset((page - 1) * limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(select(func.count()).select_from(ContributionGroup))).scalar_one()
    return list(rows), total


async def get_pricing() -> dict:
    redis = get_redis()
    raw = await redis.get(PRICING_REDIS_KEY)
    return json.loads(raw) if raw else dict(DEFAULT_PRICING)


async def update_pricing(category: str, values: dict) -> dict:
    from app.core.errors import ApiError

    config = await get_pricing()
    if category not in config:
        raise ApiError(f"Unknown category: {category}")
    config[category] = {**config[category], **values}

    redis = get_redis()
    await redis.set(PRICING_REDIS_KEY, json.dumps(config))
    return config


async def list_claims(db: AsyncSession, *, page: int, limit: int) -> tuple[list[ClaimPayment], int]:
    stmt = (
        select(ClaimPayment).order_by(ClaimPayment.created_at.desc())
        .limit(limit).offset((page - 1) * limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    total = (await db.execute(select(func.count()).select_from(ClaimPayment))).scalar_one()
    return list(rows), total
