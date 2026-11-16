import type { MetadataRoute } from "next"
import { PAGES, SITE_URL } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === "/countries" ? "daily" : "monthly",
    priority: p === "" ? 1 : p.startsWith("/legal") ? 0.3 : 0.7,
  }))
}
