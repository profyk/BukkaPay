"use client"

import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Button, Card, Empty, Input, Notice, PageHeader, Stat, Table } from "@/components/ui"

type Customer = { name: string; bukkapay: boolean; payments: number; total: string; average: string; firstAt: string | null; lastAt: string | null }
type Report = {
  currency: string; days: number
  summary: { customers: number; repeatCustomers: number; repeatRate: number; newLast30Days: number; averageSpend: string; topShare: number }
  customers: Customer[]
}

const RANGES = [30, 90, 365] as const

/** Customers: who buys, how often and how much. Built from completed
 *  payments only (refunds and failed payments don't count). */
export default function CustomersPage() {
  const { id } = useParams<{ id: string }>()
  const [days, setDays] = useState<number>(90)
  const [q, setQ] = useState("")
  const { data, error, loading } = useData<Report>(`/merchants/${id}/customers?days=${days}`)
  const rows = useMemo(() => (data?.customers ?? []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q])
  const ccy = data?.currency

  const exportCsv = () => {
    if (!data) return
    const head = ["Customer", "BukkaPay customer", "Payments", "Total", "Average", "First purchase", "Last purchase"]
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines = [head, ...data.customers.map((c) => [c.name, c.bukkapay ? "yes" : "no", c.payments, c.total, c.average, c.firstAt ?? "", c.lastAt ?? ""])]
    const blob = new Blob([lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `customers-${days}d.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <PageHeader title="Customers" subtitle="Who buys from you, how often and how much. From completed payments only."
        actions={<div className="flex gap-2">
          {RANGES.map((d) => <Button key={d} variant={days === d ? "primary" : "secondary"} onClick={() => setDays(d)}>{d === 365 ? "1 year" : `${d} days`}</Button>)}
          <Button variant="ghost" onClick={exportCsv} disabled={!data?.customers.length}>Export CSV</Button>
        </div>} />
      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data ? <p className="text-sm text-ink-muted">Loading…</p> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Stat label="Customers" value={data.summary.customers} sub={`${data.summary.newLast30Days} new in the last 30 days`} />
            <Stat label="Come back" value={`${data.summary.repeatRate}%`} sub={`${data.summary.repeatCustomers} repeat customers`} />
            <Stat label="Average spend" value={money(data.summary.averageSpend, ccy)} sub="per customer" />
            <Stat label="Top 10 customers" value={`${data.summary.topShare}%`} sub="of your sales" />
          </div>
          {data.summary.customers > 0 && data.summary.repeatRate < 20 && (
            <div className="mb-6"><Notice>Most customers buy once. A printed QR code at the till and a loyalty discount on a checkout link are simple ways to bring them back.</Notice></div>
          )}
          <Card className="mb-4"><Input placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" /></Card>
          {!rows.length ? <Empty>{q ? "No customers match." : "No completed payments in this period yet."}</Empty> : (
            <Table head={["Customer", "Payments", "Total", "Average", "First", "Last"]}>
              {rows.map((c, i) => (
                <tr key={`${c.name}-${i}`} className="border-t border-line dark:border-white/10">
                  <td className="px-4 py-3"><span className="font-medium">{c.name}</span>{c.bukkapay && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/10">BukkaPay</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{c.payments}{c.payments > 1 && <span className="ml-1 text-xs text-emerald-600">repeat</span>}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{money(c.total, ccy)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(c.average, ccy)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{when(c.firstAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{when(c.lastAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  )
}
