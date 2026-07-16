import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export type WalletCurrency = "USD" | "ZAR" | "BWP" | "NGN" | "KES" | "GHS" | "EUR" | "GBP"

export interface Corridor {
  id: string
  fromCurrency: WalletCurrency
  toCurrency: WalletCurrency
  exchangeRate: string
  feePercentage: string
  feeFixed: string
  minAmount: string
  maxAmount: string
  isActive: boolean
  updatedAt: string
}

export const CORRIDORS_KEY = ["corridors"]

export function useCorridors() {
  return useQuery({
    queryKey: CORRIDORS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/corridors")
      return data.corridors as Corridor[]
    },
  })
}

export interface UpdateCorridorPayload {
  id: string
  exchangeRate?: string
  feePercentage?: string
  feeFixed?: string
  minAmount?: string
  maxAmount?: string
  isActive?: boolean
}

export function useUpdateCorridor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: UpdateCorridorPayload) => {
      const { data } = await api.patch(`/admin/corridors/${id}`, values)
      return data as Corridor
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Corridor[]>(CORRIDORS_KEY, (prev) =>
        prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev
      )
    },
  })
}
