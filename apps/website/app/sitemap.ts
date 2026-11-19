import type { MetadataRoute } from "next"
import { getLegalList } from "@/lib/legal"
import { PAGES, SITE_URL } from "@/lib/site"

const STANDARD_LEGAL = ["terms", "privacy-policy", "cookies", "aml-risk", "data-breach"]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const legal = (await getLegalList())?.map((d) => d.slug) ?? STANDARD_LEGAL
  const pages = PAGES.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: (p === "/countries" ? "daily" : "monthly") as "daily" | "monthly",
    priority: p === "" ? 1 : p.startsWith("/legal") ? 0.3 : 0.7,
  }))
  return [...pages, ...legal.map((slug) => ({
    url: `${SITE_URL}/legal/${slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.3,
  }))]
}
