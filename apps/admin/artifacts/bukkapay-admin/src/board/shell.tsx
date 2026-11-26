import { useEffect, useState, type ReactNode } from "react"
import { Link, useLocation } from "wouter"
import {
  Activity, ArrowLeftRight, Banknote, Bell, BookOpen, Building2, CalendarDays, CreditCard, FileText, Gavel, Globe2,
  HeartPulse, Landmark, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, PiggyBank, Rocket, ScrollText, Settings,
  ShieldAlert, Sparkles, UserCircle, Users, Wallet, X,
} from "lucide-react"
import { boardApi, can, setToken, useBoard, useMe, type Me } from "./api"
import { ThemeToggle } from "./theme-toggle"
import { dateTime } from "./kit"

export type NavItem = { path: string; label: string; icon: typeof LayoutDashboard; perm: string | null }
export const NAV: [string, NavItem[]][] = [
  ["Overview", [
    { path: "/", label: "Executive dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
    { path: "/health", label: "Company health", icon: HeartPulse, perm: "risks.view" },
    { path: "/insights", label: "Insights", icon: Sparkles, perm: "insights.view" },
  ]],
  ["Growth & money", [
    { path: "/adoption", label: "Customers & merchants", icon: Users, perm: "adoption.view" },
    { path: "/currencies", label: "Currencies & wallets", icon: Wallet, perm: "analytics.view" },
    { path: "/revenue", label: "Revenue", icon: LineChart, perm: "revenue.view" },
    { path: "/financials", label: "Financial statements", icon: BookOpen, perm: "financials.view" },
    { path: "/cross-border", label: "Cross-border", icon: ArrowLeftRight, perm: "crossborder.view" },
    { path: "/pos", label: "Card & POS", icon: CreditCard, perm: "pos.view" },
    { path: "/fx", label: "FX", icon: Banknote, perm: "fx.view" },
    { path: "/custodians", label: "Custodians & liquidity", icon: Landmark, perm: "custodians.view" },
  ]],
  ["Strategy", [
    { path: "/countries", label: "Countries", icon: Globe2, perm: "countries.view" },
    { path: "/milestones", label: "Milestones", icon: Rocket, perm: "milestones.view" },
    { path: "/risks", label: "Risk register", icon: ShieldAlert, perm: "risks.view" },
  ]],
  ["Capital", [
    { path: "/my-investment", label: "My investment", icon: PiggyBank, perm: "investments.own" },
    { path: "/fundraising", label: "Fundraising", icon: Activity, perm: "fundraising.view" },
    { path: "/investors", label: "Investors & register", icon: Building2, perm: "investors.view" },
    { path: "/use-of-funds", label: "Use of funds", icon: Banknote, perm: "use_of_funds.view" },
  ]],
  ["Governance", [
    { path: "/meetings", label: "Meetings", icon: CalendarDays, perm: "governance.view" },
    { path: "/resolutions", label: "Resolutions", icon: Gavel, perm: "resolutions.view" },
    { path: "/reports", label: "Reports", icon: FileText, perm: "reports.view" },
    { path: "/documents", label: "Documents", icon: ScrollText, perm: "documents.view" },
    { path: "/announcements", label: "Announcements", icon: Megaphone, perm: "announcements.view" },
  ]],
  ["Administration", [
    { path: "/users", label: "Users & access", icon: Users, perm: "users.manage" },
    { path: "/audit", label: "Audit trail", icon: ScrollText, perm: "audit.view" },
    { path: "/settings", label: "Company settings", icon: Settings, perm: "financials.manage" },
  ]],
]

export function allowed(me: Me | undefined): NavItem[] {
  return NAV.flatMap(([, items]) => items).filter((i) => !i.perm || can(me, i.perm))
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-xl" />
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-wide text-white">BUKKAPAY</p>
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#C9A227]">BOARDROOM</p>
      </div>
    </div>
  )
}

