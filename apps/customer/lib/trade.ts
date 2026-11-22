/**
 * Trade (Pay Supplier / escrow), receipts and currency swaps.
 *
 * Every money call sends an `Idempotency-Key`. Screens create one key per
 * user action (newIdempotencyKey()) and reuse it when retrying, so a retry
 * after a dropped connection can never charge twice.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform, Share } from "react-native";
import { API_BASE } from "./config";
import { getAuthHeader } from "./auth";

export function newIdempotencyKey(): string {
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
}

async function call<T = any>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(await getAuthHeader()), ...extra },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

// ─── types ───────────────────────────────────────────────────────────────────

export type TradeItem = { lineNo: number; description: string; hsCode?: string | null; originCountry?: string | null; quantity: string; unit?: string | null; unitPrice: string; lineTotal: string };
export type TradeInvoice = {
  reference: string; status: string; currency: string; subtotal: string; taxTotal: string; total: string;
  paymentMode: "instant" | "escrow" | "either"; sellerCountry: string; buyerCountry?: string | null;
  incoterm?: string | null; notes?: string | null; expiresAt?: string | null;
  seller?: { name: string; country: string; verified: boolean }; items?: TradeItem[];
};
export type Escrow = {
  reference: string; status: "funded" | "released" | "refunded" | "disputed"; currency: string; amount: string;
  fee: string; feeRate: string; sellerReceives: string; paidFrom?: { currency: string; amount: string; rate: string } | null;
  releaseCondition: string; autoReleaseAt?: string | null; disputeReason?: string | null; resolutionNote?: string | null;
  createdAt: string; events?: { event: string; actor: string; note?: string | null; at: string }[];
  receipts?: { number: string; kind: string; issuedAt: string; sha256: string }[];
};
export type SwapQuote = { from: string; to: string; amount: string; rate: string; spreadPercent: string; spread: string; receive: string };

// ─── trade ───────────────────────────────────────────────────────────────────

export const fetchInvoice = (ref: string) => call<TradeInvoice>("GET", `/api/public/trade-invoices/${encodeURIComponent(ref.trim().toUpperCase())}`);

export const payInvoice = (ref: string, p: { fromCardId: string; pin: string; mode: "instant" | "escrow"; releaseCondition?: string }, key: string) =>
  call<{ mode: string; receipt?: string; escrow?: Escrow; receipts?: Escrow["receipts"] }>(
    "POST", `/api/trade/invoices/${encodeURIComponent(ref)}/pay`, p, { "Idempotency-Key": key });

export const fetchEscrows = () => call<Escrow[]>("GET", "/api/trade/escrows");
export const fetchEscrow = (ref: string) => call<Escrow>("GET", `/api/trade/escrows/${encodeURIComponent(ref)}`);
export const confirmGoods = (ref: string, pin: string) => call<Escrow>("POST", `/api/trade/escrows/${encodeURIComponent(ref)}/confirm`, { pin });
export const disputeEscrow = (ref: string, reason: string) => call<Escrow>("POST", `/api/trade/escrows/${encodeURIComponent(ref)}/dispute`, { reason });

/** Download the receipt PDF and open the share sheet (border post, WhatsApp, email). */
export async function shareReceipt(number: string): Promise<void> {
  const url = `${API_BASE}/api/trade/receipts/${encodeURIComponent(number)}/pdf`;
  const headers = await getAuthHeader();
  if (Platform.OS === "web") {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Couldn't download the receipt");
    const blob = await res.blob();
    const link = (globalThis as any).document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${number}.pdf`;
    link.click();
    return;
  }
  const target = `${FileSystem.cacheDirectory}${number}.pdf`;
  const r = await FileSystem.downloadAsync(url, target, { headers });
  if (r.status !== 200) throw new Error("Couldn't download the receipt");
  await Share.share({ url: r.uri, title: `BukkaPay trade receipt ${number}`, message: `BukkaPay trade receipt ${number}` });
}

// ─── swaps ───────────────────────────────────────────────────────────────────

export const swapQuote = (from: string, to: string, amount: string) =>
  call<SwapQuote>("GET", `/api/swap/quote?from=${from}&to=${to}&amount=${encodeURIComponent(amount)}`);

export const doSwap = (p: { fromCardId: string; toCurrency: string; amount: string; expectedReceive: string; pin: string }, key: string) =>
  call<{ debited: string; received: string; to: string; from: string }>("POST", "/api/swap", p, { "Idempotency-Key": key });
