"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useData } from "@/lib/hooks"
import { money } from "@/lib/format"
import { Card, Empty, Notice, PageHeader, Stat, Table } from "@/components/ui"
import { AreaChart, BarChart } from "@/components/charts"

type Analytics = {
  currency: string; days: number; timezone: string
  totals: { sales: string; count: number; averageTicket: string; customers: number; repeatCustomers: number
            refunds: string; net: string; salesChange: number | null; countChange: number | null; customersChange: number | null }
  daily: { date: string; sales: string; count: number }[]
  hours: { hour: number; sales: string; count: number }[]
  weekdays: { day: number; sales: string; count: number }[]
  topCustomers: { name: string; amount: string; count: number }[]
  insights: { tone: string; text: string }[]
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const compact = (n: number) => Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)

export default function InsightsPage() {
  const { id } = useParams<{ id: string }>()
  const [days, setDays] = useState(30)
  const { data, error, loading } = useData<Analytics>(`/merchants/${id}/insights?days=${days}`)
  const a = data

  return (
    <>
      <PageHeader title="Insights" subtitle="How your business is doing: sales, busiest times and your best customers. Times are local to your country." actions={
        <div className="flex gap-1">{[7, 30, 90, 365].map((d) => (
          <button key={d} onClick={() => setDays(d)}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium ${days === d ? "bg-brand-600 text-white" : "bg-surface text-ink-soft hover:bg-brand-50"}`}>
            {d === 365 ? "1 year" : `${d} days`}
          </button>
        ))}</div>
      } />
      {error && <Notice tone="error">{error}</Notice>}
      {loading && !a && <p className="text-sm text-ink-muted">Loading…</p>}
      {a && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Sales" value={money(a.totals.sales, a.currency)} sub={<Change v={a.totals.salesChange} />} />
            <Stat label="Payments" value={a.totals.count.toLocaleString()} sub={<Change v={a.totals.countChange} />} />
            <Stat label="Average sale" value={money(a.totals.averageTicket, a.currency)} />
            <Stat label="Customers" value={a.totals.customers.toLocaleString()}
                  sub={`${a.totals.repeatCustomers} came back · refunds ${money(a.totals.refunds, a.currency)}`} />
          </div>

          {!!a.insights.length && (
            <div className="grid md:grid-cols-2 gap-3">
              {a.insights.map((i) => (
                <div key={i.text} className={`rounded-2xl border px-4 py-3 text-sm ${i.tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : i.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-white text-ink-soft"}`}>
                  <span className="font-semibold mr-1">{i.tone === "good" ? "▲" : i.tone === "warn" ? "!" : "ℹ"}</span>{i.text}
                </div>
              ))}
            </div>
          )}

          <Card>
            <p className="font-semibold">Sales per day</p>
            <p className="text-xs text-ink-muted mb-2">Completed payments. Refunds are shown separately above.</p>
            <AreaChart
              data={a.daily.map((d) => ({ label: new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
                                          value: Number(d.sales), tip: `${new Date(d.date).toLocaleDateString()}: ${money(d.sales, a.currency)} · ${d.count} payments` }))}
              format={compact} every={Math.max(1, Math.round(a.daily.length / 6))}
            />
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <p className="font-semibold">Busiest hours</p>
              <p className="text-xs text-ink-muted mb-2">Number of payments by hour of day</p>
              <BarChart data={a.hours.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.count,
                                                    tip: `${String(h.hour).padStart(2, "0")}:00 · ${h.count} payments · ${money(h.sales, a.currency)}` }))}
                        every={3} />
            </Card>
            <Card>
              <p className="font-semibold">Busiest days</p>
              <p className="text-xs text-ink-muted mb-2">Sales by day of the week</p>
              <BarChart data={a.weekdays.map((d) => ({ label: WEEKDAYS[d.day - 1], value: Number(d.sales),
                                                       tip: `${WEEKDAYS[d.day - 1]}: ${money(d.sales, a.currency)} · ${d.count} payments` }))}
                        format={compact} />
            </Card>
          </div>

          <Card>
            <p className="font-semibold mb-3">Top customers</p>
            {!a.topCustomers.length ? <Empty>No customer payments yet.</Empty> : (
              <Table head={["Customer", "Payments", "Spent"]}>
                {a.topCustomers.map((c) => (
                  <tr key={c.name}><td>{c.name}</td><td className="tabular-nums">{c.count}</td><td className="tabular-nums">{money(c.amount, a.currency)}</td></tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

function Change({ v }: { v: number | null }) {
  if (v === null) return <span className="text-ink-muted">No earlier data</span>
  const up = v >= 0
  return <span className={up ? "text-emerald-700" : "text-red-600"}>{up ? "▲" : "▼"} {Math.abs(v)}% vs previous</span>
}
