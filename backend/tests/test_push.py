import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.base import get_session_factory
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.platform import OutboxEvent
from app.models.push import PushDevice
from app.push import sender
from app.push import service as push
from app.services import notification_service
from tests.conftest import TEST_PIN

pytestmark = pytest.mark.asyncio


def expo_token() -> str:
    return f"ExponentPushToken[{uuid.uuid4().hex[:22]}]"


@pytest.fixture
def sent(monkeypatch):
    """Capture pushes instead of calling Expo / browsers."""
    class Calls(list):
        outcome = {"result": sender.Result(ok=True, ticket_id="t-1")}

    calls = Calls()
    outcome = calls.outcome

    async def fake_expo(tokens, msg):
        calls.append((tokens, msg))
        return [outcome["result"] for _ in tokens]

    monkeypatch.setattr(sender, "send_expo", fake_expo)
    return calls


async def _register(client, headers, token=None):
    token = token or expo_token()
    r = await client.post("/api/push/devices", json={"kind": "expo", "token": token, "platform": "android",
                                                     "deviceName": "Pixel 9"}, headers=headers)
    assert r.status_code == 200, r.text
    return token


async def _notify(user_id: str, related_type: str | None = None, type_=NotificationType.INFO) -> str:
    async with get_session_factory()() as db:
        n = await notification_service.create_notification(db, uuid.UUID(user_id), type_, "R50.00 received",
                                                           "Thabo sent you R50.00", related_type=related_type)
        await db.commit()
        return str(n.id)


async def _deliver(notification_id: str) -> Notification:
    async with get_session_factory()() as db:
        await push.deliver_notification(db, notification_id)
        await db.commit()
        return await db.get(Notification, uuid.UUID(notification_id))


async def test_device_registration_is_per_account(client: AsyncClient, user: dict, other_user: dict):
    token = await _register(client, user["headers"])
    r = await client.get("/api/push/devices", headers=user["headers"])
    assert [d["deviceName"] for d in r.json()] == ["Pixel 9"]

    # The same phone signs in to another account: the token moves with it.
    await _register(client, other_user["headers"], token)
    assert (await client.get("/api/push/devices", headers=user["headers"])).json() == []
    assert len((await client.get("/api/push/devices", headers=other_user["headers"])).json()) == 1

    # Someone else can't remove it; the owner can.
    r = await client.post("/api/push/devices/remove", json={"token": token}, headers=user["headers"])
    assert r.json()["removed"] is False
    r = await client.post("/api/push/devices/remove", json={"token": token}, headers=other_user["headers"])
    assert r.json()["removed"] is True


async def test_bad_tokens_and_anonymous_calls_rejected(client: AsyncClient, user: dict):
    r = await client.post("/api/push/devices", json={"kind": "expo", "token": "not-a-real-token", "platform": "ios"},
                          headers=user["headers"])
    assert r.status_code == 400
    r = await client.post("/api/push/devices", json={"kind": "webpush", "token": "https://push.example/abc123",
                                                     "platform": "web"}, headers=user["headers"])
    assert r.status_code == 400  # no keys
    r = await client.post("/api/push/devices", json={"kind": "expo", "token": expo_token(), "platform": "ios"})
    assert r.status_code == 401
    assert (await client.get("/api/push/preferences")).status_code == 401


async def test_preferences_defaults_and_update(client: AsyncClient, user: dict):
    r = await client.get("/api/push/preferences", headers=user["headers"])
    assert r.json() == {"money": True, "cards": True, "trade": True, "support": True, "updates": False,
                        "showPreviews": True}
    r = await client.put("/api/push/preferences", json={"updates": True, "money": False}, headers=user["headers"])
    assert r.json()["updates"] is True and r.json()["money"] is False and r.json()["cards"] is True


