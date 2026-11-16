import type { Metadata } from "next"
import Link from "next/link"
import { PageHero, Section } from "@/components/site"
import { getSite } from "@/lib/content"

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about BukkaPay wallets, cards, fees, availability, business payments and safety.",
  alternates: { canonical: "/faq" },
}

export default async function FaqPage() {
  const { faq } = await getSite()
  const jsonLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.items.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  }
  return (
    <>
      <PageHero eyebrow="Help" title="Frequently asked questions" intro="Can't find what you need? Contact us and we'll help." />
      <Section>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {faq.items.map((f) => (
            <details key={f.question} className="group p-6">
              <summary className="cursor-pointer list-none font-semibold flex justify-between gap-4">{f.question}<span aria-hidden className="text-brand-600 group-open:rotate-45 transition">+</span></summary>
              <p className="mt-3 text-ink-soft">{f.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">Still stuck? <Link href="/contact" className="underline">Contact us</Link>.</p>
      </Section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  )
}
