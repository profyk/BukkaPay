import Link from "next/link"
import { AppButtons, Badge, ButtonLink, CtaBand, Eyebrow, Grid, Section } from "@/components/site"
import { WaitlistForm } from "@/components/WaitlistForm"
import { getSite } from "@/lib/content"
import { MERCHANT_URL, getCountries } from "@/lib/site"

const STRIP = ["Free wallet-to-wallet transfers", "Scan to pay", "ZAR · BWP · USD", "Supplier escrow", "Border-ready receipts",
  "Flights", "Virtual Visa card", "Payment links", "Stokvels"]

const PILLARS = [
  { tag: "Everyday", title: "Replace cash, not habits", body: "Pay friends by @username or phone, pay the spaza shop or the taxi with one scan. Free between BukkaPay wallets.", href: "/wallet", live: true },
  { tag: "Trade", title: "Pay suppliers across borders", body: "Buy stock from Gaborone to Johannesburg without carrying cash — instant, or protected by escrow until goods arrive.", href: "/trade", live: false },
  { tag: "Travel", title: "Fly on your wallet", body: "Search fares across airlines and pay in ZAR, BWP or USD with your PIN. Booking reference in seconds.", href: "/travel", live: true },
  { tag: "Business", title: "Your phone is the till", body: "Static and amount-specific QR codes, payment links and invoices, with money in your balance the moment it's paid.", href: "/merchants", live: true },
]

const ESCROW = [
  { n: "01", t: "Supplier invoices you", b: "An itemised invoice in ZAR, BWP or USD — shared by WhatsApp link or QR." },
  { n: "02", t: "You pay into escrow", b: "Your money is held by BukkaPay on a regulated, ring-fenced ledger account — not by the seller." },
  { n: "03", t: "Goods collected or delivered", b: "Confirm in the app, or delivery is verified at the border or the shop." },
  { n: "04", t: "Supplier is paid", b: "Funds release instantly, with a tamper-evident trade receipt for customs and credit." },
]

const TRUST = [
  { t: "1:1 safeguarded", b: "Every rand, pula and dollar in a wallet is matched by money held at a licensed local institution — checked continuously, per currency." },
  { t: "Double-entry ledger", b: "Every movement is recorded twice, balanced and permanent. Balances can only change through a posting — never by hand." },
  { t: "Bank-grade access", b: "Transaction PIN on every payment, biometric sign-in, and two-factor protection for every BukkaPay administrator." },
  { t: "Rates shown first", b: "You see the exchange rate and every fee before you confirm. No hidden spread, no surprise charges." },
]

