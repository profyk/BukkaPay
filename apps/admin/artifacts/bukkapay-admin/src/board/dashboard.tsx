import { useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { BarChart3, Download, Globe2, LayoutDashboard, LogOut, Mail, PieChart, Printer, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { boardApi, errorText, getToken, setToken, type Overview, type Series, type Update } from "./api"
import { ThemeToggle } from "./theme-toggle"

// Validated categorical pair (dataviz palette): identity / polarity poles.
const BLUE = "#2a78d6"
const ORANGE = "#eb6834"
const GRID = "var(--border)"
const INK = "var(--muted-foreground)"

const TABS = ["Overview", "Growth", "Financials", "Unit economics", "Markets & retention", "Updates"] as const
type Tab = (typeof TABS)[number]
const TAB_ICON: Record<Tab, typeof LayoutDashboard> = { "Overview": LayoutDashboard, "Growth": TrendingUp, "Financials": BarChart3,
  "Unit economics": PieChart, "Markets & retention": Globe2, "Updates": Mail }
const TAB_SHORT: Record<Tab, string> = { "Overview": "Overview", "Growth": "Growth", "Financials": "Finance",
  "Unit economics": "Units", "Markets & retention": "Markets", "Updates": "Updates" }

const monthLabel = (m: string) => new Date(m + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
const num = (v?: number | null) => v == null ? "—" : new Intl.NumberFormat(undefined, { notation: Math.abs(v) >= 100_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v)
const pct = (v?: number | null, dp = 1) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`

export default function Dashboard() {
  const [months, setMonths] = useState(12)
  const [tab, setTab] = useState<Tab>("Overview")
  const [all, setAll] = useState(false)  // board pack: every section, then print
  const boardPack = () => { setAll(true); setTimeout(() => { window.print(); setAll(false) }, 800) }
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await boardApi.get("/auth/me")).data })
  const q = useQuery({ queryKey: ["overview", months], queryFn: async () => (await boardApi.get<Overview>("/overview", { params: { months } })).data })
  const d = q.data
  const ccy = d?.reportingCurrency ?? ""
  const money = (v?: number | null) => v == null ? "—" : `${ccy} ${num(v)}`

  const signOut = async () => { try { await boardApi.post("/auth/logout") } catch { /* already ended */ } setToken(null); window.location.assign("/login") }
  const exportCsv = async () => {
    const r = await fetch(`/api/board/export.csv?months=${months}`, { headers: { Authorization: `Bearer ${getToken()}` } })
    const url = URL.createObjectURL(await r.blob())
    const a = Object.assign(document.createElement("a"), { href: url, download: "bukkapay-board-metrics.csv" })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-20 print:static pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
          <div className="mr-auto min-w-0"><p className="text-lg leading-tight tracking-tight" style={{ fontFamily: "Fraunces, Georgia, serif" }}>BukkaPay <span className="text-muted-foreground">Board</span>{me.data?.isOwner && <span className="ml-2 align-middle rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7C3AED] dark:text-[#9B6EFF]" style={{ fontFamily: "inherit" }}>Owner</span>}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[52vw] sm:max-w-none">{me.data ? `${me.data.name}${me.data.organisation ? ` · ${me.data.organisation}` : ""}` : "Confidential"}</p></div>
          <span className="print:hidden"><ThemeToggle /></span>
          <Button size="sm" variant="ghost" className="print:hidden px-2 sm:px-3" onClick={signOut} aria-label="Sign out"><LogOut className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Sign out</span></Button>
          <div className="w-full sm:w-auto flex items-center gap-2 print:hidden">
            <select aria-label="Period" value={months} onChange={(e) => setMonths(Number(e.target.value))}
              className="h-9 flex-1 sm:flex-none rounded-md border border-border bg-background px-2 text-sm">
              {[6, 12, 24, 36].map((m) => <option key={m} value={m}>Last {m} months</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv} aria-label="Download CSV"><Download className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">CSV</span></Button>
            <Button size="sm" variant="outline" onClick={boardPack} aria-label="Print board pack"><Printer className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Board pack</span></Button>
          </div>
        </div>
        <nav className="hidden md:flex max-w-7xl mx-auto px-4 gap-1 overflow-x-auto print:hidden">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </nav>
      </header>

      {/* Phone: bottom tab bar, like the customer app */}
      <nav aria-label="Sections" className="md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)] print:hidden">
        <div className="grid grid-cols-6">
          {TABS.map((t) => { const Icon = TAB_ICON[t]; const on = tab === t
            return (
              <button key={t} onClick={() => { setTab(t); window.scrollTo({ top: 0 }) }} aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] leading-none ${on ? "text-[#7C3AED] dark:text-[#9B6EFF] font-semibold" : "text-muted-foreground"}`}>
                <Icon className="w-5 h-5" />{TAB_SHORT[t]}
              </button>
            ) })}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-28 md:pb-6 space-y-4 sm:space-y-6">
        <h1 className="md:hidden text-xl font-semibold">{tab}</h1>
        {q.isLoading && <p className="text-muted-foreground">Loading the numbers…</p>}
        {q.error && <p className="text-destructive">{errorText(q.error)}</p>}
        {d && (
          <>
            <p className="text-xs text-muted-foreground">
              Amounts in {ccy}{d.fxAt ? `, converted at market mid-rates from ${new Date(d.fxAt).toLocaleString()}` : ""}.
              {d.unconverted.length > 0 && ` Not included (no rate yet): ${d.unconverted.join(", ")}.`} Updated {new Date(d.generatedAt).toLocaleString()}.
            </p>
            {(tab === "Overview" || all) && <OverviewTab d={d} money={money} />}
            {(tab === "Growth" || all) && <GrowthTab s={d.series} />}
            {(tab === "Financials" || all) && <FinancialsTab d={d} money={money} />}
            {(tab === "Unit economics" || all) && <UnitTab d={d} money={money} />}
            {(tab === "Markets & retention" || all) && <MarketsTab d={d} />}
            {tab === "Updates" && <UpdatesTab />}
          </>
        )}
      </main>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold mt-1 tabular-nums break-words">{value}</p>
      {sub != null && <p className={`text-xs mt-1 ${tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4 break-inside-avoid">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

const tone = (v?: number | null) => v == null ? undefined : v >= 0 ? "good" as const : "bad" as const
const axis = { tick: { fill: INK, fontSize: 12 }, axisLine: false, tickLine: false }

function Chart({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer></div>
}

function Tip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium mb-1">{monthLabel(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />{p.name}: <span className="tabular-nums">{fmt ? fmt(p.value) : num(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function OverviewTab({ d, money }: { d: Overview; money: (v?: number | null) => string }) {
  const k = d.kpis
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Customers" value={num(k.users)} sub={`${num(k.newUsersThisMonth)} new this month ${k.signupGrowth != null ? `(${pct(k.signupGrowth)})` : ""}`} tone={tone(k.signupGrowth)} />
        <Kpi label="Monthly active users" value={num(k.mau)} sub={`${k.activation ?? 0}% of customers${k.mauChange != null ? ` · ${pct(k.mauChange)} MoM` : ""}`} tone={tone(k.mauChange)} />
        <Kpi label="Payment volume, 30 days" value={money(k.tpv30)} sub={`${num(k.transactions30)} payments`} />
        <Kpi label="Revenue, 30 days" value={money(k.revenue30)} sub={k.revenueGrowth != null ? `${pct(k.revenueGrowth)} vs last month` : undefined} tone={tone(k.revenueGrowth)} />
        <Kpi label="Net profit, year to date" value={money(k.netYtd)} sub={k.netYtd == null ? "Needs management accounts" : undefined} tone={tone(k.netYtd)} />
        <Kpi label="Runway" value={k.runwayMonths != null ? `${k.runwayMonths} mo` : k.monthlyBurn === 0 && k.cash != null ? "Profitable" : "—"}
          sub={k.cash != null ? `Cash ${money(k.cash)} · burn ${money(k.monthlyBurn)}/mo` : "Needs cash balance"} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Revenue by month" note="Fees earned, from the ledger.">
          <Chart><BarChart data={d.series}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip fmt={money} />} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="revenue" name="Revenue" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></Chart>
        </Card>
        <Card title="Customers" note="Total customers at the end of each month.">
          <Chart><AreaChart data={d.series}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip />} /><Area dataKey="users" name="Customers" stroke={BLUE} strokeWidth={2} fill={BLUE} fillOpacity={0.12} /></AreaChart></Chart>
        </Card>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Merchants" value={num(k.merchants)} sub={`${num(k.activeMerchants)} took payments this month`} />
        <Kpi label="Customer funds held" value={money(k.customerFunds)} sub="Safeguarded wallet balances" />
        <Kpi label="Revenue, year to date" value={money(k.revenueYtd)} />
        <Kpi label="Countries" value={`${num(k.countriesLive)} live`} sub={`${num(k.countriesPilot)} in pilot`} />
      </div>
    </div>
  )
}

function GrowthTab({ s }: { s: Series[] }) {
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="New customers per month">
          <Chart><BarChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={48} />
            <Tooltip content={<Tip />} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="signups" name="New customers" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></Chart>
        </Card>
        <Card title="Monthly active users" note="Customers who made at least one payment in the month.">
          <Chart><LineChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={48} />
            <Tooltip content={<Tip />} /><Line dataKey="mau" name="Active users" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} /></LineChart></Chart>
        </Card>
        <Card title="Payment volume per month">
          <Chart><AreaChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip />} /><Area dataKey="tpv" name="Volume" stroke={BLUE} strokeWidth={2} fill={BLUE} fillOpacity={0.12} /></AreaChart></Chart>
        </Card>
        <Card title="Merchants">
          <Chart><LineChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={48} />
            <Tooltip content={<Tip />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="activeMerchants" name="Active" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} />
            <Line dataKey="newMerchants" name="New" stroke={ORANGE} strokeWidth={2} dot={{ r: 4 }} /></LineChart></Chart>
        </Card>
      </div>
      <Card title="Growth table">
        <Table rows={s} cols={[["Month", (r) => monthLabel(r.month)], ["New customers", (r) => num(r.signups)], ["Customers", (r) => num(r.users)],
          ["Active users", (r) => num(r.mau)], ["Payments", (r) => num(r.transactions)], ["Volume", (r) => num(r.tpv)], ["New merchants", (r) => num(r.newMerchants)]]} />
      </Card>
    </div>
  )
}

function FinancialsTab({ d, money }: { d: Overview; money: (v?: number | null) => string }) {
  const s = d.series
  const latest = [...s].reverse().find((r) => r.costBreakdown)
  const labels: Record<string, string> = { staff_costs: "Staff", technology_costs: "Technology", marketing_costs: "Marketing",
    compliance_legal_costs: "Compliance & legal", office_admin_costs: "Office & admin", other_costs: "Other" }
  const breakdown = latest?.costBreakdown ? Object.entries(latest.costBreakdown).map(([k, v]) => ({ name: labels[k] ?? k, value: v ?? 0 })).sort((a, b) => b.value - a.value) : []
  const hasAccounts = s.some((r) => r.operatingCosts != null)
  return (
    <div className="space-y-4">
      {!hasAccounts && <p className="text-sm rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
        Operating costs and cash appear once BukkaPay's monthly management accounts are entered. Revenue and direct costs come from the ledger automatically.</p>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Net profit or loss by month" note="Blue is profit, orange is loss.">
          <Chart><BarChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip fmt={money} />} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="netProfit" name="Net" radius={[4, 4, 4, 4]} maxBarSize={28}>{s.map((r) => <Cell key={r.month} fill={(r.netProfit ?? 0) >= 0 ? BLUE : ORANGE} />)}</Bar></BarChart></Chart>
        </Card>
        <Card title="Revenue and operating costs">
          <Chart><LineChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip fmt={money} />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="revenue" name="Revenue" stroke={BLUE} strokeWidth={2} dot={{ r: 4 }} />
            <Line dataKey="operatingCosts" name="Operating costs" stroke={ORANGE} strokeWidth={2} dot={{ r: 4 }} connectNulls /></LineChart></Chart>
        </Card>
        <Card title="Cash in the bank" note="Month-end balance from the management accounts.">
          <Chart><AreaChart data={s}><CartesianGrid vertical={false} stroke={GRID} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={num} {...axis} width={56} />
            <Tooltip content={<Tip fmt={money} />} /><Area dataKey="cash" name="Cash" stroke={BLUE} strokeWidth={2} fill={BLUE} fillOpacity={0.12} connectNulls /></AreaChart></Chart>
        </Card>
        <Card title={`Where the money goes${latest ? ` (${monthLabel(latest.month)})` : ""}`}>
          {breakdown.length ? (
            <Chart><BarChart data={breakdown} layout="vertical" margin={{ left: 24 }}><CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis type="number" tickFormatter={num} {...axis} /><YAxis type="category" dataKey="name" {...axis} width={96} />
              <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="value" name="Cost" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={22} /></BarChart></Chart>
          ) : <p className="text-sm text-muted-foreground">No management accounts yet.</p>}
        </Card>
      </div>
      <Card title="Profit and loss" note={`${d.reportingCurrency}. Gross profit = revenue − direct costs (provider and card costs in the ledger). Net = gross profit + other income − operating costs.`}>
        <Table rows={s} cols={[["Month", (r) => monthLabel(r.month)], ["Revenue", (r) => num(r.revenue)], ["Direct costs", (r) => num(r.directCosts)],
          ["Gross profit", (r) => num(r.grossProfit)], ["Operating costs", (r) => num(r.operatingCosts)], ["Other income", (r) => num(r.otherIncome)],
          ["Net profit", (r) => <span className={(r.netProfit ?? 0) < 0 ? "text-orange-600 dark:text-orange-400" : ""}>{num(r.netProfit)}</span>],
          ["Cash", (r) => num(r.cash)], ["Funding raised", (r) => num(r.fundingRaised)], ["Headcount", (r) => num(r.headcount)]]} />
      </Card>
    </div>
  )
}

function UnitTab({ d, money }: { d: Overview; money: (v?: number | null) => string }) {
  const k = d.kpis
  const rev = d.series.reduce((a, r) => a + (r.revenue ?? 0), 0)
  const gross = d.series.reduce((a, r) => a + (r.grossProfit ?? 0), 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Take rate" value={k.takeRate != null ? `${k.takeRate.toFixed(2)}%` : "—"} sub="Revenue ÷ payment volume, 30 days" />
        <Kpi label="Revenue per active user" value={money(k.arpu)} sub="30 days" />
        <Kpi label="Average payment" value={money(k.avgTicket)} sub="30 days" />
        <Kpi label="Gross margin" value={rev ? `${(gross / rev * 100).toFixed(1)}%` : "—"} sub={`Over the period shown`} />
      </div>
      <Card title="Revenue by product" note="Over the period shown.">
        {d.revenueStreams.length ? (
          <Chart height={Math.max(160, d.revenueStreams.length * 34)}><BarChart data={d.revenueStreams} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid horizontal={false} stroke={GRID} /><XAxis type="number" tickFormatter={num} {...axis} /><YAxis type="category" dataKey="stream" {...axis} width={104}
              tickFormatter={(s: string) => s.replace(/_/g, " ")} />
            <Tooltip formatter={(v: number) => money(v)} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="amount" name="Revenue" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={22} /></BarChart></Chart>
        ) : <p className="text-sm text-muted-foreground">No revenue recorded in this period yet.</p>}
      </Card>
    </div>
  )
}

function MarketsTab({ d }: { d: Overview }) {
  const max = Math.max(1, ...d.cohorts.flatMap((c) => c.retention.map((v) => v ?? 0)))
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Customers by country">
        <Chart height={Math.max(180, d.markets.length * 30)}><BarChart data={d.markets} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid horizontal={false} stroke={GRID} /><XAxis type="number" tickFormatter={num} {...axis} /><YAxis type="category" dataKey="country" {...axis} width={70} />
          <Tooltip cursor={{ fill: "var(--muted)" }} /><Bar dataKey="users" name="Customers" fill={BLUE} radius={[0, 4, 4, 0]} maxBarSize={20} /></BarChart></Chart>
      </Card>
      <Card title="Retention by signup month" note="Share of each month's new customers who made a payment in each later month. Darker is higher.">
        <div className="overflow-x-auto">
          <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
            <thead><tr><th className="text-left pr-2 font-medium text-muted-foreground">Cohort</th><th className="pr-2 font-medium text-muted-foreground">Size</th>
              {d.cohorts.map((_, i) => <th key={i} className="font-medium text-muted-foreground px-1">M{i}</th>)}</tr></thead>
            <tbody>{d.cohorts.map((c) => (
              <tr key={c.cohort}><td className="pr-2 whitespace-nowrap">{monthLabel(c.cohort)}</td><td className="pr-2 tabular-nums">{num(c.size)}</td>
                {c.retention.map((v, i) => <td key={i} title={v == null ? "No customers" : `${v}%`} className="w-11 h-8 text-center rounded tabular-nums"
                  style={{ background: v == null ? "transparent" : `color-mix(in oklab, ${BLUE} ${Math.round(12 + (v / max) * 80)}%, transparent)`,
                           color: v != null && v / max > 0.55 ? "#fff" : undefined }}>{v == null ? "" : `${Math.round(v)}%`}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function UpdatesTab() {
  const q = useQuery({ queryKey: ["updates"], queryFn: async () => (await boardApi.get<Update[]>("/updates")).data })
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!q.data?.length) return <p className="text-muted-foreground">No investor updates yet.</p>
  return (
    <div className="space-y-4 max-w-3xl">
      {q.data.map((u) => (
        <article key={u.id} className="bg-card border border-border rounded-2xl p-5">
          <p className="text-xs text-muted-foreground">{u.period ?? ""}{u.publishedAt ? ` · ${new Date(u.publishedAt).toLocaleDateString()}` : ""}</p>
          <h2 className="text-lg font-semibold mt-1">{u.title}</h2>
          <div className="text-sm mt-3 whitespace-pre-wrap leading-relaxed">{u.body}</div>
        </article>
      ))}
    </div>
  )
}

function Table<T>({ rows, cols }: { rows: T[]; cols: [string, (r: T) => ReactNode][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">{cols.map(([h]) => <th key={h} className="text-left font-medium text-muted-foreground py-2 pr-4 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{[...rows].reverse().map((r, i) => <tr key={i} className="border-b border-border/60">{cols.map(([h, f]) => <td key={h} className="py-2 pr-4 tabular-nums whitespace-nowrap">{f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
