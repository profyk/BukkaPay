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
  if (!res.ok) throw new Error("Failed to create card");
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

export async function transfer(fromCardId: string, toUserId: string, amount: string) {
  const res = await fetch(API_BASE + "/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fromCardId, toUserId, amount }),
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

export async function sendInternational(fromCardId: string, toUserId: string, toCurrency: string, amount: string) {
  const res = await fetch(API_BASE + "/api/transfer/international", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fromCardId, toUserId, toCurrency, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Transfer failed");
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

export async function submitKyc(fullName: string, documentType: string, documentNumber: string) {
  const res = await fetch(API_BASE + "/api/kyc/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
    body: JSON.stringify({ fullName, documentType, documentNumber }),
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

