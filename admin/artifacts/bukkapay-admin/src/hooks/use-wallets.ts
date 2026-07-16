import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Wallet {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  balance: number;
  currency: string;
  status: "active" | "frozen" | "blocked" | string;
  flagged: boolean;
  cardNumber: string;
  cardType: string;
  last_transaction_at: string | null;
  created_at: string | null;
}

export const WALLETS_QUERY_KEY = ["wallets"];

export function useWallets(page = 1) {
  return useQuery({
    queryKey: [...WALLETS_QUERY_KEY, page],
    queryFn: async () => {
      const { data } = await api.get(`/admin/wallets?page=${page}&limit=50`);
      return data as { wallets: Wallet[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}

export function useWalletActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WALLETS_QUERY_KEY });

  const freezeWallet = useMutation({
    mutationFn: async ({ id, frozen }: { id: string; frozen: boolean }) => {
      await api.patch(`/admin/wallets/${id}/freeze`, { frozen });
    },
    onSuccess: invalidate,
  });

  const blockWallet = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/wallets/${id}/block`);
    },
    onSuccess: invalidate,
  });

  const unblockWallet = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/wallets/${id}/unblock`);
    },
    onSuccess: invalidate,
  });

  const flagWallet = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/wallets/${id}/flag`);
    },
    onSuccess: invalidate,
  });

  const unflagWallet = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/admin/wallets/${id}/unflag`);
    },
    onSuccess: invalidate,
  });

  const adjustBalance = useMutation({
    mutationFn: async ({ id, balance }: { id: string; balance: number }) => {
      await api.patch(`/admin/wallets/${id}/balance`, { balance });
    },
    onSuccess: invalidate,
  });

  return { freezeWallet, blockWallet, unblockWallet, flagWallet, unflagWallet, adjustBalance };
}
