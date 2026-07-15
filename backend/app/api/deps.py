import uuid

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.db.deps import get_db
from app.models.user import User
from app.services import session_service


async def get_current_user_id(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise ApiError("Unauthorized", status_code=401)

    user_id = await session_service.verify_session(db, token)
    if user_id is None:
        raise ApiError("Unauthorized", status_code=401)
    return user_id


async def get_optional_user_id(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        return None
    return await session_service.verify_session(db, token)


async def get_current_user(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise ApiError("User not found", status_code=404)
    return user
