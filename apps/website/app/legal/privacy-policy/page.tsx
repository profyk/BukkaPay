import type { Metadata } from "next"
import { PageHero, Section } from "@/components/site"

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/legal/privacy-policy" } }

const SECTIONS: [string, string][] = [
  [
    "What we collect",
    "Identity and contact details, verification documents, device and session information, and transaction records — what we need to provide the service, prevent fraud and meet legal obligations."
  ],
  [
    "Why we use it",
    "To operate your wallet and payments, verify identity, comply with anti-money-laundering and other laws, keep the service secure, and support you."
  ],
  [
    "Who we share it with",
    "Licensed partner institutions and payment providers that process your payments, identity verification and screening providers, and authorities where the law requires. We don't sell your personal information."
  ],
  [
    "Your rights",
    "You can request access to or correction of your information and, where the law allows, deletion. Some records must be kept for regulatory periods."
  ],
  [
    "Security and storage",
    "Data is encrypted in transit; sensitive data is encrypted at rest; identity documents are kept in private storage with restricted access."
  ],
  [
    "Contact",
    "privacy@bukkapay.com"
  ]
]

export default function LegalPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={"Privacy policy"} intro="This summary describes how BukkaPay works today. It will be replaced by the full, country-specific legal text approved by counsel before each launch." />
      <Section>
        <div className="prose-legal max-w-3xl">
          {SECTIONS.map(([h, p]) => (<div key={h}><h2>{h}</h2><p>{p}</p></div>))}
        </div>
      </Section>
    </>
  )
}