async def test_notification_is_pushed_once_with_link_and_badge(client: AsyncClient, user: dict, sent):
    token = await _register(client, user["headers"])
    nid = await _notify(user["user"]["id"], "transfer")
    async with get_session_factory()() as db:
        queued = (await db.execute(select(OutboxEvent).where(OutboxEvent.topic == "push.notification",
                                                             OutboxEvent.payload["notification_id"].astext == nid))).scalars().all()
    assert len(queued) == 1

    n = await _deliver(nid)
    assert n.pushed_at is not None
    assert len(sent) == 1
    tokens, msg = sent[0]
    assert tokens == [token]
    assert msg.title == "R50.00 received" and msg.url == "/transfer" and msg.channel == "money" and msg.urgent
    assert msg.badge >= 1

    await _deliver(nid)  # a retried outbox event never pushes twice
    assert len(sent) == 1


async def test_switched_off_category_not_pushed_but_security_always_is(client: AsyncClient, user: dict, sent):
    await _register(client, user["headers"])
    await client.put("/api/push/preferences", json={"money": False}, headers=user["headers"])
    await _deliver(await _notify(user["user"]["id"], "transfer"))
    assert sent == []
    # Account notices (no subject) can't be switched off.
    await _deliver(await _notify(user["user"]["id"], None, NotificationType.ALERT))
    assert len(sent) == 1 and sent[0][1].channel == "security"


async def test_hidden_previews_keep_amounts_off_the_lock_screen(client: AsyncClient, user: dict, sent):
    await _register(client, user["headers"])
    await client.put("/api/push/preferences", json={"showPreviews": False}, headers=user["headers"])
    await _deliver(await _notify(user["user"]["id"], "transfer"))
    msg = sent[0][1]
    assert "R50" not in msg.title and "R50" not in msg.body


async def test_uninstalled_app_is_removed(client: AsyncClient, user: dict, sent):
    token = await _register(client, user["headers"])
    sent.outcome["result"] = sender.Result(ok=False, gone=True, error="DeviceNotRegistered")
    await _deliver(await _notify(user["user"]["id"], "transfer"))
    async with get_session_factory()() as db:
        assert (await db.execute(select(PushDevice).where(PushDevice.token == token))).scalar_one_or_none() is None


async def test_temporary_failure_is_retried_later(client: AsyncClient, user: dict, sent):
    await _register(client, user["headers"])
    sent.outcome["result"] = sender.Result(ok=False, error="expo 503")
    nid = await _notify(user["user"]["id"], "transfer")
    n = await _deliver(nid)
    assert n.pushed_at is None
    async with get_session_factory()() as db:
        retry = (await db.execute(select(OutboxEvent).where(OutboxEvent.topic == "push.notification",
                                                            OutboxEvent.payload["notification_id"].astext == nid,
                                                            OutboxEvent.payload["attempt"].astext == "1"))).scalars().all()
    assert len(retry) == 1


async def test_payment_link_payment_notifies_the_collector(client: AsyncClient, user: dict, other_user: dict):
    from tests.conftest import fund_card

    r = await client.post("/api/payment-links", json={"amount": "80.00", "description": "Braai meat"},
                          headers=user["headers"])
    link = r.json()
    cards = (await client.get("/api/cards", headers=other_user["headers"])).json()
    await fund_card(cards[0]["id"], "500.00")
    r = await client.post(f"/api/payment-links/{link['id']}/pay-wallet", json={"pin": TEST_PIN},
                          headers=other_user["headers"])
    assert r.status_code == 200, r.text
    inbox = (await client.get("/api/notifications", headers=user["headers"])).json()
    paid = [n for n in inbox if n["relatedType"] == "payment_link"]
    assert paid and paid[0]["title"] == "Payment link paid in full"
    assert "80.00" in paid[0]["message"] and "Braai meat" in paid[0]["message"]
    assert paid[0]["url"] == f"/payment-link-detail?id={link['id']}" and paid[0]["category"] == "money"


async def test_test_push_needs_a_device(client: AsyncClient, user: dict, sent):
    r = await client.post("/api/push/test", headers=user["headers"])
    assert r.status_code == 400
    await _register(client, user["headers"])
    r = await client.post("/api/push/test", headers=user["headers"])
    assert r.status_code == 200 and r.json()["delivered"] == 1
