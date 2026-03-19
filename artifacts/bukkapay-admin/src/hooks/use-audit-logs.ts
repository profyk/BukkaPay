import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  target_type: "user" | "transaction" | "kyc" | "system" | string;
  target_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await api.get("/admin/audit-logs");
      return data as AuditLog[];
    },
    refetchInterval: 30_000,
  });
}
