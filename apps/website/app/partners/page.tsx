import type { Metadata } from "next"
import { EnquiryForm } from "@/components/EnquiryForm"
import { Feature, Grid, PageHero, Section } from "@/components/site"

export const metadata: Metadata = {
  title: "Partnerships",
  description: "Partner with BukkaPay as a bank, payment provider, custodian or business.",
  alternates: { canonical: "/partners" },
}

export default function PartnersPage() {
  return (
    <>
      <PageHero eyebrow="Partnerships" title="Build Africa's payment network with us."
                intro="BukkaPay brings the wallet, routing, merchant network and technology. Licensed partners in each country bring custody, collections and settlement. Together we connect markets." />
      <Section title="Who we work with">
        <Grid cols={2}>
          <Feature title="Banks & e-money institutions">Act as BukkaPay's local custodian: safeguard customer funds under your licence, provide settlement accounts, and grow deposits and transaction volumes with a modern wallet front-end.</Feature>
          <Feature title="Payment service providers">Collections (EFT, cards, mobile money) and payouts through modular adapters — your rails become available to every BukkaPay customer and merchant in your market.</Feature>
          <Feature title="Cross-border networks & FX">Settlement rails and FX liquidity for approved corridors, including PAPSS participants and sponsoring banks.</Feature>
          <Feature title="Businesses & platforms">Accept BukkaPay at checkout, embed payment links in your platform, or distribute BukkaPay to your customers and agents.</Feature>
        </Grid>
      </Section>
      <div className="bg-surface">
        <Section title="What partners can expect" intro="A disciplined integration: clear allocation of regulated activities, a double-entry ledger, daily reconciliation against your records, maker-checker controls and full audit trails.">
          <Grid cols={3}>
            <Feature title="Sandbox first">Integrations start in a clearly labelled sandbox before any real money moves.</Feature>
            <Feature title="Reconciliation">Statement imports and daily ledger reconciliation with exceptions tracked to resolution.</Feature>
            <Feature title="Controlled launch">Countries and corridors switch on only after licences, agreements and readiness checks.</Feature>
          </Grid>
        </Section>
      </div>
      <Section title="Start a conversation">
        <EnquiryForm defaultKind="bank_partner" kinds={["bank_partner", "psp_partner", "custodian", "business"]} />
      </Section>
    </>
  )
}
