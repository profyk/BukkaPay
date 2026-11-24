/** The only network calls the public pay app makes: anonymous, no tokens. */

export const API = process.env.NEXT_PUBLIC_API_URL || "https://api.bukkapay.com";
export const APP = process.env.NEXT_PUBLIC_APP_URL || "https://app.bukkapay.com";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: string) => UUID.test(v);
export const isRef = (v: string) => /^[A-Z0-9-]{4,40}$/i.test(v);

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || data.detail?.[0]?.msg || "Something went wrong. Please try again.", res.status);
  return data as T;
}

export const money = (ccy: string, v: string | number | null | undefined) => {
  const n = Number(v || 0);
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: ccy, currencyDisplay: "narrowSymbol" }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(2)}`;
  }
};

/** Only send the browser to addresses we expect (the bank or our own app). */
export function safeRedirect(url: string) {
  try {
    const u = new URL(url);
    const ok = u.protocol === "https:" && (/(^|\.)stitch\.money$/.test(u.hostname) || /(^|\.)bukkapay\.com$/.test(u.hostname));
    if (ok) window.location.assign(u.toString());
    else throw new Error("unexpected redirect");
  } catch {
    throw new ApiError("We couldn't open your bank's payment page. Please try again.", 502);
  }
}

export type PaymentLink = {
  id: string; amount: string; currency: string; description: string | null; amountPaid: string;
  remainingBalance: string | null; allowPartialPayment: boolean; minimumPayment: string | null; status: string;
  expiresAt: string | null; destination: string; businessName: string | null; businessLogo: string | null;
  senderName: string | null; createdAt: string;
  invoice: { customerName: string; items: { description?: string; name?: string; quantity?: number; unitPrice?: string; price?: string; amount?: string }[];
             totalAmount: string; dueDate: string | null; notes: string | null } | null;
};
