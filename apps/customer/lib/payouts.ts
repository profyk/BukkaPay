/** Cross-border payouts to bank accounts and mobile wallets. Amounts are
 *  integer minor units (cents) on the wire, exactly like the API. */
import { API_BASE } from "./config";
import { getAuthHeader } from "./auth";
import { newIdempotencyKey } from "./api";

export type Corridor = { country: string; currency: string; bank: boolean; mobileWallet: boolean; operators: string[]; branchCode: boolean };
export type Recipient = { id: string; nickname: string | null; country: string; currency: string; method: "bank" | "mobile_wallet";
  firstName: string; lastName: string; bankName: string | null; accountHint: string };
export type Payout = { id: string; reference: string; status: string; rail: string; inNetwork: boolean; country: string; method: string;
  sendCurrency: string; sendAmount: number; feeAmount: number; totalAmount: number; receiveCurrency: string; receiveAmount: number;
  fxRate: string | null; fxSpreadAmount: number; quoteExpiresAt: string; failureReason: string | null; createdAt: string };

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method, body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers, ...(await getAuthHeader()) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.detail?.[0]?.msg || "Something went wrong"), { code: data.code });
  return data as T;
}

export const fetchCorridors = () => call<Corridor[]>("GET", "/api/payouts/corridors");
export const fetchRecipients = () => call<Recipient[]>("GET", "/api/payouts/recipients");
export const addRecipient = (r: Record<string, string | undefined>) => call<Recipient>("POST", "/api/payouts/recipients", r);
export const deleteRecipient = (id: string) => call("DELETE", `/api/payouts/recipients/${id}`);
export const quotePayout = (b: { sourceWalletId: string; recipientId: string; amount: number; side: "send" | "receive"; purpose: string }) =>
  call<Payout>("POST", "/api/payouts/quote", b);
export const confirmPayout = (id: string, pin: string) =>
  call<Payout>("POST", `/api/payouts/${id}/confirm`, { pin }, { "Idempotency-Key": newIdempotencyKey() });
export const fetchPayout = (id: string) => call<Payout>("GET", `/api/payouts/${id}`);

/** "12.34" → 1234 (exact, no floats); null if not a valid amount. */
export function toMinor(input: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
}
export const fromMinor = (n: number, ccy: string) => `${ccy} ${(n / 100).toFixed(2)}`;

export const COUNTRY_NAMES: Record<string, string> = {
  ZA: "South Africa", BW: "Botswana", ZW: "Zimbabwe", ZM: "Zambia", NA: "Namibia", MZ: "Mozambique", MW: "Malawi",
  KE: "Kenya", UG: "Uganda", TZ: "Tanzania", GH: "Ghana", NG: "Nigeria",
};
export const PURPOSES: [string, string][] = [
  ["family_support", "Family support"], ["education", "School fees"], ["medical", "Medical"], ["business", "Business / trade"],
  ["salary", "Salary"], ["gift", "Gift"], ["other", "Other"],
];