export default async function Home() {
  const [site, countries] = await Promise.all([getSite(), getCountries()])
  const { settings, home } = site
  const waitlist = settings.launchMode === "waitlist"
  const live = countries?.filter((c) => c.status === "live") ?? []
  const pilot = countries?.filter((c) => c.status === "pilot") ?? []

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-mesh text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="animate-fade-up">
            <Eyebrow dark>{home.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.02] sm:text-7xl">
              {home.title.split(" ").slice(0, -2).join(" ")}{" "}
              <span className="text-gradient">{home.title.split(" ").slice(-2).join(" ")}</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70">{home.subtitle}</p>
            {home.benefits.length > 0 && (
              <ul className="mt-7 grid gap-2.5 text-sm text-white/80 sm:grid-cols-2">
                {home.benefits.map((b) => (
                  <li key={b} className="flex gap-2.5"><span aria-hidden className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-money/20 text-[10px] text-emerald-300">✓</span>{b}</li>
                ))}
              </ul>
            )}
            <div id="waitlist" className="mt-10 scroll-mt-24">
              {waitlist ? (
                <div className="rounded-3xl bg-white p-2 text-ink shadow-2xl shadow-brand-900/40"><WaitlistForm source="home-hero" /></div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <ButtonLink href="#get-the-app" variant="light">Get the app</ButtonLink>
                  <ButtonLink href={MERCHANT_URL} variant="ghost-dark">Accept payments</ButtonLink>
                </div>
              )}
            </div>
            {countries && (live.length > 0 || pilot.length > 0) && (
              <p className="mt-6 text-sm text-white/50">
                {live.length ? `Live in ${live.map((c) => c.name).join(", ")}. ` : ""}
                {pilot.length ? `Piloting in ${pilot.map((c) => c.name).join(", ")}. ` : ""}
                <Link href="/countries" className="underline hover:text-white">See all countries</Link>
              </p>
            )}
          </div>

          <div aria-hidden className="relative mx-auto w-full max-w-[22rem]">
            <div className="absolute -inset-10 rounded-full bg-brand-600/30 blur-3xl" />
            <div className="relative animate-float rounded-[2.75rem] border border-white/15 bg-night-800 p-3 shadow-2xl shadow-black/60">
              <div className="rounded-[2.25rem] bg-white p-5 text-ink">
                <div className="flex items-center justify-between text-xs text-ink-muted"><span>Good morning, Ama</span><span>🔔</span></div>
                <div className="mt-4 flex gap-1.5 rounded-full bg-surface p-1 text-xs font-semibold">
                  {["ZAR", "BWP", "USD"].map((c, i) => (
                    <span key={c} className={`flex-1 rounded-full py-1.5 text-center ${i === 0 ? "bg-night text-white shadow" : "text-ink-muted"}`}>{c}</span>
                  ))}
                </div>
                <div className="mt-4 rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-night p-5 text-white">
                  <p className="text-xs text-white/70">Available balance</p>
                  <p className="mt-1 font-display text-3xl font-bold tracking-tight">R 4 820.50</p>
                  <p className="mt-3 text-[11px] text-white/60">≈ P 3 541.20 · $ 262.10 at today&apos;s rates</p>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[10px] font-semibold text-ink-soft">
                  {[["↗", "Send"], ["↙", "Request"], ["✈", "Flights"], ["▦", "Suppliers"]].map(([i, l]) => (
                    <div key={l}><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-base text-brand-700">{i}</div><p className="mt-1">{l}</p></div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  {[["Thabo’s Spaza", "Scan to pay", "−R 150.00", false], ["@lerato", "Transfer · free", "+R 400.00", true], ["Gabs Wholesale", "Supplier · escrow", "−P 2 300.00", false]].map(([n, d, a, plus]) => (
                    <div key={n as string} className="flex items-center justify-between rounded-2xl border border-line px-3 py-2.5">
                      <div><p className="font-semibold">{n}</p><p className="text-ink-muted">{d}</p></div>
                      <p className={`font-semibold ${plus ? "text-emerald-600" : ""}`}>{a}</p>
                    </div>
                  ))}
                </div>
                <div className="mx-auto -mb-1 mt-5 grid h-14 w-14 place-items-center rounded-full bg-night text-xl text-white shadow-lg shadow-brand-900/40">⌖</div>
              </div>
            </div>
            <div className="absolute -left-8 top-24 hidden animate-float-slow rounded-2xl bg-white px-4 py-3 text-ink shadow-card sm:block">
              <p className="text-[11px] text-ink-muted">Payment received</p>
              <p className="font-display text-lg font-bold text-emerald-600">R 150.00</p>
            </div>
            <div className="absolute -right-6 bottom-28 hidden animate-float rounded-2xl bg-white px-4 py-3 text-ink shadow-card sm:block">
              <p className="text-[11px] text-ink-muted">Escrow held</p>
              <p className="font-display text-lg font-bold">P 2 300.00 🔒</p>
            </div>
            <p className="mt-6 text-center text-[11px] text-white/40">Illustration. Features vary by country and verification.</p>
          </div>
        </div>

        {/* capability strip */}
        <div className="relative border-t border-white/10 bg-white/[0.03] py-5">
          <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm font-medium text-white/60">
            {[...STRIP, ...STRIP].map((s, i) => <span key={i} className="flex items-center gap-10">{s}<span aria-hidden className="text-brand-400">✦</span></span>)}
          </div>
        </div>
      </section>

      {/* ── Pillars ─────────────────────────────────────────────────── */}
      <Section eyebrow="One wallet, four worlds" title="Built for how Africa actually moves money"
               intro="Everyday payments, cross-border trade, travel and business tools — on one ledger, in your currencies.">
        <Grid cols={2}>
          {PILLARS.map((p) => (
            <Link key={p.title} href={p.href} className="group relative overflow-hidden rounded-4xl border border-line bg-white p-8 shadow-card transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-glow">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">{p.tag}</span>
                {p.live ? <Badge tone="live">Available</Badge> : <Badge>Coming soon</Badge>}
              </div>
              <h3 className="mt-5 text-2xl font-semibold">{p.title}</h3>
              <p className="mt-3 max-w-md leading-relaxed text-ink-soft">{p.body}</p>
              <p className="mt-6 text-sm font-semibold text-brand-700">Learn more <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span></p>
              <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-20 h-48 w-48 rounded-full bg-brand-100 opacity-0 blur-2xl transition group-hover:opacity-100" />
            </Link>
          ))}
        </Grid>
      </Section>

      {/* ── Features (admin-editable) ───────────────────────────────── */}
      <section className="bg-surface">
        <Section eyebrow="Everything in the app" title="Small things that add up to no more cash">
          <Grid cols={3}>
            {home.features.map((f) => (
              <div key={f.title} className="rounded-3xl border border-line bg-white p-7 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  {f.tag && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">{f.tag.replace(/\s*·\s*soon$/i, "")}</p>}
                  {/soon/i.test(f.tag) && <Badge>Coming soon</Badge>}
                </div>
                <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
              </div>
            ))}
          </Grid>
        </Section>
      </section>

      {/* ── Trade escrow ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-night text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex items-center gap-3"><Eyebrow dark>AfCFTA cross-border trade</Eyebrow><Badge>Coming soon</Badge></div>
            <h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-5xl">Pay suppliers across borders. <span className="text-gradient">Release the money when the goods arrive.</span></h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Protected Escrow Pay keeps your money safe on BukkaPay&apos;s ledger until you&apos;ve got your stock — so traders
              can buy across the border without carrying cash or trusting a stranger with it.
            </p>
            <div className="mt-8"><ButtonLink href="/trade" variant="light">How trade works</ButtonLink></div>
          </div>
          <ol className="space-y-3">
            {ESCROW.map((s) => (
              <li key={s.n} className="glass flex gap-5 rounded-3xl p-5">
                <span className="font-display text-2xl font-bold text-brand-300">{s.n}</span>
                <div><p className="font-semibold">{s.t}</p><p className="mt-1 text-sm text-white/60">{s.b}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Merchant till ───────────────────────────────────────────── */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div aria-hidden className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 rounded-full bg-money/10 blur-3xl" />
            <div className="relative rounded-4xl border border-line bg-white p-8 shadow-glow">
              <div className="flex items-center justify-between"><p className="font-semibold">Thabo&apos;s Spaza · Till 1</p><Badge tone="live">Open</Badge></div>
              <div className="mx-auto mt-6 grid h-44 w-44 grid-cols-7 gap-1 rounded-2xl bg-night p-4">
                {Array.from({ length: 49 }, (_, i) => <span key={i} className={`rounded-[2px] ${(i * 7 + (i % 5)) % 3 ? "bg-white" : "bg-transparent"}`} />)}
              </div>
              <p className="mt-6 text-center text-sm text-ink-muted">Scan to pay · R 150.00</p>
              <div className="mt-5 rounded-2xl bg-money-soft px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">🔊 Payment received</p>
                <p className="font-display text-2xl font-bold text-emerald-800">R 150.00</p>
              </div>
            </div>
          </div>
          <div>
            <Eyebrow>For shops, taxis & wholesalers</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">The till that never runs out of change.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">Print a QR for the counter or show an amount-specific one on your phone. Every payment lands in your balance instantly, with a sound and a screen your customers trust.</p>
            <ul className="mt-6 space-y-3 text-ink-soft">
              {["Cashier logins that can take payments but never withdraw", "Daily totals and a clear fee breakdown", "Invoices and payment links for regulars and bulk buyers", "Payouts to your bank or suppliers when you're ready"].map((t) => (
                <li key={t} className="flex gap-3"><span aria-hidden className="text-brand-600">✦</span>{t}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={MERCHANT_URL}>Open a business account</ButtonLink>
              <ButtonLink href="/merchants" variant="secondary">Business tools</ButtonLink>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Use cases (admin-editable) ──────────────────────────────── */}
      {home.useCases.length > 0 && (
        <section className="bg-surface">
          <Section eyebrow="Built for you" title="From the spaza to the border post" center>
            <Grid cols={3}>
              {home.useCases.map((u) => (
                <div key={u.title} className="rounded-3xl border border-line bg-white p-7 shadow-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">{u.audience}</p>
                  <h3 className="mt-2 text-lg font-semibold">{u.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{u.body}</p>
                </div>
              ))}
            </Grid>
          </Section>
        </section>
      )}

      {/* ── Trust ───────────────────────────────────────────────────── */}
      <Section eyebrow="Your money, kept 1:1" title="Technology by BukkaPay. Funds safeguarded by licensed institutions."
               intro="In every country, an approved local institution holds customer funds. BukkaPay runs the wallet, the ledger and the network on top — and proves the two match.">
        <Grid cols={4}>
          {TRUST.map((t) => (
            <div key={t.t} className="rounded-3xl border border-line p-7">
              <div aria-hidden className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-700">✦</div>
              <h3 className="mt-5 font-semibold">{t.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.b}</p>
            </div>
          ))}
        </Grid>
        <p className="mt-8 text-sm"><Link href="/security" className="font-semibold text-brand-700 underline underline-offset-4">How we keep money safe →</Link></p>
      </Section>

      {/* ── Get the app ─────────────────────────────────────────────── */}
      <section id="get-the-app" className="bg-surface scroll-mt-24">
        {waitlist ? (
          <Section eyebrow="Early access" title="Be first when BukkaPay opens in your country" center
                   intro="Join the waitlist and we'll email you the moment you can sign up.">
            <div className="mx-auto max-w-xl"><WaitlistForm source="home-bottom" /></div>
          </Section>
        ) : (
          <Section eyebrow="Get started" title="Download BukkaPay" center
                   intro="Register with your phone or email, verify your identity, and start paying.">
            <div className="flex justify-center"><AppButtons settings={settings} /></div>
          </Section>
        )}
      </section>
      <CtaBand />
    </>
  )
}
