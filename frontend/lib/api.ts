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

export async function revealCardDetails(
  cardId: string, pin: string
): Promise<{ cardNumber: string; expiryDate: string | null; cvv: string | null }> {
  const res = await fetch(API_BASE + `/api/cards/${cardId}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "Could not verify PIN");
  }
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

export async function updateCardBalance(id: string, balance: string) {
  const res = await fetch(API_BASE + `/api/cards/${id}/balance`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) throw new Error("Failed to update balance");
  return res.json();
}

export async function fetchTransactions(limit?: number) {
  const url = limit ? API_BASE + `/api/transactions?limit=${limit}` : API_BASE + "/api/transactions";
  const res = await fetch(url, { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function createTransaction(transaction: any) {
  const res = await fetch(API_BASE + "/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to create transaction");
  return res.json();
}

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
}

export async function sendMoney(
  fromCardId: string, toUserId: string, amount: string, options: SendMoneyOptions = {}
) {
  const res = await fetch(API_BASE + "/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fromCardId, toUserId, amount, ...options }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Transfer failed");
  }
  return res.json();
}

export async function getTransferQuote(fromCurrency: string, toCurrency: string, amount: string) {
  const res = await fetch(API_BASE + "/api/transfer/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fromCurrency, toCurrency, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Could not get a quote");
  }
  return res.json();
}

export async function receivePayment(fromUserId: string, toWalletId: string, amount: string) {
  const res = await fetch(API_BASE + "/api/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fromUserId, toWalletId, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Receive failed");
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

export async function searchDepartures(params: {
  mode: "bus" | "flight"; originCountryCode?: string; destinationCountryCode?: string; date?: string;
}) {
  const query = new URLSearchParams();
  query.set("mode", params.mode);
  if (params.originCountryCode) query.set("originCountryCode", params.originCountryCode);
  if (params.destinationCountryCode) query.set("destinationCountryCode", params.destinationCountryCode);
  if (params.date) query.set("date", params.date);
  const res = await fetch(API_BASE + "/api/travel/search?" + query.toString(), { headers: await getAuthHeader() });
  if (!res.ok) throw new Error("Failed to search departures");
  return res.json();
}

export async function bookTravel(payload: {
  departureId: string; fromCardId: string; seatClass?: string;
  passengers: { name: string; idNumber?: string; phone?: string }[];
}) {
  const res = await fetch(API_BASE + "/api/travel/book", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Booking failed");
  }
  return res.json();
}

export async function cancelTravelBooking(purchaseTransactionId: string) {
  const res = await fetch(API_BASE + `/api/travel/bookings/${purchaseTransactionId}/cancel`, {
    method: "POST",
    headers: await getAuthHeader(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Cancellation failed");
  }
  return res.json();
}

