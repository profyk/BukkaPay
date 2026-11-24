"""Transport: Expo Push (iOS/Android app) and Web Push (browsers).

Both return one Result per device so the caller can tell delivered, gone
(remove the device) and temporarily failed (retry) apart."""

import asyncio
import json
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.core.logging import log

EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
EXPO_BATCH = 100


@dataclass
class Message:
    title: str
    body: str
    url: str
    notification_id: str | None
    channel: str
    urgent: bool
    badge: int | None = None
    tag: str | None = None


@dataclass
class Result:
    ok: bool
    gone: bool = False  # the device unsubscribed / uninstalled: remove it
    error: str | None = None
    ticket_id: str | None = None  # Expo: check the receipt later


def _expo_headers() -> dict:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = get_settings().expo_access_token
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def send_expo(tokens: list[str], msg: Message) -> list[Result]:
    results: list[Result] = []
    async with httpx.AsyncClient(timeout=15) as client:
        for i in range(0, len(tokens), EXPO_BATCH):
            batch = tokens[i:i + EXPO_BATCH]
            payload = [{
                "to": t, "title": msg.title, "body": msg.body, "sound": "default",
                "priority": "high" if msg.urgent else "normal", "channelId": msg.channel,
                "data": {"url": msg.url, "notificationId": msg.notification_id},
                **({"badge": msg.badge} if msg.badge is not None else {}),
            } for t in batch]
            try:
                r = await client.post(EXPO_SEND_URL, json=payload, headers=_expo_headers())
            except httpx.HTTPError as e:
                results += [Result(ok=False, error=f"network: {type(e).__name__}")] * len(batch)
                continue
            if r.status_code >= 400:
                results += [Result(ok=False, error=f"expo {r.status_code}")] * len(batch)
                continue
            tickets = (r.json() or {}).get("data") or []
            for n in range(len(batch)):
                t = tickets[n] if n < len(tickets) else {}
                if t.get("status") == "ok":
                    results.append(Result(ok=True, ticket_id=t.get("id")))
                else:
                    err = (t.get("details") or {}).get("error") or t.get("message") or "unknown"
                    results.append(Result(ok=False, gone=err == "DeviceNotRegistered", error=str(err)[:300]))
    return results


async def expo_receipts(ticket_ids: list[str]) -> dict[str, dict]:
    """Expo's later verdict per ticket ({"status": "ok"} or an error)."""
    out: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for i in range(0, len(ticket_ids), 1000):
            r = await client.post(EXPO_RECEIPTS_URL, json={"ids": ticket_ids[i:i + 1000]}, headers=_expo_headers())
            r.raise_for_status()
            out.update((r.json() or {}).get("data") or {})
    return out


def web_push_configured() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def _web_push_one(endpoint: str, keys: dict, data: str, urgent: bool) -> Result:
    from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]

    s = get_settings()
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": keys},
            data=data,
            vapid_private_key=s.vapid_private_key,
            vapid_claims={"sub": s.vapid_subject},
            ttl=24 * 3600,
            headers={"Urgency": "high" if urgent else "normal"},
            timeout=10,
        )
        return Result(ok=True)
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        # 404/410: the browser dropped the subscription.
        return Result(ok=False, gone=status in (404, 410), error=f"webpush {status}: {str(e)[:200]}")
    except Exception as e:  # noqa: BLE001 — network trouble: retry later
        return Result(ok=False, error=f"webpush: {type(e).__name__}")


async def send_web(subs: list[tuple[str, dict]], msg: Message) -> list[Result]:
    if not web_push_configured():
        return [Result(ok=False, error="web push not configured")] * len(subs)
    data = json.dumps({"title": msg.title, "body": msg.body, "url": msg.url, "tag": msg.tag,
                       "notificationId": msg.notification_id, "badge": msg.badge})
    results = await asyncio.gather(*(asyncio.to_thread(_web_push_one, ep, keys, data, msg.urgent) for ep, keys in subs))
    bad = [r for r in results if not r.ok and not r.gone]
    if bad:
        log.warning("web_push_failed", count=len(bad), error=bad[0].error)
    return list(results)
