"use client"

import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { getToken, setToken } from "@/lib/api"
import { can, useData, type Membership } from "@/lib/hooks"
import { Badge, Notice } from "@/components/ui"
import { MerchantContext } from "@/components/merchant-context"


const NAV: { href: string; label: string; cap?: "collect" | "finance" | "settings" | "developer" | "owner" }[] = [
  { href: "", label: "Overview" },
  { href: "/transactions", label: "Transactions" },
  { href: "/qr", label: "QR codes", cap: "collect" },
  { href: "/links", label: "Checkout links", cap: "collect" },
  { href: "/billing", label: "Bills", cap: "owner" },
  { href: "/properties", label: "Properties & rent", cap: "owner" },
  { href: "/settlements", label: "Settlements", cap: "finance" },
  { href: "/staff", label: "Staff", cap: "settings" },
  { href: "/developers", label: "Developers", cap: "developer" },
  { href: "/verification", label: "Verification" },
]

export default function MerchantLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const { data, error } = useData<Membership[]>(ready ? "/merchant-memberships" : null)

  useEffect(() => {
    if (!getToken()) router.replace("/login")
    else setReady(true)
  }, [router])

  const merchant = data?.find((m) => m.id === id) ?? null
  const base = `/m/${id}`

  return (
    <MerchantContext.Provider value={merchant}>
      <div className="min-h-screen lg:flex">
        <aside className="no-print lg:w-60 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-line bg-white dark:bg-white/[0.02] dark:border-white/10">
          <div className="p-4 lg:p-5">
            <Link href="/businesses" className="text-xs text-ink-muted hover:text-brand-600">← All businesses</Link>
            <p className="mt-2 font-display text-lg font-semibold leading-tight">{merchant?.businessName ?? "…"}</p>
            {merchant && <p className="text-xs text-ink-muted capitalize">{merchant.role} · {merchant.currency}</p>}
          </div>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto px-3 pb-3 lg:pb-0">
            {NAV.filter((n) => !n.cap || can(merchant?.role, n.cap)).map((n) => {
              const href = base + n.href
              const active = n.href === "" ? pathname === base : pathname.startsWith(href)
              return (
                <Link key={n.href} href={href}
                      className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-surface dark:text-white/70 dark:hover:bg-white/5"}`}>
                  {n.label}
                </Link>
              )
            })}
          </nav>
          <div className="hidden lg:block p-4 mt-auto">
            <button className="text-xs text-ink-muted hover:text-red-600" onClick={() => { setToken(null); router.replace("/login") }}>Sign out</button>
          </div>
        </aside>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 max-w-6xl">
          {error && <Notice tone="error">{error}</Notice>}
          {data && !merchant && <Notice tone="error">You don't have access to this business.</Notice>}
          {merchant && merchant.kybStatus !== "approved" && !pathname.endsWith("/verification") && (
            <div className="mb-6 no-print">
              <Notice tone="warn">
                <span className="font-semibold">Payments are switched off.</span>{" "}
                Verification status: <Badge value={merchant.kybStatus} />{" "}
                <Link className="underline font-semibold" href={`${base}/verification`}>Complete verification</Link>
              </Notice>
            </div>
          )}
          {merchant && children}
        </main>
      </div>
    </MerchantContext.Provider>
  )
}
