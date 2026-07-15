from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db.deps import get_db
from app.schemas.notification import NotificationResponse
from app.services import notification_crud_service as svc

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> list[NotificationResponse]:
    notifications = await svc.get_notifications(db, user_id)
    return [NotificationResponse.model_validate(n) for n in notifications]


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    await svc.mark_read(db, notification_id, user_id)
    return {"success": True}


@router.patch("/read-all")
async def mark_all_read(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    await svc.mark_all_read(db, user_id)
    return {"success": True}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)
) -> dict:
    await svc.delete_notification(db, notification_id, user_id)
    return {"success": True}


@router.delete("")
async def clear_all_notifications(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    await svc.clear_all(db, user_id)
    return {"success": True}
