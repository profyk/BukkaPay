/**
 * Money in, money out and moves between your own wallets.
 *
 * Bank top-ups and withdrawals go through Stitch (South African banks, ZAR).
 * The app asks the API whether Stitch is switched on before showing a form,
 * so nobody fills one in for a service that can't run yet.
 */
import { API_BASE } from "./config";
import { getAuthHeader } from "./auth";
import { newIdempotencyKey } from "./api";

export type Bank = { id: string; name: string };
export type MoneyError = Error & { code?: string; balance?: string; needed?: string; currency?: string };

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers, ...(await getAuthHeader()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: MoneyError = new Error(data.error || data.detail?.[0]?.msg || "Something went wrong");
    Object.assign(err, { code: data.code, balance: data.balance, needed: data.needed, currency: data.currency });
    throw err;
  }
  return data as T;
}

/** True when the error means "top up first" (empty or short wallet). */
export const needsTopUp = (e: unknown) => ["no_funds", "insufficient_funds"].includes((e as MoneyError)?.code ?? "");

export const bankRailStatus = () => call<{ configured: boolean }>("GET", "/api/stitch/status").catch(() => ({ configured: false }));
export const fetchBanks = () => call<{ banks: Bank[] }>("GET", "/api/stitch/banks").then((r) => r.banks || []).catch(() => [] as Bank[]);

export const startBankTopUp = (walletCardId: string, amount: string) =>
  call<{ paymentRequestId: string; paymentUrl: string }>("POST", "/api/wallet/topup/stitch", { walletCardId, amount, currency: "ZAR" });

export const checkBankTopUp = (paymentRequestId: string, walletCardId: string, amount: string) =>
  call<{ status: "pending" | "completed" | "review" | "failed" }>("POST", "/api/wallet/topup/stitch/verify", { paymentRequestId, walletCardId, amount });

export type BankDetails = { bankId: string; bankName: string; accountNumber: string; accountName: string; accountType: "savings" | "current" | "transmission" };

export const withdrawToBank = (walletCardId: string, amount: string, bank: BankDetails, pin: string) =>
  call<{ message?: string; status: string; reference?: string; newBalance?: string; fee?: string }>(
    "POST", "/api/wallet/withdraw/stitch",
    { walletCardId, amount, currency: "ZAR", bankId: bank.bankId, accountNumber: bank.accountNumber, accountType: bank.accountType, accountName: bank.accountName, pin },
    { "Idempotency-Key": newIdempotencyKey() },
  );

export const moveBetweenOwn = (fromCardId: string, toCardId: string, amount: string, pin: string) =>
  call<{ amount: string; currency: string; reference: string }>("POST", "/api/wallets/move", { fromCardId, toCardId, amount, pin },
    { "Idempotency-Key": newIdempotencyKey() });

/** Last bank used for withdrawals, remembered on this device only (no PIN, no secrets). */
const SAVED_BANK = "withdraw_bank";
export async function savedBank(): Promise<BankDetails | null> {
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const raw = await AsyncStorage.getItem(SAVED_BANK);
    return raw ? (JSON.parse(raw) as BankDetails) : null;
  } catch { return null; }
}
export async function rememberBank(b: BankDetails) {
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem(SAVED_BANK, JSON.stringify(b));
  } catch {}
}

export const maskAccount = (n: string) => (n.length > 4 ? `•••• ${n.slice(-4)}` : n);
