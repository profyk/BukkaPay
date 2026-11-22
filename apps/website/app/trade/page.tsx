import type { Metadata } from "next"
import { Badge, ButtonLink, CtaBand, Feature, Grid, PageHero, Section } from "@/components/site"
import { MERCHANT_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: "Cross-border trade",
  description: "Pay suppliers across African borders without cash — instant or protected by escrow, with tamper-evident trade receipts for customs.",
  alternates: { canonical: "/trade" },
}

const STEPS = [
  ["Invoice", "The supplier sends an itemised invoice — products, quantities, HS codes, currency — by WhatsApp link or QR."],
  ["Choose how to pay", "Instant Pay settles straight away. Protected Escrow Pay holds the money on BukkaPay's ledger until you have the goods."],
  ["Collect or receive", "Confirm in the app when you've got your stock, or delivery is verified at the border or the shop."],
  ["Release & receipt", "The supplier is paid instantly in their own currency, and both sides get a tamper-evident trade receipt."],
]

export default function TradePage() {
  return (
    <>
      <PageHero eyebrow="AfCFTA cross-border trade · coming soon"
        title="Buy across borders without carrying cash."
        intro="BukkaPay lets traders and wholesalers in South Africa, Botswana and beyond pay each other in ZAR, BWP or USD — instantly, or protected by escrow until the goods arrive.">
        <ButtonLink href="/#waitlist" variant="light">Get early access</ButtonLink>
        <ButtonLink href={MERCHANT_URL} variant="ghost-dark">I&apos;m a supplier</ButtonLink>
      </PageHero>

      <Section eyebrow="How it works" title="Four steps from invoice to border post">
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="rounded-3xl border border-line bg-white p-7 shadow-card">
              <span className="font-display text-3xl font-bold text-brand-200">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      <section className="bg-surface">
        <Section eyebrow="Protected Escrow Pay" title="Your money is held for you — not by the seller"
          intro="Escrow funds sit in a ring-fenced, safeguarded ledger account. The seller can see the money is there; only your confirmation, a verified delivery or a resolved dispute moves it.">
          <Grid cols={3}>
            <Feature title="Fair to both sides" badge={<Badge>Coming soon</Badge>}>Buyers know they get their goods; suppliers know the money is real and already committed.</Feature>
            <Feature title="Disputes, handled" badge={<Badge>Coming soon</Badge>}>If something goes wrong, BukkaPay&apos;s trade desk reviews the evidence and releases or refunds the money.</Feature>
            <Feature title="Small, clear fee" badge={<Badge>Coming soon</Badge>}>A small escrow fee, shown before you pay, is the only cost of protection. Instant Pay has no escrow fee.</Feature>
          </Grid>
        </Section>
      </section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold leading-tight sm:text-5xl">A receipt the border post can trust.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              Every supplier payment produces an official BukkaPay Trade &amp; Payment Receipt: buyer and seller names as
              verified by KYC, the invoice reference and items, the exchange rate used, and a ledger reference.
            </p>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Each receipt is cryptographically chained to the one before it, so it can&apos;t be edited or faked — useful
              at customs, and as a track record for SME credit.
            </p>
          </div>
          <div aria-hidden className="rounded-4xl border border-line bg-white p-7 shadow-glow">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-bold">Trade &amp; Payment Receipt</p>
              <p className="font-mono text-xs text-ink-muted">BKR-2026-000142</p>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[["Buyer", "N. Dlamini (ZA, verified)"], ["Seller", "Gabs Wholesale (BW, verified)"], ["Invoice", "TINV-8F21C9"], ["Amount", "P 2 300.00"], ["Paid from", "R 3 128.00 · 1 ZAR = 0.7353 BWP"], ["Method", "Protected Escrow Pay"]].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-ink-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-5 break-all rounded-2xl bg-surface p-3 font-mono text-[11px] text-ink-muted">sha256 9c1f…e07a · chained to 41b2…77d0</p>
            <p className="mt-3 text-[11px] text-ink-muted">Illustration.</p>
          </div>
        </div>
      </Section>

      <section className="bg-surface">
        <Section eyebrow="For wholesalers & suppliers" title="Sell to buyers in neighbouring countries">
          <Grid cols={3}>
            <Feature title="Itemised trade invoices">Products, quantities, units and HS codes, in ZAR, BWP or USD — shared by WhatsApp link or QR.</Feature>
            <Feature title="Settled in your currency">Buyers pay in theirs; you&apos;re settled in yours, at the rate shown to both of you upfront.</Feature>
            <Feature title="Instant or escrow">Let each buyer choose, or require escrow for new customers and large orders.</Feature>
          </Grid>
        </Section>
      </section>
      <CtaBand />
    </>
  )
}
