import type { ReactNode } from "react"

const POINTS = [
  { t: "Get paid at the counter", d: "Signed QR codes with a spoken “Payment received” at the till." },
  { t: "Sell across the border", d: "Trade invoices in ZAR, BWP or USD, paid instantly or through escrow." },
  { t: "Links that get paid", d: "Share a checkout link on WhatsApp; it's marked paid the moment money lands." },
  { t: "Your team, your rules", d: "Owner, admin, finance, cashier and viewer roles." },
]

/** Deep-blue brand panel + form, shared by merchant sign-in and sign-up. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      <section className="relative overflow-hidden bg-[#010C38] px-6 py-10 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-[#0052FF]/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-cyan-400/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <img src="/icon.png" alt="" className="h-10 w-10 rounded-xl shadow-lg shadow-black/30" />
          <p className="font-display text-lg font-semibold">BukkaPay <span className="text-cyan-300">for Business</span></p>
        </div>

        <div className="relative mt-10 lg:mt-0">
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl xl:text-5xl">
            Get paid at the counter, online and across the border.
          </h1>
          <ul className="mt-8 hidden gap-4 sm:grid">
            {POINTS.map((p) => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
                <span><span className="font-semibold">{p.t}.</span> <span className="text-white/65">{p.d}</span></span>
              </li>
            ))}
          </ul>

          {/* Till preview */}
          <div className="mt-10 hidden max-w-sm rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300">Payment received</p>
            <p className="mt-1 font-display text-3xl font-semibold">R 150.00</p>
            <p className="mt-1 text-sm text-white/55">from Thabo M. · Scan to pay · just now</p>
          </div>
        </div>

        <p className="relative mt-10 text-xs text-white/40 lg:mt-0">Funds are held and settled through BukkaPay's licensed partners in each country.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  )
}
