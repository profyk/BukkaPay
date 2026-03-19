import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isDemoMode, DEMO_TRANSACTIONS } from "@/lib/demo";

export interface Transaction {
  id: string;
  user_email: string;
  amount: number;
  status: "completed" | "pending" | "flagged" | "failed" | string;
  currency?: string;
  type?: string;
  created_at?: string;
}

export const TRANSACTIONS_QUERY_KEY = ["transactions"];

export function useTransactions() {
  return useQuery({
    queryKey: TRANSACTIONS_QUERY_KEY,
    queryFn: async () => {
      if (isDemoMode()) return DEMO_TRANSACTIONS;
      const { data } = await api.get("/admin/transactions");
      return data as Transaction[];
    },
  });
}

export function useTransactionActions() {
  const queryClient = useQueryClient();

  const flagTransaction = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode()) return;
      await api.post(`/admin/transactions/flag/${id}`);
    },
    onMutate: async (id: string) => {
      if (!isDemoMode()) return;
      await queryClient.cancelQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      const prev = queryClient.getQueryData<Transaction[]>(TRANSACTIONS_QUERY_KEY);
      queryClient.setQueryData<Transaction[]>(TRANSACTIONS_QUERY_KEY, (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status: "flagged" } : t))
      );
      return { prev };
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(TRANSACTIONS_QUERY_KEY, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY }),
  });

  return { flagTransaction };
}
