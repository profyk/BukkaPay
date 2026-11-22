import type { Metadata } from "next"
import { ButtonLink, CtaBand, Feature, Grid, PageHero, Section } from "@/components/site"
import { APP_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: "Flights",
  description: "Search fares across airlines and pay from your BukkaPay wallet in ZAR, BWP or USD.",
  alternates: { canonical: "/travel" },
}

export default function TravelPage() {
  return (
    <>
      <PageHero eyebrow="Flights"
        title="Fly across Africa on your wallet."
        intro="Search fares from BukkaPay's airline partners, add passengers exactly as on their passport, and pay from your ZAR, BWP or USD wallet with your PIN.">
        <ButtonLink href={APP_URL} variant="light">Search flights</ButtonLink>
      </PageHero>

      <Section eyebrow="Why book with BukkaPay" title="No card needed. No surprises.">
        <Grid cols={3}>
          <Feature title="Fares from many airlines">One search compares fares across connected airlines, sorted by price, with stops and travel time shown clearly.</Feature>
          <Feature title="Pay in your currency">Pay from a wallet in the fare&apos;s currency — ZAR, BWP or USD — confirmed with your transaction PIN.</Feature>
          <Feature title="Seats held as you pay">Your seats are locked while you pay, so the fare you choose is the fare you get.</Feature>
          <Feature title="Passport checks upfront">We check names, dates of birth and passport expiry before you pay, so problems surface before the airport, not at it.</Feature>
          <Feature title="Instant booking reference">Your booking reference and e-ticket arrive in the app the moment the airline confirms.</Feature>
          <Feature title="Clear cancellations">Refundable fares say so before you book; cancelling refunds what the airline refunds, straight to your wallet.</Feature>
        </Grid>
      </Section>
      <CtaBand />
    </>
  )
}
