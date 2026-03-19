import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Wallet {
  id: string;
  user_id: string;
  user_email: string;
  balance: number;
  currency: string;
  status: "active" | "frozen" | "suspended" | string;
  last_transaction_at?: string;
  created_at: string;
}

export function useWallets() {
  return useQuery({
    queryKey: ["wallets"],
    queryFn: async () => {
      const { data } = await api.get("/admin/wallets");
      return data as Wallet[];
    },
  });
}
