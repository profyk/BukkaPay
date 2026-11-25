import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import type { Site } from "@/lib/content"
import { MERCHANT_URL, NAV } from "@/lib/site"

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 font-display text-xl font-bold tracking-tight ${dark ? "text-white" : "text-ink"}`} aria-label="BukkaPay home">
      <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full shadow-sm" priority />
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
    <header className="sticky top-0 z-40 border-b border-line/60 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1 text-sm font-medium text-ink-soft">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 transition-colors hover:bg-brand-50 hover:text-brand-700">{n.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={MERCHANT_URL} className="hidden sm:inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface">Business login</a>
          <Link href={cta.href} className="inline-flex h-10 items-center rounded-full bg-night px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700">{cta.label}</Link>
        </div>
      </div>
      <nav aria-label="Main mobile" className="lg:hidden flex gap-1 overflow-x-auto px-3 pb-2 text-sm font-medium text-ink-soft [scrollbar-width:none]">
        {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-1.5 hover:bg-brand-50">{n.label}</Link>)}
      </nav>
    </header>
  )
}

const FOOTER = [
  { title: "Everyday", links: [["/wallet", "Wallet & transfers"], ["/merchants", "Scan to pay for business"], ["/payment-links", "Payment links & invoices"], ["/contributions", "Stokvels & contributions"]] },
  { title: "Across borders", links: [["/trade", "Cross-border trade"], ["/cross-border", "Send money abroad"], ["/travel", "Flights"], ["/countries", "Countries & currencies"]] },
  { title: "Company", links: [["/about", "About BukkaPay"], ["/how-it-works", "How it works"], ["/pricing", "Pricing"], ["/partners", "Partnerships"], ["/contact", "Contact"]] },
  { title: "Trust", links: [["/security", "Security"], ["/faq", "FAQ"], ["/legal/terms", "Terms"], ["/legal/privacy-policy", "Privacy"], ["/legal", "All legal documents"]] },
]

export function Footer({ settings }: { settings: Site["settings"] }) {
  return (
    <footer className="relative overflow-hidden bg-night text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="relative mx-auto max-w-6xl px-4 pt-16">
        <div className="grid gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              A cash-free wallet for everyday life and cross-border trade. One Africa. One payment network.
            </p>
            <ul className="mt-5 space-y-1 text-sm text-white/60">
              <li><a href={`mailto:${settings.supportEmail}`} className="hover:text-white">{settings.supportEmail}</a></li>
              {settings.pressEmail !== settings.supportEmail && <li><a href={`mailto:${settings.pressEmail}`} className="hover:text-white">{settings.pressEmail}</a></li>}
            </ul>
            {settings.socials.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-3 text-sm font-medium">
                {settings.socials.map((s) => <li key={s.href}><a href={s.href} rel="me noopener" target="_blank" className="text-white/70 hover:text-white">{s.label}</a></li>)}
              </ul>
            )}
          </div>
          {FOOTER.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                {col.links.map(([href, label]) => <li key={href}><Link href={href} className="transition-colors hover:text-white">{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p aria-hidden className="mt-16 select-none text-center font-display text-[18vw] font-extrabold leading-none tracking-tighter text-white/[0.04] md:text-[11rem]">BukkaPay</p>
      </div>
      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-white/50">
          BukkaPay provides payment technology. Customer funds are held and settled by licensed local financial institutions
          in each country where BukkaPay operates. Features and availability vary by country — see{" "}
          <Link href="/countries" className="underline hover:text-white">Countries & currencies</Link>. © {new Date().getFullYear()} BukkaPay.
        </p>
      </div>
    </footer>
  )
}

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${dark ? "text-brand-300" : "text-brand-600"}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dark ? "bg-brand-300" : "bg-brand-600"}`} />{children}
    </p>
  )
}

export function Badge({ children, tone = "soon" }: { children: ReactNode; tone?: "soon" | "live" }) {
  const cls = tone === "live" ? "bg-money-soft text-emerald-800" : "bg-amber-100 text-amber-800"
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>
}

export function Section({ eyebrow, title, intro, children, className = "", id, center = false }: {
  eyebrow?: string; title?: string; intro?: string; children?: ReactNode; className?: string; id?: string; center?: boolean
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-4 py-20 sm:py-28 ${className}`}>
      <div className={center ? "mx-auto max-w-3xl text-center" : ""}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {title && <h2 className={`mt-3 text-3xl font-semibold leading-tight sm:text-5xl ${center ? "" : "max-w-3xl"}`}>{title}</h2>}
        {intro && <p className={`mt-5 text-lg leading-relaxed text-ink-soft ${center ? "" : "max-w-2xl"}`}>{intro}</p>}
      </div>
      {children && <div className="mt-12">{children}</div>}
    </section>
  )
}

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-mesh text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <Eyebrow dark>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.05] sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">{intro}</p>
        {children && <div className="mt-10 flex flex-wrap gap-3">{children}</div>}
      </div>
    </section>
  )
}

export function Feature({ title, children, badge }: { title: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="group rounded-3xl border border-line bg-white p-7 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-glow">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        {badge}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{children}</p>
    </div>
  )
}

export function Grid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" }[cols]
  return <div className={`grid gap-5 ${c}`}>{children}</div>
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "light" | "ghost-dark" }) {
  const cls = {
    primary: "bg-brand-600 text-white shadow-glow hover:bg-brand-700",
    secondary: "border border-line bg-white text-ink hover:border-brand-200 hover:bg-surface",
    light: "bg-white text-night hover:bg-brand-50",
    "ghost-dark": "border border-white/20 text-white hover:bg-white/10",
  }[variant]
  const base = `group inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold transition ${cls}`
  const inner = <>{children}<span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span></>
  return href.startsWith("http")
    ? <a href={href} className={base}>{inner}</a>
    : <Link href={href} className={base}>{inner}</Link>
}

export function AppButtons({ settings }: { settings: Site["settings"] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {settings.iosUrl ? <ButtonLink href={settings.iosUrl}>Download for iPhone</ButtonLink> : <span className="inline-flex h-12 items-center rounded-full border border-dashed border-line px-6 text-sm text-ink-muted">iPhone app — coming soon</span>}
      {settings.androidUrl ? <ButtonLink href={settings.androidUrl} variant="secondary">Get it on Android</ButtonLink> : <span className="inline-flex h-12 items-center rounded-full border border-dashed border-line px-6 text-sm text-ink-muted">Android app — coming soon</span>}
    </div>
  )
}

export function CtaBand() {
  return (
    <section className="px-4 py-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-4xl bg-mesh px-8 py-16 text-white sm:px-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
        <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold leading-tight sm:text-5xl">Leave cash behind.<br /><span className="text-gradient">Keep the trade moving.</span></h2>
            <p className="mt-4 text-white/70">See where BukkaPay is live today, and where we&apos;re launching next.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/countries" variant="light">Check availability</ButtonLink>
            <ButtonLink href={MERCHANT_URL} variant="ghost-dark">Register a business</ButtonLink>
          </div>
        </div>
      </div>
    </section>
  )
}
