import { useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { DataTable, Page, Section, money } from "@/components/network/kit"
import { useApi } from "@/components/network/kit"

/* Validated reference palette (dataviz skill): slot 1 blue, slot 2 orange; chrome inks. */
const C = { s1: "#2a78d6", s2: "#eb6834", grid: "#e1e0d9", axis: "#898781", ink: "#0b0b0b", good: "#006300", bad: "#d03b3b" }

type Daily = { date: string; amount: string }
type Analytics = {
  days: number
  kpis: { users: number; newUsers: number; newUsersChange: number | null; activeUsers: number; activeUsersChange: number | null
          activationRate: number; merchants: number; activeMerchants: number }
  growth: { date: string; signups: number; activeUsers: number }[]
  volume: { currency: string; total: string; count: number; daily: Daily[] }[]
  revenue: { currency: string; total: string; daily: Daily[] }[]
  countries: { country: string; users: number }[]
  kyc: { level: number; users: number }[]
  accountTypes: { type: string; users: number }[]
  categories: { category: string; count: number }[]
  agents: { kind: string; currency: string; amount: string; count: number }[]
}

const KYC_LABELS = ["Signed up", "Contact verified", "ID verified", "Enhanced"]
const short = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })
const compact = (n: number) => Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading, error } = useApi<Analytics>(["platform-analytics", days], "/admin/analytics", { days })
  const [ccy, setCcy] = useState<string | null>(null)
  const vol = data?.volume.find((v) => v.currency === (ccy ?? data?.volume[0]?.currency))
  const rev = data?.revenue.find((r) => r.currency === (ccy ?? data?.volume[0]?.currency ?? data?.revenue[0]?.currency))
  const currencies = useMemo(() => [...new Set([...(data?.volume ?? []).map((v) => v.currency), ...(data?.revenue ?? []).map((r) => r.currency)])], [data])

  return (
    <Page
      title="Growth & analytics"
      subtitle="Who joins, who stays active, how much money moves and what BukkaPay earns, per currency. Every number is aggregated on the server from the ledger and transactions."
      actions={<div className="flex gap-2">{[7, 30, 90, 365].map((d) => (
        <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d === 365 ? "1 year" : `${d} days`}</Button>
      ))}</div>}
    >
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Couldn't load analytics.</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Customers" value={compact(data.kpis.users)} />
            <Kpi label={`New in ${days} days`} value={compact(data.kpis.newUsers)} change={data.kpis.newUsersChange} />
            <Kpi label="Active (transacted)" value={compact(data.kpis.activeUsers)} change={data.kpis.activeUsersChange}
                 sub={`${data.kpis.activationRate}% of all customers`} />
            <Kpi label="Merchants" value={compact(data.kpis.merchants)} sub={`${data.kpis.activeMerchants} took payments`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartCard title="New customers per day">
              <BarChart data={data.growth} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={short} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} labelFormatter={short} formatter={(v: number) => [v, "New customers"]} />
                <Bar dataKey="signups" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ChartCard>
            <ChartCard title="Customers who transacted, per day">
              <LineChart data={data.growth} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={short} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip labelFormatter={short} formatter={(v: number) => [v, "Active customers"]} />
                <Line dataKey="activeUsers" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ChartCard>
          </div>

          <Section title="Money moved and revenue" actions={
            <div className="flex gap-2">{currencies.map((c) => (
              <Button key={c} size="sm" variant={(ccy ?? currencies[0]) === c ? "default" : "outline"} onClick={() => setCcy(c)}>{c}</Button>
            ))}</div>
          }>
            <div className="grid lg:grid-cols-2 gap-4">
              <ChartCard title={`Customer spending (${vol?.currency ?? "—"})`} sub={vol ? `${money(vol.total, vol.currency)} · ${vol.count.toLocaleString()} payments` : "No payments yet"}>
                <AreaChart data={(vol?.daily ?? []).map((d) => ({ ...d, v: Number(d.amount) }))} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs><linearGradient id="vol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.s1} stopOpacity={0.25} /><stop offset="100%" stopColor={C.s1} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={short} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip labelFormatter={short} formatter={(v: number) => [money(v, vol?.currency), "Spent"]} />
                  <Area dataKey="v" stroke={C.s1} strokeWidth={2} fill="url(#vol)" />
                </AreaChart>
              </ChartCard>
              <ChartCard title={`Net revenue (${rev?.currency ?? "—"})`} sub={rev ? `${money(rev.total, rev.currency)} after agent commissions` : "No revenue yet"}>
                <BarChart data={(rev?.daily ?? []).map((d) => ({ ...d, v: Number(d.amount) }))} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={short} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={compact} tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} labelFormatter={short} formatter={(v: number) => [money(v, rev?.currency), "Revenue"]} />
                  <Bar dataKey="v" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ChartCard>
            </div>
          </Section>

          <div className="grid lg:grid-cols-3 gap-4">
            <RankCard title="Customers by country" rows={data.countries.map((c) => ({ label: c.country, value: c.users }))} />
            <RankCard title="Verification funnel" ordered rows={data.kyc.map((k) => ({ label: KYC_LABELS[k.level] ?? `Level ${k.level}`, value: k.users }))} />
            <RankCard title="What customers pay for (count)" rows={data.categories.map((c) => ({ label: c.category.replace(/_/g, " "), value: c.count }))} />
          </div>

          <Section title="Cash agents">
            <DataTable
              rows={data.agents} rowKey={(a) => `${a.kind}-${a.currency}`} empty="No agent cash activity in this period."
              columns={[
                { header: "Type", cell: (a) => a.kind === "cash_in" ? "Cash deposits" : "Cash withdrawals" },
                { header: "Transactions", cell: (a) => a.count.toLocaleString() },
                { header: "Amount", className: "text-right", cell: (a) => money(a.amount, a.currency) },
              ]}
            />
          </Section>
        </>
      )}
    </Page>
  )
}

function Kpi({ label, value, change, sub }: { label: string; value: string; change?: number | null; sub?: string }) {
  const up = (change ?? 0) > 0, down = (change ?? 0) < 0
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {change !== undefined && (
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: up ? C.good : down ? C.bad : C.axis }}>
          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : down ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          {change === null ? "No earlier data" : `${Math.abs(change)}% vs previous period`}
        </p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactElement }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="font-semibold">{title}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="h-56 mt-3"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  )
}

function RankCard({ title, rows, ordered }: { title: string; rows: { label: string; value: number }[]; ordered?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
      <p className="font-semibold">{title}</p>
      {!rows.length && <p className="text-sm text-muted-foreground">No data yet.</p>}
      {rows.map((r) => (
        <div key={r.label} className="text-sm">
          <div className="flex justify-between"><span className="capitalize">{r.label}</span><span className="tabular-nums text-muted-foreground">{r.value.toLocaleString()}</span></div>
          <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: C.s1, opacity: ordered ? 1 : 0.9 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
