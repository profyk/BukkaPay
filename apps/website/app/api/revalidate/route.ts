import { revalidatePath, revalidateTag } from "next/cache"
import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { SITE_TAG } from "@/lib/content"

/** Called by the BukkaPay API after an admin saves website content.
 *  Secret = WEBSITE_REVALIDATE_SECRET (same value on the API and here). */
export async function POST(request: Request) {
  const secret = process.env.WEBSITE_REVALIDATE_SECRET
  const given = request.headers.get("x-revalidate-secret") ?? ""
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  revalidateTag(SITE_TAG)
  revalidatePath("/", "layout")
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() })
}
