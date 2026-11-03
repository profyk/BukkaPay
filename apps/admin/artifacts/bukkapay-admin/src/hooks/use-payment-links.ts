import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PaymentLink {
  id: string;
  senderId: string;
  amount: string;
  currency: string;
  description: string | null;
  status: "pending" | "partial" | "paid" | "expired" | "cancelled" | string;
  createdAt: string;
  user: { id: string; name: string; username: string; email: string };
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

  const deletePaymentLink = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/payment-links/${id}`);
    },
    onSuccess: invalidate,
  });

  return { updateStatus, deletePaymentLink };
}
