import defaults from "./site-defaults.json"
import { API_URL } from "./site"

/** Website content edited by admins in the BukkaPay admin app.
 *  Shape mirrors backend/app/website/content.py (defaults generated from it). */
export type LinkItem = { label: string; href: string }
export type Site = {
  settings: {
    launchMode: "waitlist" | "live"
    announcement: { enabled: boolean; text: string; link: LinkItem | null; tone: "info" | "success" | "warning" }
    iosUrl: string | null; androidUrl: string | null
    supportEmail: string; salesEmail: string; pressEmail: string
    socials: LinkItem[]; seoTitle: string; seoDescription: string
  }
  home: {
    eyebrow: string; title: string; subtitle: string; benefits: string[]
    features: { tag: string; title: string; body: string }[]
    useCases: { audience: string; title: string; body: string }[]
  }
  pricing: {
    enabled: boolean; intro: string; footnote: string
    plans: { name: string; price: string; period: string; description: string; features: string[]; cta: LinkItem | null; highlighted: boolean }[]
  }
  faq: { items: { question: string; answer: string }[] }
  versions: Record<string, number>
}

export const SITE_TAG = "site"

/** Cached for 5 minutes and refreshed instantly when an admin saves (the API
 *  calls /api/revalidate). If the API is down the honest defaults are used,
 *  so the site never breaks or shows stale promises. */
export async function getSite(): Promise<Site> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/site`, { next: { revalidate: 300, tags: [SITE_TAG] } })
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as Site
  } catch {
    return defaults as Site
  }
}
