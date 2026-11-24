/**
 * Push notifications on every platform BukkaPay runs on:
 *  - iOS / Android app: Expo push tokens (expo-notifications).
 *  - Web (app.bukkapay.com): standard Web Push through /sw.js. On iPhone this
 *    only works once the web app is added to the Home Screen (Apple's rule).
 *
 * The API decides what to push and when (see backend app/push). This file only
 * asks for permission, registers this device, and opens the right screen
 * when a notification is tapped.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getPushConfig, registerPushDevice, removePushDevice } from "./api";

export type PushStatus =
  | "on"            // permission granted and this device is registered
  | "off"           // never asked yet
  | "blocked"       // the person said no; only phone/browser settings can undo it
  | "needs-install" // iPhone web: add to Home Screen first
  | "unsupported";  // simulator, old browser, or web push not configured

const isWeb = Platform.OS === "web";
let registeredToken: string | null = null;

/* ─── Native ────────────────────────────────────────────────────────────── */

if (!isWeb) {
  // Show alerts even while the app is open; the inbox refreshes too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("money", {
    name: "Payments and cards", description: "Money in and out, card payments",
    importance: Notifications.AndroidImportance.HIGH, lightColor: "#0033CC", vibrationPattern: [0, 200, 120, 200],
  });
  await Notifications.setNotificationChannelAsync("security", {
    name: "Security alerts", description: "Account and security notices",
    importance: Notifications.AndroidImportance.MAX, lightColor: "#DC2626",
  });
  await Notifications.setNotificationChannelAsync("general", {
    name: "Trade, travel and support", importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
}

async function nativeStatus(): Promise<PushStatus> {
  if (!Device.isDevice) return "unsupported";
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "on";
  return status === "denied" && !canAskAgain ? "blocked" : "off";
}

async function nativeEnable(prompt: boolean): Promise<PushStatus> {
  if (!Device.isDevice) return "unsupported";
  await ensureAndroidChannels();
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && prompt && canAskAgain) {
    ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return canAskAgain ? "off" : "blocked";
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerPushDevice({
    kind: "expo", token, platform: Platform.OS === "ios" ? "ios" : "android",
    deviceName: [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || null,
  });
  registeredToken = token;
  return "on";
}

/* ─── Web ───────────────────────────────────────────────────────────────── */

function webSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIosBrowserTab() {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as any).standalone === true;
  return ios && !standalone;
}

function browserName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function swRegistration() {
  return (await navigator.serviceWorker.getRegistration("/")) || navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function webStatus(): Promise<PushStatus> {
  if (!webSupported()) return isIosBrowserTab() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? "on" : "off";
}

async function webEnable(prompt: boolean): Promise<PushStatus> {
  if (!webSupported()) return isIosBrowserTab() ? "needs-install" : "unsupported";
  const { webPushPublicKey } = await getPushConfig();
  if (!webPushPublicKey) return "unsupported";
  let permission = Notification.permission;
  if (permission === "default" && prompt) permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const reg = await swRegistration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = urlBase64ToUint8Array(webPushPublicKey);
  // A subscription made with an old server key can't receive our pushes.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && new Uint8Array(current as ArrayBuffer).toString() !== key.toString()) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON() as any;
  await registerPushDevice({ kind: "webpush", token: json.endpoint, keys: json.keys, platform: "web", deviceName: browserName() });
  registeredToken = json.endpoint;
  return "on";
}

/* ─── Public API ────────────────────────────────────────────────────────── */

export function pushStatus(): Promise<PushStatus> {
  return (isWeb ? webStatus() : nativeStatus()).catch(() => "unsupported" as PushStatus);
}

/** Turn push on for this device. `prompt: false` only refreshes an existing
 *  permission (used on every app start) and never shows a dialog. */
export async function enablePush(prompt = true): Promise<PushStatus> {
  return isWeb ? webEnable(prompt) : nativeEnable(prompt);
}

/** Stop pushes to this device for this account (sign-out, or switching off). */
export async function disablePush(): Promise<void> {
  try {
    if (isWeb) {
      if (!webSupported()) return;
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await removePushDevice({ token: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
    } else {
      let token = registeredToken;
      if (!token && Device.isDevice && (await Notifications.getPermissionsAsync()).status === "granted") {
        token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
      }
      if (token) await removePushDevice({ token }).catch(() => {});
    }
  } catch {
    // Signing out must never fail because of push clean-up.
  } finally {
    registeredToken = null;
  }
}

export const PUSH_HELP: Record<PushStatus, string> = {
  on: "This device gets instant alerts.",
  off: "Turn on to get instant alerts on this device.",
  blocked: isWeb
    ? "Notifications are blocked for app.bukkapay.com. Allow them in your browser's site settings, then come back."
    : "Notifications are off for BukkaPay. Turn them on in your phone's Settings, then come back.",
  "needs-install": "On iPhone, tap Share → Add to Home Screen, open BukkaPay from there, then turn notifications on.",
  unsupported: isWeb ? "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari." : "Notifications need a real phone (not a simulator).",
};
