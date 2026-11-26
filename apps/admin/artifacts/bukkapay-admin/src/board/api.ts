import axios from "axios"

/** Board portal API client. The session token lives in sessionStorage only:
 *  closing the browser signs the board member out. */
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

export type Update = { id: string; title: string; period?: string; body: string; publishedAt?: string }
