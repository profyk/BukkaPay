import Link from "next/link"
import { AppButtons, ButtonLink, CtaBand, Feature, Grid, Section } from "@/components/site"
import { WaitlistForm } from "@/components/WaitlistForm"
import { getSite } from "@/lib/content"
import { MERCHANT_URL, getCountries } from "@/lib/site"

export default async function Home() {
  const [site, countries] = await Promise.all([getSite(), getCountries()])
  const { settings, home } = site
  const waitlist = settings.launchMode === "waitlist"
  const live = countries?.filter((c) => c.status === "live") ?? []
  const pilot = countries?.filter((c) => c.status === "pilot") ?? []

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{home.eyebrow}</p>
            <h1 className="mt-4 text-5xl sm:text-6xl font-semibold leading-[1.05]">{home.title}</h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">{home.subtitle}</p>
            {home.benefits.length > 0 && (
              <ul className="mt-6 space-y-2 text-sm text-ink-soft">
                {home.benefits.map((b) => (
                  <li key={b} className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>{b}</li>
                ))}
              </ul>
            )}
            <div id="waitlist" className="mt-8 scroll-mt-24">
              {waitlist ? <WaitlistForm source="home-hero" /> : (
                <div className="flex flex-wrap gap-3">
                  <ButtonLink href="#get-the-app">Get the app</ButtonLink>
                  <ButtonLink href={MERCHANT_URL} variant="secondary">Accept payments</ButtonLink>
                </div>
              )}
            </div>
            {countries && (live.length > 0 || pilot.length > 0) && (
              <p className="mt-6 text-sm text-ink-muted">
                {live.length ? `Live in ${live.map((c) => c.name).join(", ")}. ` : ""}
                {pilot.length ? `Piloting in ${pilot.map((c) => c.name).join(", ")}. ` : ""}
                <Link href="/countries" className="underline">See all countries</Link>
              </p>
            )}
          </div>
          <div aria-hidden className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[2rem] border border-line bg-white p-6 shadow-2xl shadow-brand-200/50">
              <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white">
                <div className="flex justify-between text-xs"><span>BukkaPay</span><span className="font-semibold tracking-wider">VISA</span></div>
                <p className="mt-8 font-mono tracking-widest">•••• •••• •••• ••••</p>
                <p className="mt-2 text-xs text-white/70">Virtual card · online & tap to pay</p>
              </div>
              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                <p className="font-semibold text-emerald-800">Payment received</p>
                <p className="text-emerald-700">Payment link INV-0042 · marked paid when the money arrived</p>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px] font-medium">
                {["Send", "Request", "Scan", "Link"].map((a) => <div key={a} className="rounded-xl bg-brand-50 py-3 text-brand-700">{a}</div>)}
              </div>
              <p className="mt-3 text-[11px] text-ink-muted">Illustration. Card availability depends on your country and verification.</p>
            </div>
          </div>
        </div>
      </section>

      <Section eyebrow="Everything you need" title="One app to get paid and to pay"
               intro="Built for how people and businesses across Africa actually move money.">
        <Grid cols={3}>
          {home.features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line p-6">
              {f.tag && <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{f.tag}</p>}
              <h3 className="mt-1 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
            </div>
          ))}
        </Grid>
      </Section>

      {home.useCases.length > 0 && (
        <section className="bg-surface">
          <Section eyebrow="Built for you" title="One platform, every way you earn">
            <Grid cols={home.useCases.length >= 4 ? 4 : 3}>
              {home.useCases.map((u) => (
                <div key={u.title} className="rounded-2xl border border-line bg-white p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{u.audience}</p>
                  <h3 className="mt-1 text-lg font-semibold">{u.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{u.body}</p>
                </div>
              ))}
            </Grid>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/merchants">Business solutions</ButtonLink>
              <ButtonLink href={MERCHANT_URL} variant="secondary">Register a business</ButtonLink>
            </div>
          </Section>
        </section>
      )}

      <Section eyebrow="How the network works" title="Technology by BukkaPay. Funds held by licensed local institutions."
               intro="In each country, an approved local financial institution safeguards customer funds and settles payments. BukkaPay runs the wallet, routing, merchant network and reporting on top.">
        <Grid cols={3}>
          <Feature title="Local custodians">Every currency balance is backed by an arrangement with a licensed institution in that country.</Feature>
          <Feature title="Approved corridors only">Cross-border payments run only on routes that have been approved, with settlement confirmed before the recipient is credited.</Feature>
          <Feature title="One ledger">Every movement of money is recorded twice in an immutable double-entry ledger and reconciled daily.</Feature>
        </Grid>
      </Section>

      <section id="get-the-app" className="bg-surface scroll-mt-24">
        {waitlist ? (
          <Section eyebrow="Early access" title="Be first when BukkaPay opens in your country"
                   intro="Join the waitlist and we'll email you when you can sign up.">
            <WaitlistForm source="home-bottom" />
          </Section>
        ) : (
          <Section eyebrow="Get started" title="Download BukkaPay" intro="Register with your phone or email, verify your identity, and start paying.">
            <AppButtons settings={settings} />
          </Section>
        )}
      </section>
      <CtaBand />
    </>
  )
}
