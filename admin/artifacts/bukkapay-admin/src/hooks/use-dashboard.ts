import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DashboardStats {
  total_users: number;
  active_users: number;
  frozen_users: number;
  total_transactions: number;
  flagged_transactions: number;
  total_volume: number;
  pending_kyc: number;
  total_merchants: number;
  total_payment_links: number;
  active_payment_links: number;
  active_admins: number;
  verified_users: number;
  recent_transactions: Array<{ date: string; volume: number; count: number }>;
  user_growth: Array<{ date: string; count: number }>;
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
