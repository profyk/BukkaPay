import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PricingConfig {
  transfer:     { fee_percentage: number; fee_fixed: number; min_amount: number; max_amount: number };
  payment_link: { fee_percentage: number; fee_fixed: number; min_amount: number; max_amount: number };
  virtual_card: { issuance_fee: number; monthly_fee: number; transaction_fee_percentage: number };
  withdrawal:   { fee_fixed: number; fee_percentage: number; min_amount: number; max_amount: number };
  stokvel:      { management_fee_percentage: number };
  loyalty:      { points_per_rand: number; redemption_rate: number };
}

export const PRICING_KEY = ["pricing"];

export function usePricing() {
  return useQuery({
    queryKey: PRICING_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/pricing");
      return data as PricingConfig;
    },
  });
}

export interface PlatformWalletBalance { currency: string; balance: string }

export function usePlatformWallet() {
  return useQuery({
    queryKey: ["platform-wallet"],
    queryFn: async () => {
      const { data } = await api.get("/admin/platform-wallet");
      return data as { balances: PlatformWalletBalance[] };
    },
  });
}

export function useUpdatePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, values }: { category: string; values: Record<string, number> }) => {
      const { data } = await api.patch("/admin/pricing", { category, values });
      return data as PricingConfig;
    },
    onSuccess: (data) => queryClient.setQueryData(PRICING_KEY, data),
  });
}
