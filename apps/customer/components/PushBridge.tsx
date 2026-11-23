/**
 * Connects push notifications to the app: keeps this device registered,
 * opens the right screen when a notification is tapped, and refreshes the
 * inbox and balances when one arrives while the app is open.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "../lib/auth";
import { enablePush, pushStatus } from "../lib/push";

const REFRESH = [["notifications"], ["notifications-unread"], ["cards"], ["issued-cards"], ["transactions"]];

export default function PushBridge() {
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => REFRESH.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    const open = (url?: unknown) => {
      if (typeof url === "string" && url.startsWith("/")) router.push(url as any);
      refresh();
    };

    // Keep the registration fresh (token rotation, last seen) without asking.
    (async () => {
      if (!(await getAuthToken())) return;
      if ((await pushStatus()) === "on" || Platform.OS !== "web") await enablePush(false).catch(() => {});
    })();

    if (Platform.OS === "web") {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
      const onMessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === "bukkapay-open") open(m.url);
        else if (m.type === "bukkapay-push") refresh();
        else if (m.type === "bukkapay-resubscribe") enablePush(false).catch(() => {});
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }

    // Cold start from a tapped notification.
    Notifications.getLastNotificationResponseAsync().then((r) => {
      // Wait a moment so the navigator has mounted before moving.
      if (r) setTimeout(() => open(r.notification.request.content.data?.url), 600);
    }).catch(() => {});
    const tapped = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data?.url));
    const received = Notifications.addNotificationReceivedListener(refresh);
    const rotated = Notifications.addPushTokenListener(() => { enablePush(false).catch(() => {}); });
    return () => { tapped.remove(); received.remove(); rotated.remove(); };
  }, []);

  return null;
}
