/* BukkaPay web push service worker.
 * Shows pushes from api.bukkapay.com and opens the right screen when tapped.
 * It never caches pages or API data. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "BukkaPay";
  const options = {
    body: data.body || "",
    icon: "/push-icon.png",
    badge: "/push-badge.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/notifications", notificationId: data.notificationId || null },
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    if (typeof data.badge === "number" && self.navigator && self.navigator.setAppBadge) {
      try { data.badge > 0 ? await self.navigator.setAppBadge(data.badge) : await self.navigator.clearAppBadge(); } catch (e) {}
    }
    // Let open tabs refresh their inbox and balances.
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    tabs.forEach((c) => c.postMessage({ type: "bukkapay-push", notificationId: options.data.notificationId }));
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/notifications";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) {
      await tab.focus();
      tab.postMessage({ type: "bukkapay-open", url: path });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// The browser rotated the subscription: tell open tabs to re-register it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((tabs) =>
    tabs.forEach((c) => c.postMessage({ type: "bukkapay-resubscribe" }))));
});
