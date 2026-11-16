export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.bukkapay.com").replace(/\/$/, "")
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.bukkapay.com").replace(/\/$/, "")
export const MERCHANT_URL = process.env.NEXT_PUBLIC_MERCHANT_URL ?? "https://merchant.bukkapay.com"
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bukkapay.com"

export const NAV = [
  { href: "/wallet", label: "Wallet" },
  { href: "/merchants", label: "Business" },
  { href: "/cross-border", label: "Cross-border" },
  { href: "/countries", label: "Countries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/partners", label: "Partners" },
  { href: "/security", label: "Security" },
]

export const PAGES = [
  "", "/about", "/how-it-works", "/wallet", "/merchants", "/cross-border", "/payment-links", "/contributions",
  "/countries", "/pricing", "/partners", "/security", "/faq", "/contact",
  "/legal/terms", "/legal/privacy-policy", "/legal/cookies", "/legal/aml-risk",
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
