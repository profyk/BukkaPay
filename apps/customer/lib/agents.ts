/** Cash agents (deposit and withdraw cash at local shops) and the monthly plan. */
import { API_BASE } from "./config";
import { getAuthHeader } from "./auth";

export type Agent = {
  id: string; name: string; address: string; city: string | null; country: string; currency: string
  phone: string | null; openingHours: string | null; latitude: string | null; longitude: string | null
};
export type AgentTx = {
  id: string; reference: string; kind: "cash_in" | "cash_out"; status: string; currency: string; amount: string
  fee: string; createdAt: string; expiresAt: string | null; completedAt: string | null; code?: string
};
export type CashOutQuote = { currency: string; amount: string; fee: string; total: string };
export type Plan = {
  enabled: boolean; monthlyFee: string; currency: string | null; freeUntil: string | null
  thisMonth: { status: "charged" | "due" | "waived"; reason: string | null } | null
  nextChargeDate: string; waivedWhen: string[]
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method, body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(await getAuthHeader()) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail?.[0]?.msg || "Something went wrong");
  return data as T;
}

export const fetchAgents = (city?: string) =>
  call<Agent[]>("GET", `/api/agents${city ? `?city=${encodeURIComponent(city)}` : ""}`);
export const quoteCashOut = (walletId: string, amount: string) =>
  call<CashOutQuote>("GET", `/api/agents/cash-out/quote?walletId=${walletId}&amount=${encodeURIComponent(amount)}`);
export const requestCashOut = (walletId: string, amount: string, pin: string) =>
  call<AgentTx>("POST", "/api/agents/cash-out", { walletId, amount, pin });
export const cancelCashOut = (id: string) => call<AgentTx>("POST", `/api/agents/cash-out/${id}/cancel`);
export const fetchAgentTransactions = () => call<AgentTx[]>("GET", "/api/agents/transactions");
export const fetchMyPlan = () => call<Plan>("GET", "/api/pricing/my-plan");

export const WAIVER_REASONS: Record<string, string> = {
  free_months: "Free for your first month", inactive: "No activity that month", unverified: "Account not verified yet",
  account_restricted: "Account restricted", insufficient_balance: "Balance too low (we never charge into debt)",
  no_price: "No fee in your country", no_wallet: "No wallet yet",
};
