import type { Metadata } from "next"
import Link from "next/link"
import { PageHero, Section } from "@/components/site"
import { getCountries, type PublicCountry } from "@/lib/site"

export const metadata: Metadata = {
  title: "Countries & currencies",
  description: "Where BukkaPay is live, piloting and planned — straight from our launch configuration.",
  alternates: { canonical: "/countries" },
}
export const revalidate = 3600

const LABEL: Record<string, { title: string; note: string; tone: string }> = {
  live: { title: "Live", note: "Fully available.", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pilot: { title: "Pilot", note: "Available to a limited group while we complete launch.", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  planned: { title: "Planned", note: "An expansion target — not available yet, and no date is promised.", tone: "bg-gray-50 text-gray-700 border-gray-200" },
}

export default async function CountriesPage() {
  const countries = await getCountries()
  const by = (s: string) => (countries ?? []).filter((c) => c.status === s && c.region === "Africa")
  const others = (countries ?? []).filter((c) => c.region !== "Africa" && c.status !== "planned")

  return (
    <>
      <PageHero eyebrow="Availability" title="Countries & currencies"
                intro="This page is generated from the same configuration our operations team uses to switch countries on — so it never claims we're somewhere we're not. A country goes live only after a licensed local custodian, payment partners and compliance sign-off are in place." />
      <Section>
        {!countries ? (
          <p className="rounded-xl border border-line p-6 text-ink-muted">Availability information is temporarily unavailable. Please check back shortly.</p>
        ) : (
          <div className="space-y-12">
            {(["live", "pilot", "planned"] as const).map((status) => {
              const rows = by(status)
              return (
                <div key={status}>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-semibold">{LABEL[status].title}</h2>
                    <span className="text-sm text-ink-muted">{LABEL[status].note}</span>
                  </div>
                  {rows.length ? (
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {rows.map((c: PublicCountry) => (
                        <li key={c.code} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${LABEL[status].tone}`}>
                          <span className="font-medium">{c.name}</span><span className="font-mono text-xs">{c.currency}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-3 text-sm text-ink-muted">None at the moment.</p>}
                </div>
              )
            })}
            {others.length > 0 && (
              <div>
                <h2 className="text-2xl font-semibold">Outside Africa</h2>
                <ul className="mt-4 grid gap-2 sm:grid-cols-3">{others.map((c) => <li key={c.code} className="rounded-xl border border-line px-4 py-3 text-sm">{c.name} · {c.currency}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p className="mt-12 text-sm text-ink-muted">
          Want BukkaPay in your country? <Link className="underline" href="/partners">Partner with us</Link> or <Link className="underline" href="/contact">get in touch</Link>.
        </p>
      </Section>
    </>
  )
}
