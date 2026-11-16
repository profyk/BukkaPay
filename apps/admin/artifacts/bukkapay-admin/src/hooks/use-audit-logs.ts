import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AuditLog {
  id: string;
  actorType: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, any>;
  ip?: string | null;
  createdAt: string;
}

export function useAuditLogs(action?: string) {
  return useQuery({
    queryKey: ["audit-logs", action],
    queryFn: async () => {
      const { data } = await api.get("/admin/audit", { params: action ? { action } : undefined });
      return data as AuditLog[];
    },
    refetchInterval: 30_000,
  });
}
