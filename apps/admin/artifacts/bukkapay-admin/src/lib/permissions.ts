import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AdminRole =
  | "super_admin" | "ceo" | "finance_admin" | "compliance_officer" | "operations_admin"
  | "customer_support" | "merchant_support" | "technical_admin" | "auditor" | "admin" | "master";

export interface AdminMe {
  id?: string;
  name?: string;
  email?: string | null;
  role?: AdminRole;
  permissions?: string[];
  mfaEnabled?: boolean;
}

/** Permission flags derived from the backend's role → permission map
 *  (GET /admin/auth/me returns the effective permission list). The server
 *  enforces every one of these; the UI only hides what you can't use. */
export interface Permissions {
  role: AdminRole;
  list: Set<string>;
  can: (permission: string) => boolean;
  isSuperAdmin: boolean;
  canDeleteUsers: boolean;
  canDeleteTransactions: boolean;
  canBlockWallets: boolean;
  canManageAdmins: boolean;
  canBroadcast: boolean;
}

function compute(me?: AdminMe): Permissions {
  const list = new Set(me?.permissions ?? []);
  const can = (p: string) => list.has(p);
  const role = (me?.role ?? "admin") as AdminRole;
  return {
    role,
    list,
    can,
    isSuperAdmin: role === "super_admin" || role === "master",
    canDeleteUsers: can("users.manage"),
    canDeleteTransactions: can("users.manage"),
    canBlockWallets: can("wallets.restrict"),
    canManageAdmins: can("admins.manage"),
    canBroadcast: can("broadcast.send"),
  };
}

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin-me"],
    queryFn: async () => {
      const { data } = await api.get("/admin/auth/me");
      return data as AdminMe;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePermissions(): Permissions {
  const { data: me } = useAdminMe();
  return compute(me);
}
