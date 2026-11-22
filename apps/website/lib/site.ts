export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bukkapay.com").replace(/\/$/, "")
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.bukkapay.com").replace(/\/$/, "")
export const MERCHANT_URL = process.env.NEXT_PUBLIC_MERCHANT_URL ?? "https://merchant.bukkapay.com"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bukkapay.com"

export const NAV = [
  { href: "/wallet", label: "Wallet" },
  { href: "/merchants", label: "Business" },
  { href: "/trade", label: "Trade" },
  { href: "/travel", label: "Flights" },
  { href: "/cross-border", label: "Send abroad" },
  { href: "/countries", label: "Countries" },
  { href: "/security", label: "Security" },
]

export const PAGES = [
  "", "/about", "/how-it-works", "/wallet", "/merchants", "/trade", "/travel", "/cross-border", "/payment-links", "/contributions",
  "/countries", "/pricing", "/partners", "/security", "/faq", "/contact",
  "/legal",
]

export type PublicCountry = { code: string; name: string; region: string; status: "planned" | "pilot" | "live" | "suspended"; currency: string }

/** Country availability straight from the admin-controlled configuration.
 *  Revalidated hourly; if the API is unreachable we show nothing rather than
 *  guessing at availability. */
export async function getCountries(): Promise<PublicCountry[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/countries`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return (await res.json()) as PublicCountry[]
  } catch {
    return null
  }
}
