import type { Metadata } from "next"
import { ButtonLink, PageHero, Section } from "@/components/site"
import { getSite } from "@/lib/content"

export const metadata: Metadata = {
  title: "Pricing",
  description: "BukkaPay pricing. Every fee and exchange rate is shown before you confirm a payment.",
  alternates: { canonical: "/pricing" },
}

export default async function PricingPage() {
  const { pricing, settings } = await getSite()
  return (
    <>
      <PageHero eyebrow="Pricing" title="Simple, upfront pricing" intro={pricing.intro} />
      <Section>
        {!pricing.enabled || pricing.plans.length === 0 ? (
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <p className="font-semibold text-brand-900">Plans are announced at launch</p>
            <p className="mt-2 text-sm text-ink-soft">
              Whatever you use, the exact fee is shown before you confirm — never after. For business volumes, email{" "}
              <a className="underline" href={`mailto:${settings.salesEmail}`}>{settings.salesEmail}</a>.
            </p>
          </div>
        ) : (
          <div className={`grid gap-5 ${pricing.plans.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {pricing.plans.map((p) => (
              <div key={p.name} className={`flex flex-col rounded-2xl border p-6 ${p.highlighted ? "border-brand-600 shadow-xl shadow-brand-200/50" : "border-line"}`}>
                {p.highlighted && <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-600">Most popular</p>}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-3"><span className="font-display text-4xl font-semibold">{p.price}</span>{p.period && <span className="text-ink-muted"> {p.period}</span>}</p>
                {p.description && <p className="mt-2 text-sm text-ink-soft">{p.description}</p>}
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>{f}</li>)}
                </ul>
                {p.cta && <div className="mt-6"><ButtonLink href={p.cta.href} variant={p.highlighted ? "primary" : "secondary"}>{p.cta.label}</ButtonLink></div>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-6 text-sm text-ink-muted">{pricing.footnote}</p>
      </Section>
    </>
  )
}
