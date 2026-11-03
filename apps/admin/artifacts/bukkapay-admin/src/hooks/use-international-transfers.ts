import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export interface InternationalTransferUser {
  id: string
  name: string
  username: string
  email: string
}

export interface InternationalTransfer {
  id: string
  senderId: string
  recipientId: string
  fromCurrency: string
  toCurrency: string
  sourceAmount: string
  exchangeRateApplied: string
  feeAmount: string
  destinationAmount: string
  purposeCategory: string | null
  purposeSubcategory: string | null
  destinationCountryCode: string | null
  destinationZone: string | null
  createdAt: string
  sender: InternationalTransferUser
  recipient: InternationalTransferUser
}

export interface InternationalTransfersPage {
  transfers: InternationalTransfer[]
  pagination: { page: number; limit: number; total: number; pages: number }
}

export function useInternationalTransfers(page = 1) {
  return useQuery({
    queryKey: ["international-transfers", page],
    queryFn: async () => {
      const { data } = await api.get(`/admin/international-transfers?page=${page}&limit=50`)
      return data as InternationalTransfersPage
    },
  })
}
