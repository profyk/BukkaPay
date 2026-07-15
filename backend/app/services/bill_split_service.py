import uuid
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.models.bill_split import BillSplit
from app.models.enums import BillSplitStatus


async def get_bill_splits_by_user(db: AsyncSession, user_id: uuid.UUID) -> list[BillSplit]:
    result = await db.execute(select(BillSplit).where(BillSplit.creator_id == user_id))
    return list(result.scalars().all())


async def get_bill_split(db: AsyncSession, split_id: str) -> BillSplit | None:
    try:
        split_uuid = uuid.UUID(split_id)
    except ValueError:
        return None
    result = await db.execute(select(BillSplit).where(BillSplit.id == split_uuid))
    return result.scalar_one_or_none()


async def create_bill_split(
    db: AsyncSession, user_id: uuid.UUID, *, title: str, total_amount: str, participants: list | None,
) -> BillSplit:
    try:
        amount = Decimal(total_amount)
    except InvalidOperation as e:
        raise ApiError("Title and total amount are required") from e

    split = BillSplit(creator_id=user_id, title=title, total_amount=amount, participants=participants or [])
    db.add(split)
    await db.flush()
    return split


async def update_participants(db: AsyncSession, split: BillSplit, participants: list) -> BillSplit:
    split.participants = participants
    if participants and all(p.get("paid") for p in participants):
        split.status = BillSplitStatus.COMPLETED
    await db.flush()
    return split


async def update_status(db: AsyncSession, split: BillSplit, status: str) -> BillSplit:
    split.status = status
    await db.flush()
    return split
