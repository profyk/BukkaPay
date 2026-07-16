import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"

export interface TravelOperator {
  id: string
  name: string
  mode: "bus" | "flight"
  logoUrl: string | null
  isActive: boolean
  createdAt: string
}

export interface TravelRoute {
  id: string
  operatorId: string
  mode: "bus" | "flight"
  originCode: string
  originCity: string
  originCountryCode: string
  destinationCode: string
  destinationCity: string
  destinationCountryCode: string
  flightNumber: string | null
  isActive: boolean
  operator: TravelOperator | null
}

export interface TravelDeparture {
  id: string
  routeId: string
  departureAt: string
  arrivalAt: string
  price: string
  businessPrice: string | null
  currency: string
  totalSeats: number
  seatsBooked: number
  isActive: boolean
}

export const OPERATORS_KEY = ["travel-operators"]
export const ROUTES_KEY = ["travel-routes"]

export function useTravelOperators() {
  return useQuery({
    queryKey: OPERATORS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/admin/travel/operators")
      return data as TravelOperator[]
    },
  })
}

export function useCreateOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; mode: string; logoUrl?: string }) => {
      const { data } = await api.post("/admin/travel/operators", payload)
      return data as TravelOperator
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPERATORS_KEY }),
  })
}

export function useUpdateOperator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; logoUrl?: string; isActive?: boolean }) => {
      const { data } = await api.patch(`/admin/travel/operators/${id}`, values)
      return data as TravelOperator
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: OPERATORS_KEY }),
  })
}

export function useTravelRoutes(operatorId?: string) {
  return useQuery({
    queryKey: [...ROUTES_KEY, operatorId],
    queryFn: async () => {
      const { data } = await api.get("/admin/travel/routes", { params: operatorId ? { operatorId } : {} })
      return data as TravelRoute[]
    },
  })
}

export function useCreateRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ operatorId, ...payload }: {
      operatorId: string; originCode: string; originCity: string; originCountryCode: string
      destinationCode: string; destinationCity: string; destinationCountryCode: string; flightNumber?: string
    }) => {
      const { data } = await api.post(`/admin/travel/operators/${operatorId}/routes`, payload)
      return data as TravelRoute
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROUTES_KEY }),
  })
}

export function useUpdateRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; isActive?: boolean }) => {
      const { data } = await api.patch(`/admin/travel/routes/${id}`, values)
      return data as TravelRoute
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROUTES_KEY }),
  })
}

export function useDepartures(routeId: string | undefined) {
  return useQuery({
    queryKey: ["travel-departures", routeId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/travel/routes/${routeId}/departures`)
      return data as TravelDeparture[]
    },
    enabled: !!routeId,
  })
}

export function useCreateDeparture(routeId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      departureAt: string; arrivalAt: string; price: string; businessPrice?: string
      currency: string; totalSeats: number
    }) => {
      const { data } = await api.post(`/admin/travel/routes/${routeId}/departures`, payload)
      return data as TravelDeparture
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["travel-departures", routeId] }),
  })
}

export function useUpdateDeparture(routeId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; price?: string; businessPrice?: string; totalSeats?: number; isActive?: boolean }) => {
      const { data } = await api.patch(`/admin/travel/departures/${id}`, values)
      return data as TravelDeparture
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["travel-departures", routeId] }),
  })
}
