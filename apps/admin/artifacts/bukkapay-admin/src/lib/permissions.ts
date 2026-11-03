import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isDemoMode } from "@/lib/demo";

export type AdminRole = "admin" | "super_admin" | "master";

export interface AdminMe {
  id?: string;
  name?: string;
  email?: string | null;
  role?: AdminRole;
  isActive?: boolean;
}

export interface Permissions {
  role: AdminRole;
  isSuperAdmin: boolean;
  canDeleteUsers: boolean;
  canDeleteTransactions: boolean;
  canAdjustBalances: boolean;
  canBlockWallets: boolean;
  canManageAdmins: boolean;
  canManagePricing: boolean;
  canBroadcast: boolean;
}

function compute(role?: AdminRole): Permissions {
  const isSuper = role === "super_admin" || role === "master";
  return {
    role: role ?? "admin",
    isSuperAdmin: isSuper,
    canDeleteUsers: isSuper,
    canDeleteTransactions: isSuper,
    canAdjustBalances: isSuper,
    canBlockWallets: isSuper,
    canManageAdmins: isSuper,
    canManagePricing: isSuper,
    canBroadcast: true,
  };
}

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin-me"],
    queryFn: async () => {
      const { data } = await api.get("/admin/auth/me");
      return data as AdminMe;
    },
    enabled: !isDemoMode(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function usePermissions(): Permissions {
  const { data: me } = useAdminMe();
  if (isDemoMode()) return compute("super_admin");
  return compute(me?.role);
}
