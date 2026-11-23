"""Push notification devices, preferences and a test send. Every route acts
only on the signed-in user's own devices and settings."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.rate_limit import rate_limit
from app.db.deps import get_db
from app.push import sender
from app.push import service as push
from app.schemas.base import CamelModel, JsDateTime, OptionalJsDateTime

router = APIRouter(prefix="/api/push", tags=["push"])


class PushConfig(CamelModel):
    web_push_public_key: str | None
    expo: bool = True


class RegisterDevice(CamelModel):
    kind: Literal["expo", "webpush"]
    token: str = Field(min_length=10, max_length=1000)
    platform: Literal["ios", "android", "web"]
    keys: dict | None = None
    device_name: str | None = Field(default=None, max_length=120)


class RemoveDevice(CamelModel):
    token: str | None = Field(default=None, max_length=1000)
    id: str | None = None


class DeviceOut(CamelModel):
    id: str
    kind: str
    platform: str
    device_name: str | None
    active: bool
    created_at: JsDateTime
    last_seen_at: JsDateTime
    last_sent_at: OptionalJsDateTime = None


class Preferences(CamelModel):
    money: bool
    cards: bool
    trade: bool
    support: bool
    updates: bool
    show_previews: bool


class PreferencesUpdate(CamelModel):
    money: bool | None = None
    cards: bool | None = None
    trade: bool | None = None
    support: bool | None = None
    updates: bool | None = None
    show_previews: bool | None = None


def _device(d) -> DeviceOut:
    return DeviceOut(id=str(d.id), kind=d.kind, platform=d.platform, device_name=d.device_name,
                     active=d.disabled_at is None, created_at=d.created_at, last_seen_at=d.last_seen_at,
                     last_sent_at=d.last_sent_at)


def _prefs(p) -> Preferences:
    return Preferences(money=p.money, cards=p.cards, trade=p.trade, support=p.support, updates=p.updates,
                       show_previews=p.show_previews)


@router.get("/config")
async def config() -> PushConfig:
    from app.core.config import get_settings

    return PushConfig(web_push_public_key=get_settings().vapid_public_key if sender.web_push_configured() else None)


@router.get("/devices")
async def my_devices(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> list[DeviceOut]:
    return [_device(d) for d in await push.list_devices(db, user_id)]


@router.post("/devices")
async def register(body: RegisterDevice, user_id=Depends(get_current_user_id),
                   db: AsyncSession = Depends(get_db)) -> DeviceOut:
    device = await push.register_device(db, user_id, kind=body.kind, token=body.token, platform=body.platform,
                                        keys=body.keys, device_name=body.device_name)
    return _device(device)


@router.post("/devices/remove")
async def remove(body: RemoveDevice, user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    removed = await push.remove_device(db, user_id, token=body.token, device_id=body.id)
    return {"success": True, "removed": removed}


@router.get("/preferences")
async def get_preferences(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> Preferences:
    return _prefs(await push.get_preferences(db, user_id))


@router.put("/preferences")
async def put_preferences(body: PreferencesUpdate, user_id=Depends(get_current_user_id),
                          db: AsyncSession = Depends(get_db)) -> Preferences:
    return _prefs(await push.update_preferences(db, user_id, body.model_dump()))


@router.post("/test", dependencies=[Depends(rate_limit("push-test", limit=5, window_seconds=300))])
async def test(user_id=Depends(get_current_user_id), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "delivered": await push.send_test(db, user_id)}
