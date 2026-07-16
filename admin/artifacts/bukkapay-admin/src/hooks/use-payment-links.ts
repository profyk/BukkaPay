import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PaymentLink {
  id: string;
  user_email: string;
  user_name: string;
  amount: number;
  currency: string;
  description: string;
  status: "active" | "expired" | "cancelled" | string;
  expiresAt: string | null;
  created_at: string | null;
}

export const PAYMENT_LINKS_KEY = ["payment-links"];

export function usePaymentLinks(page = 1) {
  return useQuery({
    queryKey: [...PAYMENT_LINKS_KEY, page],
    queryFn: async () => {
      const { data } = await api.get(`/admin/payment-links?page=${page}&limit=50`);
      return data as { paymentLinks: PaymentLink[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}

export function usePaymentLinkActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: PAYMENT_LINKS_KEY });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await api.patch(`/admin/payment-links/${id}/status`, { status });
    },
    onSuccess: invalidate,
  });

  return { updateStatus };
}
