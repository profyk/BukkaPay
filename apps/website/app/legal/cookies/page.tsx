import type { Metadata } from "next"
import { PageHero, Section } from "@/components/site"

export const metadata: Metadata = { title: "Cookie policy", alternates: { canonical: "/legal/cookies" } }

const SECTIONS: [string, string][] = [
  [
    "What we use",
    "This website uses only the cookies and local storage needed to run it and remember your preferences. We don't use advertising cookies."
  ],
  [
    "Managing cookies",
    "You can block or delete cookies in your browser settings; some features may stop working."
  ]
]

export default function LegalPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={"Cookie policy"} intro="This summary describes how BukkaPay works today. It will be replaced by the full, country-specific legal text approved by counsel before each launch." />
      <Section>
        <div className="prose-legal max-w-3xl">
          {SECTIONS.map(([h, p]) => (<div key={h}><h2>{h}</h2><p>{p}</p></div>))}
        </div>
      </Section>
    </>
  )
}
