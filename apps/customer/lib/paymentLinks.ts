/** Payment links client: list, cancel/delete, share. Shared by the list and detail screens. */
import { Alert, Linking, Platform, Share } from "react-native";
import { API_BASE, payUrl } from "./config";
import { getAuthHeader } from "./auth";
import { getCurrency } from "./currency";

export interface PaymentLink {
  id: string;
  amount: string;
  currency: string;
  description: string | null;
  status: "pending" | "partial" | "paid" | "expired" | "cancelled" | string;
  amountPaid: string;
  remainingBalance: string | null;
  allowPartialPayment: boolean;
  createdAt: string;
  expiresAt?: string | null;
  paymentUrl?: string;
  direction?: "sent" | "received";
}

async function call<T>(method: string, path: string): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_BASE}${path}`, { method, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || body.message || "Something went wrong. Please try again.");
  return body as T;
}

export const fetchPaymentLinks = () => call<PaymentLink[]>("GET", "/api/payment-links");
export const unsaveLink = (id: string) => call("DELETE", `/api/payment-links/${id}/save`);

export const linkUrl = (l: PaymentLink) => l.paymentUrl || payUrl(l.id);
export const money = (amount: string | number, currency: string) =>
  `${getCurrency(currency as any).symbol}${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Unpaid links are deleted; links that took money are cancelled (history kept). */
export const canDelete = (l: PaymentLink) => Number(l.amountPaid || 0) === 0;
export const isOpen = (l: PaymentLink) => l.status === "pending" || l.status === "partial";

export async function removeLink(l: PaymentLink): Promise<"deleted" | "cancelled"> {
  if (canDelete(l)) { await call("DELETE", `/api/payment-links/${l.id}`); return "deleted"; }
  await call("POST", `/api/payment-links/${l.id}/cancel`);
  return "cancelled";
}

/** Alert.alert is a no-op on react-native-web, so web uses window.confirm. */
export function confirmAction(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === "web") { if (window.confirm(`${title}\n\n${message}`)) onConfirm(); return; }
  Alert.alert(title, message, [{ text: "Keep", style: "cancel" }, { text: action, style: "destructive", onPress: onConfirm }]);
}

export function shareText(l: PaymentLink) {
  const amount = money(l.allowPartialPayment && l.remainingBalance ? l.remainingBalance : l.amount, l.currency);
  return `Please pay ${amount}${l.description ? ` for ${l.description}` : ""} with BukkaPay:\n${linkUrl(l)}`;
}

export async function shareLink(l: PaymentLink) {
  try { await Share.share({ message: shareText(l), url: linkUrl(l) }); } catch { /* dismissed */ }
}

export async function shareWhatsApp(l: PaymentLink) {
  const text = encodeURIComponent(shareText(l));
  try {
    const app = `whatsapp://send?text=${text}`;
    await Linking.openURL((await Linking.canOpenURL(app)) ? app : `https://wa.me/?text=${text}`);
  } catch { await shareLink(l); }
}
