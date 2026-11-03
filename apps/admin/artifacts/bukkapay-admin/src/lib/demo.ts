import type { User } from "@/hooks/use-users";
import type { Transaction } from "@/hooks/use-transactions";

export const DEMO_TOKEN = "bukkapay_demo_mode";

export function isDemoMode(): boolean {
  return localStorage.getItem("bukkapay_token") === DEMO_TOKEN;
}

export function enterDemoMode(): void {
  localStorage.setItem("bukkapay_token", DEMO_TOKEN);
}

export const DEMO_USERS: User[] = [
  { id: "u1", email: "alice.johnson@gmail.com",   status: "active",  role: "user" },
  { id: "u2", email: "bob.smith@outlook.com",      status: "frozen",  role: "user" },
  { id: "u3", email: "carol.white@yahoo.com",      status: "active",  role: "user" },
  { id: "u4", email: "david.lee@gmail.com",        status: "deleted", role: "user" },
  { id: "u5", email: "eve.martinez@hotmail.com",   status: "active",  role: "user" },
  { id: "u6", email: "frank.nguyen@gmail.com",     status: "frozen",  role: "user" },
  { id: "u7", email: "grace.kim@outlook.com",      status: "active",  role: "user" },
  { id: "u8", email: "henry.patel@gmail.com",      status: "active",  role: "admin" },
];

export const DEMO_TRANSACTIONS: Transaction[] = [
  { id: "t1", user_email: "alice.johnson@gmail.com",  amount: 25000,  status: "completed", currency: "NGN", type: "transfer",  created_at: "2026-03-19T08:22:00Z" },
  { id: "t2", user_email: "carol.white@yahoo.com",    amount: 5000,   status: "pending",   currency: "NGN", type: "deposit",   created_at: "2026-03-19T07:55:00Z" },
  { id: "t3", user_email: "eve.martinez@hotmail.com", amount: 150000, status: "flagged",   currency: "NGN", type: "transfer",  created_at: "2026-03-19T06:40:00Z" },
  { id: "t4", user_email: "henry.patel@gmail.com",    amount: 3200,   status: "completed", currency: "NGN", type: "withdrawal", created_at: "2026-03-18T22:10:00Z" },
  { id: "t5", user_email: "alice.johnson@gmail.com",  amount: 8750,   status: "failed",    currency: "NGN", type: "transfer",  created_at: "2026-03-18T20:05:00Z" },
  { id: "t6", user_email: "grace.kim@outlook.com",    amount: 60000,  status: "completed", currency: "NGN", type: "deposit",   created_at: "2026-03-18T17:30:00Z" },
  { id: "t7", user_email: "frank.nguyen@gmail.com",   amount: 12000,  status: "flagged",   currency: "NGN", type: "transfer",  created_at: "2026-03-18T14:15:00Z" },
  { id: "t8", user_email: "carol.white@yahoo.com",    amount: 500,    status: "completed", currency: "NGN", type: "withdrawal", created_at: "2026-03-17T11:00:00Z" },
];
