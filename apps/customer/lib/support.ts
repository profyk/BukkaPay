/** Help desk: the customer's support tickets. */
import { API_BASE } from "./config";
import { getAuthHeader } from "./auth";

export type Ticket = {
  id: string; reference: string; subject: string; category: string; channel: string
  status: "open" | "waiting_customer" | "resolved" | "closed"; createdAt: string; updatedAt: string | null
  rating: number | null; canRate: boolean
};
export type TicketDetail = Ticket & { messages: { id: string; author: "customer" | "agent" | "system"; body: string; createdAt: string }[] };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method, body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(await getAuthHeader()) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail?.[0]?.msg || "Something went wrong");
  return data as T;
}

export const fetchTickets = () => call<{ tickets: Ticket[]; categories: string[]; email: string }>("GET", "/api/support/tickets");
export const createTicket = (b: { subject: string; category: string; message: string }) => call<Ticket>("POST", "/api/support/tickets", b);
export const fetchTicket = (id: string) => call<TicketDetail>("GET", `/api/support/tickets/${id}`);
export const replyTicket = (id: string, message: string) => call<Ticket>("POST", `/api/support/tickets/${id}/messages`, { message });
export const resolveTicket = (id: string) => call<Ticket>("POST", `/api/support/tickets/${id}/resolve`);
export const rateTicket = (id: string, rating: number, comment?: string) => call<Ticket>("POST", `/api/support/tickets/${id}/rate`, { rating, comment });

export const STATUS_LABEL: Record<string, string> = {
  open: "We're on it", waiting_customer: "Waiting for your reply", resolved: "Resolved", closed: "Closed",
};
