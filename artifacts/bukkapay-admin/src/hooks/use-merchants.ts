import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Merchant {
  id: string;
  business_name: string;
  user_email: string;
  user_name: string;
  category: string;
  status: string;
  created_at: string | null;
}

export function useMerchants(page = 1) {
  return useQuery({
    queryKey: ["merchants", page],
    queryFn: async () => {
      const { data } = await api.get(`/admin/merchants?page=${page}&limit=50`);
      return data as { merchants: Merchant[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}
