import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Transaction {
  id: string;
  user_email: string;
  amount: number;
  status: "completed" | "pending" | "flagged" | "failed" | string;
}

export const TRANSACTIONS_QUERY_KEY = ["transactions"];

export function useTransactions() {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/transactions");
      return data as Transaction[];
    },
  });
}

export function useTransactionActions() {
  const queryClient = useQueryClient();

  const flagTransaction = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/transactions/flag/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY }),
  });

  return {
    flagTransaction,
  };
}
