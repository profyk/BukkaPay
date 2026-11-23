"""Push notifications end to end.

Every in-app notification (notification_service.create_notification) also
writes a `push.notification` outbox event in the same transaction. The
worker delivers it within ~10 seconds to each of the user's devices, if the
user wants that kind of alert. Expo tickets are re-checked 15 minutes later
(`push.receipts`) so uninstalled apps are removed automatically."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.core.logging import log
from app.models.cards import IssuedCard
from app.models.notification import Notification
from app.models.push import NotificationPreference, PushDevice
from app.network import outbox
from app.push import catalog, sender

MAX_DEVICES_PER_USER = 10
DISABLE_AFTER_FAILURES = 5


# ─── Devices ────────────────────────────────────────────────────────────────


async def register_device(
    db: AsyncSession, user_id: uuid.UUID, *, kind: str, token: str, platform: str,
    keys: dict | None = None, device_name: str | None = None,
) -> PushDevice:
    if kind == "webpush":
        if not token.startswith("https://") or not keys or not keys.get("p256dh") or not keys.get("auth"):
            raise ApiError("Invalid web push subscription", status_code=400)
        keys = {"p256dh": str(keys["p256dh"])[:200], "auth": str(keys["auth"])[:100]}
    elif kind == "expo":
        if not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
            raise ApiError("Invalid Expo push token", status_code=400)
        keys = None
    now = datetime.now(UTC)
    device = (await db.execute(select(PushDevice).where(PushDevice.token == token).with_for_update())).scalar_one_or_none()
    if device is None:
        device = PushDevice(user_id=user_id, kind=kind, token=token, platform=platform)
        db.add(device)
    # Same phone, different account: the token now belongs to whoever is
    # signed in, so the previous account's alerts stop arriving here.
    device.user_id = user_id
    device.kind = kind
    device.keys = keys
    device.platform = platform
    device.device_name = (device_name or "")[:120] or None
    device.last_seen_at = now
    device.disabled_at = None
    device.failures = 0
    device.last_error = None
    await db.flush()
    await _trim_devices(db, user_id)
    return device


async def _trim_devices(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Keep the most recently seen devices; old phones fall off the end."""
    stale = (
        await db.execute(
            select(PushDevice.id).where(PushDevice.user_id == user_id)
            .order_by(PushDevice.last_seen_at.desc()).offset(MAX_DEVICES_PER_USER)
        )
    ).scalars().all()
    if stale:
        await db.execute(delete(PushDevice).where(PushDevice.id.in_(stale)))


async def remove_device(db: AsyncSession, user_id: uuid.UUID, *, token: str | None = None,
                        device_id: str | None = None) -> bool:
    q = delete(PushDevice).where(PushDevice.user_id == user_id)
    if token:
        q = q.where(PushDevice.token == token)
    elif device_id:
        try:
            q = q.where(PushDevice.id == uuid.UUID(device_id))
        except ValueError:
            return False
    else:
        return False
    result = await db.execute(q)
    return (result.rowcount or 0) > 0


async def remove_all_devices(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(PushDevice).where(PushDevice.user_id == user_id))


async def list_devices(db: AsyncSession, user_id: uuid.UUID) -> list[PushDevice]:
    return list(
        (
            await db.execute(
                select(PushDevice).where(PushDevice.user_id == user_id).order_by(PushDevice.last_seen_at.desc())
            )
        ).scalars()
    )


# ─── Preferences ────────────────────────────────────────────────────────────


async def get_preferences(db: AsyncSession, user_id: uuid.UUID) -> NotificationPreference:
    prefs = await db.get(NotificationPreference, user_id)
    if prefs is None:
        prefs = NotificationPreference(user_id=user_id, money=True, cards=True, trade=True, support=True,
                                       updates=False, show_previews=True)
    return prefs


async def update_preferences(db: AsyncSession, user_id: uuid.UUID, changes: dict) -> NotificationPreference:
    prefs = await db.get(NotificationPreference, user_id, with_for_update=True)
    if prefs is None:
        prefs = await get_preferences(db, user_id)
        db.add(prefs)
    for key in (*catalog.SWITCHABLE, "show_previews"):
        if changes.get(key) is not None:
            setattr(prefs, key, bool(changes[key]))
    await db.flush()
    return prefs


def wants(prefs: NotificationPreference, category: str) -> bool:
    if category not in catalog.SWITCHABLE:
        return True  # account & security alerts can't be switched off
    return bool(getattr(prefs, category))


# ─── Delivery ───────────────────────────────────────────────────────────────


async def queue(db: AsyncSession, notification_id: uuid.UUID) -> None:
    await outbox.enqueue(db, "push.notification", {"notification_id": str(notification_id)})


async def _active_devices(db: AsyncSession, user_ids) -> list[PushDevice]:
    return list(
        (
            await db.execute(
                select(PushDevice).where(PushDevice.user_id.in_(list(user_ids)), PushDevice.disabled_at.is_(None))
            )
        ).scalars()
    )


async def _unread(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(Notification)
            .where(Notification.user_id == user_id, Notification.read.is_(False))
        )
    ).scalar_one()


