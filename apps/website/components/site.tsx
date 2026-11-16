import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import type { Site } from "@/lib/content"
import { MERCHANT_URL, NAV } from "@/lib/site"

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold text-ink" aria-label="BukkaPay home">
      <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" priority />
      BukkaPay
    </Link>
  )
}

export function AnnouncementBar({ settings }: { settings: Site["settings"] }) {
  const a = settings.announcement
  if (!a.enabled || !a.text) return null
  const tone = { info: "bg-brand-700 text-white", success: "bg-emerald-700 text-white", warning: "bg-amber-400 text-ink" }[a.tone]
  return (
    <div className={`${tone} text-center text-sm`}>
      <p className="mx-auto max-w-6xl px-4 py-2">
        {a.text}{" "}
        {a.link && <a href={a.link.href} className="font-semibold underline underline-offset-2">{a.link.label}</a>}
      </p>
    </div>
  )
}

export function Header({ settings }: { settings: Site["settings"] }) {
  const cta = settings.launchMode === "waitlist"
    ? { href: "/#waitlist", label: "Join the waitlist" }
    : { href: "/#get-the-app", label: "Get the app" }
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Main" className="hidden md:flex items-center gap-6 text-sm font-medium text-ink-soft">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-brand-700">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={MERCHANT_URL} className="hidden sm:inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface">Business login</a>
          <Link href={cta.href} className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">{cta.label}</Link>
        </div>
      </div>
      <nav aria-label="Main mobile" className="md:hidden flex gap-4 overflow-x-auto px-4 pb-3 text-sm font-medium text-ink-soft">
        {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap">{n.label}</Link>)}
      </nav>
    </header>
  )
}

const FOOTER = [
  { title: "Product", links: [["/wallet", "Customer wallet"], ["/merchants", "Merchant solutions"], ["/cross-border", "Cross-border payments"], ["/payment-links", "Payment links"], ["/contributions", "Community contributions"]] },
  { title: "Company", links: [["/about", "About BukkaPay"], ["/how-it-works", "How it works"], ["/pricing", "Pricing"], ["/countries", "Countries & currencies"], ["/partners", "Partnerships"], ["/contact", "Contact"]] },
  { title: "Trust", links: [["/security", "Security"], ["/faq", "FAQ"], ["/legal/terms", "Terms of service"], ["/legal/privacy-policy", "Privacy policy"], ["/legal/cookies", "Cookie policy"], ["/legal/aml-risk", "AML & risk"]] },
]

export function Footer({ settings }: { settings: Site["settings"] }) {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-ink-muted">One Africa. One Payment Network. From Cape to Cairo.</p>
          <ul className="mt-4 space-y-1 text-sm text-ink-muted">
            <li><a href={`mailto:${settings.supportEmail}`} className="hover:text-brand-700">{settings.supportEmail}</a></li>
            {settings.pressEmail !== settings.supportEmail && <li><a href={`mailto:${settings.pressEmail}`} className="hover:text-brand-700">{settings.pressEmail}</a></li>}
          </ul>
          {settings.socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
              {settings.socials.map((s) => <li key={s.href}><a href={s.href} rel="me noopener" target="_blank" className="hover:text-brand-700">{s.label}</a></li>)}
            </ul>
          )}
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-sm font-semibold">{col.title}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-muted">
              {col.links.map(([href, label]) => <li key={href}><Link href={href} className="hover:text-brand-700">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-muted">
          BukkaPay provides payment technology. Customer funds are held and settled by licensed local financial institutions
          in each country where BukkaPay operates. Availability varies by country — see <Link href="/countries" className="underline">Countries & currencies</Link>.
          © {new Date().getFullYear()} BukkaPay.
        </p>
      </div>
    </footer>
  )
}

export function Section({ eyebrow, title, intro, children, className = "", id }: {
  eyebrow?: string; title?: string; intro?: string; children?: ReactNode; className?: string; id?: string
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 py-16 sm:py-20 ${className}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
      {title && <h2 className="mt-2 text-3xl sm:text-4xl font-semibold max-w-3xl">{title}</h2>}
      {intro && <p className="mt-4 max-w-2xl text-lg text-ink-soft">{intro}</p>}
      {children && <div className="mt-10">{children}</div>}
    </section>
  )
}

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children?: ReactNode }) {
  return (
    <section className="bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl sm:text-5xl font-semibold leading-tight">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft">{intro}</p>
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  )
}

export function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</p>
    </div>
  )
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[cols]
  return <div className={`grid gap-5 ${c}`}>{children}</div>
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary" ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-line bg-white text-ink hover:bg-surface"
  const external = href.startsWith("http")
  return external
    ? <a href={href} className={`inline-flex h-12 items-center rounded-xl px-6 font-semibold ${cls}`}>{children}</a>
    : <Link href={href} className={`inline-flex h-12 items-center rounded-xl px-6 font-semibold ${cls}`}>{children}</Link>
}

export function AppButtons({ settings }: { settings: Site["settings"] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {settings.iosUrl ? <ButtonLink href={settings.iosUrl}>Download for iPhone</ButtonLink> : <span className="inline-flex h-12 items-center rounded-xl border border-dashed border-line px-6 text-sm text-ink-muted">iPhone app — coming soon</span>}
      {settings.androidUrl ? <ButtonLink href={settings.androidUrl} variant="secondary">Get it on Android</ButtonLink> : <span className="inline-flex h-12 items-center rounded-xl border border-dashed border-line px-6 text-sm text-ink-muted">Android app — coming soon</span>}
    </div>
  )
}

export function CtaBand() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">Ready when your country is.</h2>
          <p className="mt-2 text-white/70">See where BukkaPay is live today, and where we're launching next.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/countries" className="inline-flex h-12 items-center rounded-xl bg-white px-6 font-semibold text-ink">Check availability</Link>
          <a href={MERCHANT_URL} className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 font-semibold">Register a business</a>
        </div>
      </div>
    </section>
  )
}
