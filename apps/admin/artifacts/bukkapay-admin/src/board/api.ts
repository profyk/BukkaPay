import axios from "axios"
import { useQuery } from "@tanstack/react-query"

/** Boardroom API client. The session token lives in sessionStorage only:
 *  closing the browser signs the member out. It travels in the
 *  Authorization header (never a cookie). */
const KEY = "bukkapay_board_token"

export const getToken = () => sessionStorage.getItem(KEY)
export const setToken = (t: string | null) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY))

export const boardApi = axios.create({ baseURL: "/api/board" })

boardApi.interceptors.request.use((config) => {
  const t = getToken()
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

boardApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401 && getToken()) {
      setToken(null)
      window.location.assign("/login")
    }
    return Promise.reject(error)
  },
)

export function errorText(e: any): string {
  return e?.response?.data?.error || e?.response?.data?.detail?.[0]?.msg || e?.message || "Something went wrong"
}

export type Me = {
  name: string; email: string; organisation?: string; title?: string; isOwner: boolean
  role: string; roleLabel: string; permissions: string[]; mfaReady: boolean; mfaSetupRequired: boolean
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: async () => (await boardApi.get<Me>("/auth/me")).data, staleTime: 30_000 })
}

export const can = (me: Me | undefined, p: string) => !!me?.permissions.includes(p)

/** GET helper bound to the query cache. */
export function useBoard<T = any>(path: string, params?: Record<string, any>, enabled = true) {
  return useQuery({
    queryKey: [path, params],
    queryFn: async () => (await boardApi.get<T>(path, { params })).data,
    enabled,
  })
}

export async function download(path: string, filename: string) {
  const r = await fetch(`/api/board${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!r.ok) throw new Error("Download failed")
  const url = URL.createObjectURL(await r.blob())
  const a = Object.assign(document.createElement("a"), { href: url, download: filename })
  a.click(); URL.revokeObjectURL(url)
}

export type Series = {
  month: string; signups: number; users: number; mau: number; transactions: number; tpv: number | null
  revenue: number | null; directCosts: number | null; grossProfit: number | null; operatingCosts: number | null
  otherIncome: number | null; netProfit: number | null; cash: number | null; fundingRaised: number | null
  headcount: number | null; costBreakdown: Record<string, number | null> | null; newMerchants: number; activeMerchants: number
}

export type Overview = {
  reportingCurrency: string; fxAt: string | null; unconverted: string[]; generatedAt: string
  kpis: Record<string, number | null>
  series: Series[]
  revenueStreams: { stream: string; amount: number }[]
  markets: { country: string; users: number }[]
  cohorts: { cohort: string; size: number; retention: (number | null)[] }[]
}

export type Update = { id: string; title: string; period?: string; body: string; publishedAt?: string; category?: string }
