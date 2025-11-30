import { getAuthHeader } from "./auth";

export async function fetchCards() {
  const res = await fetch("/api/cards", { headers: getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch cards");
  return res.json();
}

export async function createCard(card: any) {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(card),
  });
  if (!res.ok) throw new Error("Failed to create card");
  return res.json();
}

export async function updateCardBalance(id: string, balance: string) {
  const res = await fetch(`/api/cards/${id}/balance`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) throw new Error("Failed to update balance");
  return res.json();
}

export async function fetchTransactions(limit?: number) {
  const url = limit ? `/api/transactions?limit=${limit}` : "/api/transactions";
  const res = await fetch(url, { headers: getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function createTransaction(transaction: any) {
  const res = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(transaction),
  });
  if (!res.ok) throw new Error("Failed to create transaction");
  return res.json();
}

export async function fetchContacts() {
  const res = await fetch("/api/contacts", { headers: getAuthHeader() });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  return res.json();
}

export async function createContact(contact: any) {
  const res = await fetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error("Failed to create contact");
  return res.json();
}

export async function transfer(fromCardId: string, toUserId: string, amount: string) {
  const res = await fetch("/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ fromCardId, toUserId, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Transfer failed");
  }
  return res.json();
}

export async function receivePayment(fromUserId: string, toWalletId: string, amount: string) {
  const res = await fetch("/api/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ fromUserId, toWalletId, amount }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Receive failed");
  }
  return res.json();
}
