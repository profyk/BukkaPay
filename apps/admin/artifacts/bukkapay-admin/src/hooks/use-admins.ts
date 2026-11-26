import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The platform owner — the one and only super admin (enforced by the API and database). */
export const OWNER_EMAIL = "profykersha18@gmail.com";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface AdminInvite {
  id: string;
  email: string;
  name: string;
  role: string;
  status: "pending" | "expired" | "revoked" | "accepted";
  expiresAt: string;
  createdAt: string;
}

export interface InviteLink {
  invite: AdminInvite;
  link: string;
  emailSent: boolean;
}

/** Roles that can be given to invited admins. Super Admin is never assignable. */
export const ASSIGNABLE_ROLES: { value: string; label: string; summary: string }[] = [
  { value: "ceo", label: "CEO", summary: "Sees everything; approves maker-checker requests." },
  { value: "finance_admin", label: "Finance Admin", summary: "Fees, FX, ledger adjustment requests, reconciliation." },
  { value: "compliance_officer", label: "Compliance Officer", summary: "KYC/KYB review, compliance, freezes, legal publishing." },
  { value: "operations_admin", label: "Operations Admin", summary: "Network, users, merchants, website, broadcasts." },
  { value: "customer_support", label: "Customer Support", summary: "Users, KYC status, wallets and support chat." },
  { value: "merchant_support", label: "Merchant Support", summary: "Merchants, their transactions and support chat." },
  { value: "technical_admin", label: "Technical Admin", summary: "Network status, webhooks, audit log." },
  { value: "risk_analyst", label: "Risk Analyst", summary: "Fraud and compliance cases; can freeze users and restrict wallets." },
  { value: "kyc_analyst", label: "KYC Analyst", summary: "Reviews customer identity and merchant business verification." },
  { value: "treasury_manager", label: "Treasury Manager", summary: "FX, reconciliation and ledger adjustment requests (approved by another admin)." },
  { value: "marketing_manager", label: "Marketing Manager", summary: "Website content and broadcast messages." },
  { value: "travel_manager", label: "Travel Manager", summary: "Airlines, flight routes and travel support." },
  { value: "country_manager", label: "Country Manager", summary: "Runs assigned countries: customers, merchants, agents, support and network setup. Set their countries in Organisation." },
  { value: "people_manager", label: "People Manager", summary: "Departments, staff profiles, reporting lines and country coverage. Not roles or money." },
  { value: "legal_counsel", label: "Legal Counsel", summary: "Drafts and publishes legal documents; reads compliance." },
  { value: "data_analyst", label: "Data Analyst", summary: "Read-only analytics, revenue, transactions and the ledger." },
  { value: "auditor", label: "Auditor", summary: "Read-only access to everything." },
  { value: "admin", label: "Admin (legacy)", summary: "General admin role." },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries([
  ["super_admin", "Super Admin"],
  ...ASSIGNABLE_ROLES.map((r) => [r.value, r.label]),
]);

export const ADMINS_KEY = ["admins"];
export const INVITES_KEY = ["admin-invites"];

export function useAdmins() {
  return useQuery({
    queryKey: ADMINS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/admins");
      return data as AdminUser[];
    },
  });
}

export function useInvites() {
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/invites");
      return data as AdminInvite[];
    },
  });
}

export function useAdminActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMINS_KEY });
    queryClient.invalidateQueries({ queryKey: INVITES_KEY });
  };

  const inviteAdmin = useMutation({
    mutationFn: async (payload: { name: string; email: string; role: string }) => {
      const { data } = await api.post("/admin/invites", payload);
      return data as InviteLink;
    },
    onSuccess: invalidate,
  });

  const resendInvite = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/invites/${id}/resend`);
      return data as InviteLink;
    },
    onSuccess: invalidate,
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/invites/${id}`);
    },
    onSuccess: invalidate,
  });

  const updateAdmin = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; email?: string; password?: string; role?: string; isActive?: boolean }) => {
      const { data } = await api.patch(`/admin/admins/${id}`, payload);
      return data as AdminUser;
    },
    onSuccess: invalidate,
  });

  const deleteAdmin = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/admins/${id}`);
    },
    onSuccess: invalidate,
  });

  return { inviteAdmin, resendInvite, revokeInvite, updateAdmin, deleteAdmin };
}