async def _send(db: AsyncSession, devices: list[PushDevice], msg: sender.Message) -> tuple[int, int, list[dict]]:
    """Send to devices; returns (delivered, retryable failures, expo tickets)."""
    expo = [d for d in devices if d.kind == "expo"]
    web = [d for d in devices if d.kind == "webpush"]
    pairs: list[tuple[PushDevice, sender.Result]] = []
    if expo:
        pairs += list(zip(expo, await sender.send_expo([d.token for d in expo], msg), strict=False))
    if web:
        pairs += list(zip(web, await sender.send_web([(d.token, d.keys or {}) for d in web], msg), strict=False))
    now = datetime.now(UTC)
    delivered = retry = 0
    tickets: list[dict] = []
    for device, result in pairs:
        if result.ok:
            delivered += 1
            device.last_sent_at = now
            device.failures = 0
            device.last_error = None
            if result.ticket_id:
                tickets.append({"ticket": result.ticket_id, "device_id": str(device.id)})
        elif result.gone:
            await db.delete(device)
        else:
            retry += 1
            device.failures = (device.failures or 0) + 1
            device.last_error = result.error
            if device.failures >= DISABLE_AFTER_FAILURES:
                device.disabled_at = now
    await db.flush()
    return delivered, retry, tickets


async def _link(db: AsyncSession, n: Notification) -> str:
    wallet_card_id = None
    if n.related_type == "issued_card" and n.related_id:
        try:
            card = await db.get(IssuedCard, uuid.UUID(n.related_id))
            wallet_card_id = str(card.wallet_card_id) if card else None
        except ValueError:
            pass
    return catalog.link_for(n.related_type, n.related_id, wallet_card_id=wallet_card_id)


MAX_PUSH_ATTEMPTS = 4


async def deliver_notification(db: AsyncSession, notification_id: str, attempt: int = 0) -> None:
    """Outbox handler. Idempotent: a notification is pushed at most once.
    If every device failed for a temporary reason (push service down), a
    fresh attempt is queued with backoff; failure counts are kept so a
    device that never works is eventually switched off."""
    n = await db.get(Notification, uuid.UUID(notification_id), with_for_update=True)
    if n is None or n.pushed_at is not None:
        return  # deleted from the inbox before delivery, or already pushed
    category = catalog.category_for(n.related_type)
    prefs = await get_preferences(db, n.user_id)
    devices = await _active_devices(db, [n.user_id]) if wants(prefs, category) else []
    if not devices:
        n.pushed_at = datetime.now(UTC)
        return
    private = not prefs.show_previews and category in ("money", "cards")
    msg = sender.Message(
        title="BukkaPay" if private else n.title,
        body="You have new payment activity. Open BukkaPay to see it." if private else n.message,
        url=await _link(db, n), notification_id=str(n.id), channel=catalog.CHANNEL.get(category, "general"),
        urgent=catalog.is_urgent(category), badge=await _unread(db, n.user_id), tag=str(n.id),
    )
    delivered, retry, tickets = await _send(db, devices, msg)
    if delivered == 0 and retry > 0 and attempt + 1 < MAX_PUSH_ATTEMPTS:
        await outbox.enqueue(db, "push.notification", {"notification_id": str(n.id), "attempt": attempt + 1},
                             available_at=datetime.now(UTC) + timedelta(seconds=30 * 2 ** attempt))
        return
    n.pushed_at = datetime.now(UTC)
    if tickets:
        await outbox.enqueue(db, "push.receipts", {"tickets": tickets},
                             available_at=datetime.now(UTC) + timedelta(minutes=15))


async def check_receipts(db: AsyncSession, tickets: list[dict]) -> None:
    """Expo reports uninstalled apps in the receipt, not the ticket."""
    receipts = await sender.expo_receipts([t["ticket"] for t in tickets])
    for t in tickets:
        r = receipts.get(t["ticket"]) or {}
        if r.get("status") == "error" and (r.get("details") or {}).get("error") == "DeviceNotRegistered":
            await db.execute(delete(PushDevice).where(PushDevice.id == uuid.UUID(t["device_id"])))


async def deliver_broadcast(db: AsyncSession, title: str, message: str, *, after_user_id: str | None = None,
                            batch: int = 500) -> None:
    """Product news from the admin console: only users who opted in to
    updates. Works through users in pages, re-queueing itself, so one
    broadcast can't hog the worker."""
    q = (
        select(PushDevice).join(NotificationPreference, NotificationPreference.user_id == PushDevice.user_id)
        .where(NotificationPreference.updates.is_(True), PushDevice.disabled_at.is_(None))
        .order_by(PushDevice.user_id, PushDevice.id).limit(batch)
    )
    if after_user_id:
        q = q.where(PushDevice.user_id > uuid.UUID(after_user_id))
    devices = list((await db.execute(q)).scalars())
    if not devices:
        return
    more = len(devices) == batch
    # Don't split one user's devices across pages.
    if more:
        devices = [d for d in devices if d.user_id != devices[-1].user_id] or devices
    last_user = devices[-1].user_id
    msg = sender.Message(title=title, body=message, url="/notifications", notification_id=None,
                         channel="general", urgent=False)
    await _send(db, devices, msg)
    if more:
        await outbox.enqueue(db, "push.broadcast", {"title": title, "message": message,
                                                    "after_user_id": str(last_user)})
    log.info("push_broadcast_page", devices=len(devices))


async def send_test(db: AsyncSession, user_id: uuid.UUID) -> int:
    devices = await _active_devices(db, [user_id])
    if not devices:
        raise ApiError("Turn on notifications on this device first.", status_code=400)
    msg = sender.Message(title="Notifications are on ✅", body="This is how BukkaPay will tell you about your money.",
                         url="/notifications", notification_id=None, channel="money", urgent=True, tag="test")
    delivered, retry, _ = await _send(db, devices, msg)
    if delivered == 0:
        raise ApiError("We couldn't reach your devices. Try turning notifications off and on again.", status_code=502)
    return delivered
