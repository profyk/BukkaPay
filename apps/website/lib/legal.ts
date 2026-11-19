import { API_URL } from "./site"
import { SITE_TAG } from "./content"

/** Legal documents edited and published in the BukkaPay admin app.
 *  Shape mirrors backend/app/legal/service.py (public_list / public_get). */
export type ReviewStatus = "template" | "in_review" | "approved"
export type LegalSummary = {
  slug: string; title: string; summary: string; audience: string
  version: number; effectiveDate: string | null; reviewStatus: ReviewStatus; reviewedBy: string | null
}
export type LegalDoc = LegalSummary & {
  body: string
  isLatest: boolean
  history: { version: number; effectiveDate: string; reviewStatus: ReviewStatus; changeNote: string | null }[]
  company: { legalName: string | null; tradingName: string }
}

/** Same cache rules as the rest of the site: 5 minutes, refreshed instantly
 *  when an admin publishes (the API calls /api/revalidate). */
const CACHE = { next: { revalidate: 300, tags: [SITE_TAG] } }

export async function getLegalList(): Promise<LegalSummary[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/legal`, CACHE)
    if (!res.ok) return null
    return (await res.json()) as LegalSummary[]
  } catch {
    return null
  }
}

/** null = not found; "unavailable" = API unreachable (never guess at legal text). */
export async function getLegalDoc(slug: string, version?: number): Promise<LegalDoc | null | "unavailable"> {
  const q = version !== undefined ? `?version=${version}` : ""
  try {
    const res = await fetch(`${API_URL}/api/v1/public/legal/${encodeURIComponent(slug)}${q}`, CACHE)
    if (res.status === 404) return null
    if (!res.ok) return "unavailable"
    return (await res.json()) as LegalDoc
  } catch {
    return "unavailable"
  }
}

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  template: "Draft — awaiting legal review",
  in_review: "Under legal review",
  approved: "Reviewed by counsel",
}

export function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}
