import type { Metadata } from "next"
import Link from "next/link"
import { PageHero, Section } from "@/components/site"
import { formatDate, getLegalList, REVIEW_LABEL } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Legal",
  description: "BukkaPay's terms, privacy policy and other legal documents.",
  alternates: { canonical: "/legal" },
}

const AUDIENCE: Record<string, string> = {
  everyone: "Everyone", customers: "Customers", merchants: "Businesses", cardholders: "Cardholders",
}

export default async function LegalIndex() {
  const docs = await getLegalList()
  return (
    <>
      <PageHero eyebrow="Legal" title="Legal centre"
        intro="The terms you agree to when you use BukkaPay, how we handle your information, and the policies that keep the network safe." />
      <Section>
        {docs === null ? (
          <p className="text-ink-soft">Our legal documents are temporarily unavailable. Please try again shortly, or email us for a copy.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {docs.map((d) => (
              <li key={d.slug}>
                <Link href={`/legal/${d.slug}`} className="block h-full rounded-2xl border border-line p-6 hover:border-brand-600">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{AUDIENCE[d.audience] ?? d.audience}</p>
                  <h2 className="mt-1 text-lg font-semibold">{d.title}</h2>
                  {d.summary && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d.summary}</p>}
                  <p className="mt-3 text-xs text-ink-muted">
                    {d.effectiveDate ? `Effective ${formatDate(d.effectiveDate)}` : REVIEW_LABEL[d.reviewStatus]}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
