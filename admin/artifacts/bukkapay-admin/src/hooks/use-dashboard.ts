import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  frozenUsers: number;
  totalTransactions: number;
  flaggedTransactions: number;
  totalVolume: number;
  pendingKyc: number;
  totalMerchants: number;
  totalPaymentLinks: number;
  activePaymentLinks: number;
  activeAdmins: number;
  verifiedUsers: number;
  recentTransactions: Array<{ date: string; volume: number; count: number }>;
  userGrowth: Array<{ date: string; count: number }>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data } = await api.get("/admin/stats");
      return data as DashboardStats;
    },
    refetchInterval: 60_000,
  });
}