function SideNav({ me, onNavigate }: { me: Me | undefined; onNavigate?: () => void }) {
  const [loc] = useLocation()
  return (
    <nav aria-label="Boardroom" className="px-2 pb-6 space-y-4">
      {NAV.map(([group, items]) => {
        const vis = items.filter((i) => !i.perm || can(me, i.perm))
        if (!vis.length) return null
        return (
          <div key={group}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{group}</p>
            {vis.map((i) => {
              const on = i.path === "/" ? loc === "/" : loc.startsWith(i.path)
              return (
                <Link key={i.path} href={i.path} onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${on ? "bg-white/10 text-white font-medium" : "text-white/70 hover:text-white hover:bg-white/5"}`}>
                  <i.icon className={`w-4 h-4 ${on ? "text-[#10B981]" : ""}`} />{i.label}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function Notifications() {
  const [open, setOpen] = useState(false)
  const q = useBoard<{ unread: number; notifications: any[] }>("/notifications")
  const [, go] = useLocation()
  const markRead = async () => { await boardApi.post("/notifications/read"); q.refetch() }
  return (
    <div className="relative">
      <button aria-label={`Notifications${q.data?.unread ? `, ${q.data.unread} unread` : ""}`} onClick={() => { setOpen(!open); if (!open && q.data?.unread) void markRead() }}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-muted">
        <Bell className="w-4 h-4" />
        {!!q.data?.unread && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[#C9A227] text-[10px] font-bold text-[#0A1630]">{q.data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover shadow-xl z-40">
          <p className="px-4 py-3 text-sm font-semibold border-b border-border">Notifications</p>
          {!q.data?.notifications.length && <p className="px-4 py-6 text-sm text-muted-foreground">Nothing yet.</p>}
          {q.data?.notifications.map((n) => (
            <button key={n.id} onClick={() => { setOpen(false); if (n.link) go(n.link) }} className="block w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted">
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">{dateTime(n.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const me = useMe()
  const [loc, go] = useLocation()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => { if (me.data?.mfaSetupRequired) go("/mfa") }, [me.data?.mfaSetupRequired])
  // Charts read their colours from the theme when they render: remount the page when it changes.
  const [themeKey, setThemeKey] = useState(0)
  useEffect(() => {
    const bump = () => setTimeout(() => setThemeKey((k) => k + 1), 0)
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)")
    window.addEventListener("bukkapay-theme", bump); mq?.addEventListener?.("change", bump)
    return () => { window.removeEventListener("bukkapay-theme", bump); mq?.removeEventListener?.("change", bump) }
  }, [])
  const signOut = async () => { try { await boardApi.post("/auth/logout") } catch { /* already ended */ } setToken(null); window.location.assign("/login") }
  const m = me.data
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-[#0A1630] border-r border-white/5 overflow-y-auto br-noprint">
        <Brand />
        <SideNav me={m} />
      </aside>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex br-noprint" onClick={() => setDrawer(false)}>
          <aside className="w-72 h-full bg-[#0A1630] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center pr-3"><div className="mr-auto"><Brand /></div>
              <button aria-label="Close menu" onClick={() => setDrawer(false)} className="text-white/70 p-2"><X className="w-5 h-5" /></button></div>
            <SideNav me={m} onNavigate={() => setDrawer(false)} />
          </aside>
          <div className="flex-1 bg-black/50" />
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur pt-[env(safe-area-inset-top)] br-noprint">
          <div className="flex items-center gap-2 px-3 sm:px-6 h-14">
            <button aria-label="Open menu" onClick={() => setDrawer(true)} className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-muted"><Menu className="w-5 h-5" /></button>
            <p className="lg:hidden font-semibold text-sm">BukkaPay <span className="text-[#B97C08] dark:text-[#C9A227]">Boardroom</span></p>
            <span className="hidden lg:block text-xs text-muted-foreground">Confidential · approved company information</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Notifications />
              <span className="hidden sm:inline-flex"><ThemeToggle /></span>
              <Link href="/account" className={`hidden sm:flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted ${loc === "/account" ? "bg-muted" : ""}`}>
                <UserCircle className="w-5 h-5 text-muted-foreground" />
                <span className="text-left leading-tight">
                  <span className="block text-sm font-medium max-w-[160px] truncate">{m?.name ?? "…"}</span>
                  <span className="block text-[11px] text-muted-foreground">{m?.roleLabel}</span>
                </span>
              </Link>
              <button onClick={signOut} aria-label="Sign out" className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg hover:bg-muted text-sm"><LogOut className="w-4 h-4" /><span className="hidden md:inline">Sign out</span></button>
            </div>
          </div>
        </header>
        <main key={themeKey} className="br-main px-3 sm:px-6 py-5 sm:py-7 pb-[max(2rem,env(safe-area-inset-bottom))] max-w-[1400px]">{children}</main>
      </div>
    </div>
  )
}

export function NoAccess() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-2">
      <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
      <h1 className="text-xl font-semibold">Nothing to show here</h1>
      <p className="text-sm text-muted-foreground">Your Boardroom access doesn't include this page. If you think it should, ask BukkaPay's company administrator.</p>
    </div>
  )
}
