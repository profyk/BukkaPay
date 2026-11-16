import type { Metadata } from "next"
import { PageHero, Section } from "@/components/site"

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/legal/terms" } }

const SECTIONS: [string, string][] = [
  [
    "Who we are",
    "BukkaPay provides payment technology services. Regulated activities such as holding customer funds are performed by licensed partner institutions in each country, under their own licences and agreements with BukkaPay."
  ],
  [
    "Your account",
    "You must provide accurate information, keep your PIN and login details secret, and complete identity verification when asked. We may limit or suspend accounts to protect you, others or the network, or where the law requires."
  ],
  [
    "Payments",
    "You authorise each payment by confirming it in the app. Cross-border payments execute at the quoted rate and fee shown before confirmation; quotes expire. Payments made in error are your responsibility, but contact us immediately and we'll help where we can."
  ],
  [
    "Fees and limits",
    "Fees and limits are shown in the app and may differ by country, currency, verification level and service. Changes don't affect payments already made."
  ],
  [
    "Availability",
    "Services are offered only in countries and corridors where they have been launched. Availability can change."
  ],
  [
    "Disputes and complaints",
    "Report problems in the app or via our Contact page. We'll investigate and respond within the timeframes required by local regulation."
  ],
  [
    "Changes",
    "We'll notify you of material changes to these terms in advance."
  ]
]

export default function LegalPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={"Terms of service"} intro="This summary describes how BukkaPay works today. It will be replaced by the full, country-specific legal text approved by counsel before each launch." />
      <Section>
        <div className="prose-legal max-w-3xl">
          {SECTIONS.map(([h, p]) => (<div key={h}><h2>{h}</h2><p>{p}</p></div>))}
        </div>
      </Section>
    </>
  )
}
