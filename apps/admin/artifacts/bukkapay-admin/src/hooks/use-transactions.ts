import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Transaction {
  id: string;
  user_email: string;
  user_name: string;
  amount: number;
  status: "completed" | "pending" | "flagged" | "failed" | string;
  currency: string;
  type: string;
  description: string;
  created_at: string | null;
}

export const TRANSACTIONS_QUERY_KEY = ["transactions"];

export function useTransactions(page = 1) {
  return useQuery({
    queryKey: [...TRANSACTIONS_QUERY_KEY, page],
    queryFn: async () => {
      const { data } = await api.get(`/admin/transactions?page=${page}&limit=50`);
      return data as { transactions: Transaction[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}

export function useTransactionActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });

  const flagTransaction = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/transactions/flag/${id}`);
    },
    onSuccess: invalidate,
  });

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/transactions/${id}`);
    },
    onSuccess: invalidate,
  });

  return { flagTransaction, deleteTransaction };
}
