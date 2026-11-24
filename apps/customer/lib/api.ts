import { getAuthHeader } from "./auth";
import { API_BASE } from "./config";

export async function fetchCards() {
  const res = await fetch(API_BASE + "/api/cards", { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch cards");
  return res.json();
}

export async function createCard(card: any) {
  const res = await fetch(API_BASE + "/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify(card),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "Failed to create card");
  }
  return res.json();
}

export async function getCardPricing(): Promise<{ issuanceFee: string; monthlyFee: string; currency: string }> {
  const res = await fetch(API_BASE + "/api/cards/pricing");
  if (!res.ok) throw new Error("Failed to fetch card pricing");
  return res.json();
}

export async function setDefaultCard(id: string) {
  const res = await fetch(API_BASE + `/api/cards/${id}/set-default`, {
    method: "PATCH",
    headers: { ...(await getAuthHeader()) },
  });
  if (!res.ok) throw new Error("Failed to set default card");
  return res.json();
}

export async function fetchTransactions(limit?: number) {
  const url = limit ? API_BASE + `/api/transactions?limit=${limit}` : API_BASE + "/api/transactions";
  const res = await fetch(url, { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export type PublicCountry = {
  code: string; name: string; region: string; status: "planned" | "pilot" | "live" | "suspended";
  currency: string; dialCode?: string | null;
};

export async function fetchPublicCountries(): Promise<PublicCountry[]> {
  const res = await fetch(API_BASE + "/api/public/countries");
  if (!res.ok) throw new Error("Couldn't load countries");
  return res.json();
}

export async function fetchOperatingCountries(): Promise<PublicCountry[]> {
  return (await fetchPublicCountries()).filter((c) => c.status === "pilot" || c.status === "live");
}

async function call<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers, ...(await getAuthHeader()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail?.[0]?.msg || "Request failed");
  return data as T;
}

/* ─── Visa cards (one per wallet, issued by the card issuer) ────────────── */

export type CardControls = {
  online: boolean; contactless: boolean; chip: boolean; atm: boolean; international: boolean;
  perTransactionLimit: string | null; dailyLimit: string | null; blockedMccs: string[];
};
export type WalletToken = {
  id: string; wallet: "apple_pay" | "google_pay" | "samsung_pay"; status: string;
  deviceName: string | null; tokenLast4: string | null; createdAt: string;
};
export type IssuedCard = {
  id: string; walletCardId: string; network: "visa"; form: "virtual" | "physical";
  status: "pending_kyc" | "requested" | "active" | "frozen" | "cancelled" | "failed";
  billingCurrency: string; last4: string | null; expMonth: number | null; expYear: number | null;
  cardholderName: string; controls: CardControls; frozenReason: string | null;
  overdraftOutstanding: string; createdAt: string; walletTokens: WalletToken[];
};
export type CardReveal = {
  kind: "hosted" | "sandbox"; expiresAt: string; url: string | null; token: string | null;
  pan: string | null; cvv: string | null; expMonth: number | null; expYear: number | null; cardholderName: string | null;
};
export type CardAuthorization = {
  id: string; status: "approved" | "declined" | "reversed" | "captured" | "expired"; amount: string; fee: string;
  currency: string; merchantAmount: string | null; merchantCurrency: string | null; merchantName: string | null;
  merchantCountry: string | null; channel: string; declineReason: string | null; createdAt: string;
};

export const fetchIssuedCards = () => call<IssuedCard[]>("GET", "/api/issued-cards");
export const fetchIssuedCard = (id: string) => call<IssuedCard>("GET", `/api/issued-cards/${id}`);
export const requestWalletCard = (walletId: string) => call<IssuedCard>("POST", `/api/wallets/${walletId}/issued-card`);
export const freezeCard = (id: string) => call<IssuedCard>("POST", `/api/issued-cards/${id}/freeze`);
export const unfreezeCard = (id: string, pin: string) => call<IssuedCard>("POST", `/api/issued-cards/${id}/unfreeze`, { pin });
export const replaceCard = (id: string, pin: string) => call<IssuedCard>("POST", `/api/issued-cards/${id}/replace`, { pin });
export const updateCardControls = (id: string, pin: string, changes: Partial<CardControls>) =>
  call<IssuedCard>("PATCH", `/api/issued-cards/${id}/controls`, { pin, ...changes });
export const revealCard = (id: string, pin: string) => call<CardReveal>("POST", `/api/issued-cards/${id}/reveal`, { pin });
export const cardAuthorizations = (id: string) => call<CardAuthorization[]>("GET", `/api/issued-cards/${id}/authorizations`);
export const addCardToWallet = (id: string, pin: string, wallet: WalletToken["wallet"], deviceName?: string, device: Record<string, unknown> = {}) =>
  call<{ token: WalletToken; activationData: string; encryptedPassData: string | null; ephemeralPublicKey: string | null }>(
    "POST", `/api/issued-cards/${id}/wallet-tokens`, { pin, wallet, deviceName, device });
export const removeCardFromWallet = (id: string, tokenId: string) =>
  call("DELETE", `/api/issued-cards/${id}/wallet-tokens/${tokenId}`);
/** Sandbox only (non-production API): drive a test card through the issuer webhooks. */
export const simulateCardPayment = (id: string, body: { action: "authorize" | "clear" | "reverse" | "refund"; amount: string; merchantName?: string; merchantCountry?: string; channel?: string; authorizationId?: string }) =>
  call<{ authorizationId?: string; approved?: boolean; declineReason?: string | null; status?: string }>(
    "POST", `/api/sandbox/issued-cards/${id}/simulate`, body);

/* ─── Cross-border: quote, then confirm the quote ───────────────────────── */

export type TransferQuote = {
  kind: "domestic" | "cross_border"; quoteId?: string; expiresAt?: string; rateTimestamp?: string;
  sourceAmount: string; sourceCurrency: string; exchangeRate: string | null; fee: string; totalDebit: string;
  destinationAmount: string; destinationCurrency: string; destinationCountry?: string;
};

export function quoteTransfer(fromCardId: string, amount: string, destinationCountryCode?: string) {
  return call<TransferQuote>("POST", "/api/transfer/quote", { fromCardId, amount, destinationCountryCode });
}

export type TransferStatus = {
  reference: string; status: string; fromCurrency: string; toCurrency: string; sourceAmount: string; fee: string;
  rate: string; destinationAmount: string; corridor: string; rail: string; failureReason?: string | null;
  createdAt: string; settledAt?: string | null; creditedAt?: string | null;
};

export function sendCrossBorder(quoteId: string, fromCardId: string, toUserId: string, pin: string,
                                purpose?: { purposeCategory?: string; purposeSubcategory?: string },
                                idempotencyKey = newIdempotencyKey()) {
  return call<TransferStatus>("POST", "/api/transfers/cross-border", { quoteId, fromCardId, toUserId, pin, ...purpose },
                              { "Idempotency-Key": idempotencyKey });
}

export function getTransferStatus(reference: string) {
  return call<TransferStatus>("GET", `/api/transfers/${reference}`);
}

/* ─── Merchant QR (signed) ──────────────────────────────────────────────── */

export const MERCHANT_QR_PREFIX = "bukkapay:qr:v1:";

export type ResolvedQr = {
  qrId: string; kind: "static" | "dynamic"; amount: string | null; currency: string; reference?: string | null;
  label?: string | null; merchant: { id: string; businessName: string; logo?: string | null; country: string; verified: boolean };
};

export function resolveMerchantQr(payload: string) {
  return call<ResolvedQr>("GET", `/api/qr/resolve?payload=${encodeURIComponent(payload)}`);
}

export function payMerchantQr(payload: string, pin: string, amount?: string) {
  return call<{ success: boolean; transactionId: string; amount: string; currency: string; merchant: string; status: string }>(
    "POST", "/api/qr/pay", { payload, pin, amount });
}

/* ─── Request money ─────────────────────────────────────────────────────── */

export type MoneyRequest = {
  id: string; userId: string; amount: string; currency: string; recipientName?: string | null; status: string;
  description?: string | null; payerUserId?: string | null; expiresAt?: string | null; createdAt: string;
  requester?: { name: string; username: string; walletId?: string } | null;
};

export function createMoneyRequest(body: { amount: string; currency: string; payer?: string; description?: string; expiresInHours?: number; recipientName?: string }) {
  return call<MoneyRequest>("POST", "/api/payment-requests", body);
}
export const incomingMoneyRequests = () => call<MoneyRequest[]>("GET", "/api/payment-requests/incoming");
export const myMoneyRequests = () => call<MoneyRequest[]>("GET", "/api/payment-requests");
export const payMoneyRequest = (id: string, fromCardId: string, pin: string) =>
  call("POST", `/api/payment-requests/${id}/pay`, { fromCardId, pin });
export const cancelMoneyRequest = (id: string) => call("POST", `/api/payment-requests/${id}/cancel`);
export const declineMoneyRequest = (id: string) => call("POST", `/api/payment-requests/${id}/decline`);

/* ─── Contributions ─────────────────────────────────────────────────────── */

export const contributeFromWallet = (groupId: string, body: { contributorName: string; amount: string; message?: string; isAnonymous?: boolean; pin: string }) =>
  call("POST", `/api/contributions/${groupId}/contribute`, body);
export const contributeByEft = (groupId: string, body: { payerName: string; payerEmail?: string; amount: string }) =>
  call<{ paymentUrl: string; paymentRequestId: string; reference: string }>("POST", `/api/contributions/${groupId}/contribute/eft`, body);
export const payoutContribution = (groupId: string, pin: string, amount?: string) =>
  call<{ amount: string; fee: string; net: string; currency: string; remaining: string }>("POST", `/api/contributions/${groupId}/payout`, { pin, amount });
export const closeContribution = (groupId: string) => call("POST", `/api/contributions/${groupId}/close`);

export async function fetchContacts() {
  const res = await fetch(API_BASE + "/api/contacts", { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  return res.json();
}

export async function createContact(contact: any) {
  const res = await fetch(API_BASE + "/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error("Failed to create contact");
  return res.json();
}

export async function getPinStatus() {
  const res = await fetch(API_BASE + "/api/auth/pin/status", { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch PIN status");
  return res.json();
}

export async function setTransactionPin(newPin: string, currentPin?: string) {
  const res = await fetch(API_BASE + "/api/auth/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ newPin, currentPin }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Could not update PIN");
  }
  return res.json();
}

export async function lookupRecipient(identifier: string) {
  const res = await fetch(API_BASE + `/api/wallet/lookup/${encodeURIComponent(identifier)}`, {
    headers: await getAuthHeader(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Recipient not found");
  }
  return res.json();
}

export interface SendMoneyOptions {
  destinationCountryCode?: string;
  purposeCategory?: string;
  purposeSubcategory?: string;
  pin?: string;
  /** Reuse the same key when retrying the same send, so it can never be
   *  executed twice. A fresh key is generated when omitted. */
  idempotencyKey?: string;
}

export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function sendMoney(
  fromCardId: string, toUserId: string, amount: string, options: SendMoneyOptions = {}
) {
  const { idempotencyKey, ...body } = options;
  const res = await fetch(API_BASE + "/api/transfer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey ?? newIdempotencyKey(),
      ...(await getAuthHeader()),
    },
    body: JSON.stringify({ fromCardId, toUserId, amount, ...body }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Transfer failed");
  }
  return res.json();
}


export async function submitKyc(fullName: string, documentType: string, documentNumber: string, photoUrl?: string | null) {
  const res = await fetch(API_BASE + "/api/kyc/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fullName, documentType, documentNumber, photoUrl: photoUrl || undefined }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Could not submit verification details");
  }
  return res.json();
}

export async function getKycStatus() {
  const res = await fetch(API_BASE + "/api/kyc/status", { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch verification status");
  return res.json();
}

// Notifications
/* ─── Push notifications ───────────────────────────────────────────────── */

export type PushPreferences = { money: boolean; cards: boolean; trade: boolean; support: boolean; updates: boolean; showPreviews: boolean };
export type PushDevice = { id: string; kind: "expo" | "webpush"; platform: "ios" | "android" | "web"; deviceName: string | null; active: boolean; createdAt: string; lastSeenAt: string; lastSentAt: string | null };

export const getPushConfig = () => call<{ webPushPublicKey: string | null; expo: boolean }>("GET", "/api/push/config");
export const registerPushDevice = (body: { kind: "expo" | "webpush"; token: string; platform: "ios" | "android" | "web"; keys?: Record<string, string>; deviceName?: string | null }) =>
  call<PushDevice>("POST", "/api/push/devices", body);
export const removePushDevice = (body: { token?: string; id?: string }) => call("POST", "/api/push/devices/remove", body);
export const fetchPushDevices = () => call<PushDevice[]>("GET", "/api/push/devices");
export const fetchPushPreferences = () => call<PushPreferences>("GET", "/api/push/preferences");
export const updatePushPreferences = (changes: Partial<PushPreferences>) => call<PushPreferences>("PUT", "/api/push/preferences", changes);
export const sendTestPush = () => call<{ delivered: number }>("POST", "/api/push/test");

export async function fetchNotifications() {
  const res = await fetch(API_BASE + "/api/notifications", { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
}

export async function markNotificationRead(id: string) {
  const res = await fetch(API_BASE + `/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to mark as read");
  return res.json();
}

export async function markAllNotificationsRead() {
  const res = await fetch(API_BASE + "/api/notifications/read-all", {
    method: "PATCH",
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to mark all as read");
  return res.json();
}

export async function deleteNotification(id: string) {
  const res = await fetch(API_BASE + `/api/notifications/${id}`, {
    method: "DELETE",
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to delete notification");
  return res.json();
}

export async function clearAllNotifications() {
  const res = await fetch(API_BASE + "/api/notifications", {
    method: "DELETE",
    headers: await getAuthHeader(),
  });
  if (!res.ok) throw new Error("Failed to clear notifications");
  return res.json();
}

// ─── Flights (BukkaPay inventory + airline APIs) ─────────────────────────────

export type Airport = { iata: string; name: string; city: string; countryCode: string };
export type Cabin = "economy" | "premium_economy" | "business" | "first";
export type FlightOffer = {
  id: string; provider: string; airlineName: string; airlineCode?: string | null;
  origin: string; destination: string; departingAt: string; arrivingAt: string;
  durationMinutes: number; stops: number; cabin: Cabin; totalAmount: string; currency: string;
  passengers: number; seatsLeft?: number | null; refundable?: boolean | null;
  segments: { flightNumber: string; carrierName: string; origin: string; destination: string; departingAt: string; arrivingAt: string }[];
};
export type Traveller = {
  title: string; givenName: string; familyName: string; bornOn: string; gender: "m" | "f" | "";
  email: string; phone: string;
  document?: { number: string; issuingCountry: string; expiresOn: string; nationality?: string };
};

async function jsonOrThrow(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export async function searchAirports(q: string): Promise<Airport[]> {
  const res = await fetch(API_BASE + "/api/travel/airports?q=" + encodeURIComponent(q), { headers: await getAuthHeader() });
  return jsonOrThrow(res, "Couldn't load airports");
}

export async function searchFlights(p: {
  origin: string; destination: string; date: string; adults: number; children: number; infants: number; cabin: Cabin;
}): Promise<FlightOffer[]> {
  const q = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)]));
  const res = await fetch(API_BASE + "/api/travel/flights/search?" + q.toString(), { headers: await getAuthHeader() });
  return jsonOrThrow(res, "Flight search failed");
}

export async function bookFlight(payload: {
  offerId: string; fromCardId: string; pin: string; adults: number; children: number; infants: number;
  travellers: Traveller[];
}) {
  const res = await fetch(API_BASE + "/api/travel/flights/book", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res, "Booking failed");
}

/** Cancels any travel booking (flights from every provider, and older tickets). */
export async function cancelTravelBooking(purchaseTransactionId: string) {
  const res = await fetch(API_BASE + `/api/travel/flights/bookings/${purchaseTransactionId}/cancel`, {
    method: "POST",
    headers: await getAuthHeader(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Cancellation failed");
  }
  return res.json();
}

