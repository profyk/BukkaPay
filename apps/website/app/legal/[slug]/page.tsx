import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Section } from "@/components/site"
import { headings, LegalMarkdown } from "@/components/LegalMarkdown"
import { formatDate, getLegalDoc, REVIEW_LABEL } from "@/lib/legal"

type Props = { params: { slug: string }; searchParams: { version?: string } }

function versionParam(v?: string): number | undefined {
  const n = v ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const doc = await getLegalDoc(params.slug, versionParam(searchParams.version))
  if (!doc || doc === "unavailable") return { title: "Legal" }
  return {
    title: doc.title,
    description: doc.summary || undefined,
    alternates: { canonical: `/legal/${doc.slug}` },
    // Archived versions stay reachable but out of search results.
    robots: doc.isLatest ? undefined : { index: false },
  }
}

export default async function LegalDocument({ params, searchParams }: Props) {
  const version = versionParam(searchParams.version)
  const doc = await getLegalDoc(params.slug, version)
  if (doc === null) notFound()
  if (doc === "unavailable") {
    return (
      <Section title="Temporarily unavailable">
        <p className="text-ink-soft">This document can't be loaded right now. Please try again shortly.</p>
      </Section>
    )
  }
  const toc = headings(doc.body)
  const draft = doc.reviewStatus !== "approved"
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            <Link href="/legal" className="hover:underline">Legal</Link>
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">{doc.title}</h1>
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
            {doc.effectiveDate && <div><dt className="inline">Effective </dt><dd className="inline font-medium text-ink">{formatDate(doc.effectiveDate)}</dd></div>}
            {doc.version > 0 && <div><dt className="inline">Version </dt><dd className="inline font-medium text-ink">{doc.version}</dd></div>}
            <div><dd className="inline">{REVIEW_LABEL[doc.reviewStatus]}</dd></div>
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-20">
        {!doc.isLatest && (
          <p role="note" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
            You're viewing an archived version.{" "}
            <Link href={`/legal/${doc.slug}`} className="font-semibold underline">See the current version</Link>.
          </p>
        )}
        {draft && doc.isLatest && (
          <p role="note" className="mb-6 rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
            {doc.reviewStatus === "template"
              ? "This document is a draft that is being reviewed by our legal advisers. It may change before BukkaPay launches in your country."
              : "This document is being reviewed by our legal advisers and may be updated."}
          </p>
        )}

        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
          {toc.length > 2 && (
            <nav aria-label="Contents" className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Contents</p>
                <ol className="mt-3 space-y-2 text-sm">
                  {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className="text-ink-soft hover:text-brand-700">{h.text}</a></li>)}
                </ol>
              </div>
            </nav>
          )}
          <article className="prose-legal max-w-3xl">
            <LegalMarkdown source={doc.body} />

            {doc.history.length > 1 && (
              <section className="mt-12 border-t border-line pt-6">
                <h2>Version history</h2>
                <ul>
                  {doc.history.map((h) => (
                    <li key={h.version}>
                      <Link href={h.version === doc.history[0].version ? `/legal/${doc.slug}` : `/legal/${doc.slug}?version=${h.version}`}>
                        Version {h.version}
                      </Link>{" "}
                      — effective {formatDate(h.effectiveDate)}{h.changeNote ? `: ${h.changeNote}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
      </div>
    </>
  )
}
