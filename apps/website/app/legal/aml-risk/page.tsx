import type { Metadata } from "next"
import { PageHero, Section } from "@/components/site"

export const metadata: Metadata = { title: "AML & risk statement", alternates: { canonical: "/legal/aml-risk" } }

const SECTIONS: [string, string][] = [
  [
    "Our approach",
    "BukkaPay and its licensed partners maintain controls to prevent money laundering, terrorist financing and fraud, in line with the laws of each country we operate in."
  ],
  [
    "Customer due diligence",
    "Customers and merchants are verified before using higher-risk services; limits depend on verification level and country."
  ],
  [
    "Monitoring",
    "Transactions are monitored for unusual activity; alerts are reviewed by our compliance team, who may request information, restrict accounts or report to authorities as required."
  ],
  [
    "Screening",
    "Sanctions and politically-exposed-person screening is performed through approved screening services as they are connected in each market."
  ],
  [
    "Reporting concerns",
    "compliance@bukkapay.com"
  ]
]

export default function LegalPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title={"AML & risk statement"} intro="This summary describes how BukkaPay works today. It will be replaced by the full, country-specific legal text approved by counsel before each launch." />
      <Section>
        <div className="prose-legal max-w-3xl">
          {SECTIONS.map(([h, p]) => (<div key={h}><h2>{h}</h2><p>{p}</p></div>))}
        </div>
      </Section>
    </>
  )
}
