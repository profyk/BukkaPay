import secrets
import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.contribution import Contribution, ContributionGroup


async def get_groups_by_creator(db: AsyncSession, creator_id: uuid.UUID) -> list[ContributionGroup]:
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.creator_id == creator_id))
    return list(result.scalars().all())


async def get_group(db: AsyncSession, group_id: str) -> ContributionGroup | None:
    try:
        group_uuid = uuid.UUID(group_id)
    except ValueError:
        return None
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.id == group_uuid))
    return result.scalar_one_or_none()


async def get_group_by_share_code(db: AsyncSession, code: str) -> ContributionGroup | None:
    result = await db.execute(select(ContributionGroup).where(ContributionGroup.share_code == code))
    return result.scalar_one_or_none()


async def get_contributions_by_group(db: AsyncSession, group_id: uuid.UUID) -> list[Contribution]:
    result = await db.execute(select(Contribution).where(Contribution.group_id == group_id))
    return list(result.scalars().all())


async def create_group(
    db: AsyncSession, creator_id: uuid.UUID, *, title: str, description: str | None, category: str,
    target_amount: str | None, currency: str | None, is_active: bool | None, end_date,
) -> ContributionGroup:
    share_code = f"CON-{secrets.token_hex(4).upper()}"
    group = ContributionGroup(
        creator_id=creator_id, title=title, description=description, category=category,
        target_amount=Decimal(target_amount) if target_amount else None,
        currency=currency or "USD", share_code=share_code,
        is_active=True if is_active is None else is_active, end_date=end_date,
    )
    db.add(group)
    await db.flush()
    return group


async def create_contribution(
    db: AsyncSession, group: ContributionGroup, contributor_id: uuid.UUID | None, *,
    contributor_name: str, contributor_phone: str | None, amount: str, message: str | None,
    is_anonymous: bool | None,
) -> Contribution:
    if not group.is_active:
        raise ApiError("This contribution group is no longer active")

    try:
        parsed_amount = Decimal(amount)
    except InvalidOperation as e:
        raise ApiError("Invalid amount") from e
    if parsed_amount <= 0:
        raise ApiError("Invalid amount")

    contribution = Contribution(
        group_id=group.id, contributor_id=contributor_id, contributor_name=contributor_name,
        contributor_phone=contributor_phone, amount=parsed_amount, message=message,
        is_anonymous=bool(is_anonymous),
    )
    db.add(contribution)

    group.current_amount = group.current_amount + parsed_amount
    await db.flush()
    return contribution


def with_status(group: ContributionGroup) -> dict:
    return {**{c.name: getattr(group, c.name) for c in group.__table__.columns},
            "status": "active" if group.is_active else "inactive"}
