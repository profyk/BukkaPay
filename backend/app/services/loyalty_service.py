import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.gamification import Challenge
from app.models.loyalty import AutoPay, Beneficiary, LoyaltyReward


async def get_loyalty_reward(db: AsyncSession, user_id: uuid.UUID) -> LoyaltyReward | None:
    result = await db.execute(select(LoyaltyReward).where(LoyaltyReward.user_id == user_id))
    return result.scalar_one_or_none()


async def get_autopays(db: AsyncSession, user_id: uuid.UUID) -> list[AutoPay]:
    result = await db.execute(select(AutoPay).where(AutoPay.user_id == user_id))
    return list(result.scalars().all())


async def create_autopay(
    db: AsyncSession, user_id: uuid.UUID, *, bill_name: str, amount: str, frequency: str,
    next_payment_date, is_active: bool | None,
) -> AutoPay:
    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    autopay = AutoPay(
        user_id=user_id, bill_name=bill_name, amount=parsed_amount, frequency=frequency,
        next_payment_date=next_payment_date, is_active=True if is_active is None else is_active,
    )
    db.add(autopay)
    await db.flush()
    return autopay


async def get_beneficiaries(db: AsyncSession, user_id: uuid.UUID) -> list[Beneficiary]:
    result = await db.execute(select(Beneficiary).where(Beneficiary.user_id == user_id))
    return list(result.scalars().all())


async def create_beneficiary(
    db: AsyncSession, user_id: uuid.UUID, *, name: str, wallet_id: str, is_favorite: bool | None,
) -> Beneficiary:
    beneficiary = Beneficiary(user_id=user_id, name=name, wallet_id=wallet_id, is_favorite=bool(is_favorite))
    db.add(beneficiary)
    await db.flush()
    return beneficiary


async def get_challenges(db: AsyncSession, user_id: uuid.UUID) -> list[Challenge]:
    result = await db.execute(select(Challenge).where(Challenge.user_id == user_id))
    return list(result.scalars().all())


async def create_challenge(
    db: AsyncSession, user_id: uuid.UUID, *, title: str, description: str | None, target: str | None,
    current: str | None, reward: int | None, completed: bool | None,
) -> Challenge:
    challenge = Challenge(
        user_id=user_id, title=title, description=description,
        target=Decimal(target) if target else None, current=Decimal(current) if current else Decimal(0),
        reward=reward or 0, completed=bool(completed),
    )
    db.add(challenge)
    await db.flush()
    return challenge


