"use client"

import { useParams } from "next/navigation"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Card, Empty, Notice, PageHeader, Stat, Table } from "@/components/ui"
import { GettingStarted } from "@/components/getting-started"

type Dashboard = {
  currency: string
  totals: Record<string, string | number>
  settlement: { balances: { currency: string; available: string }[]; payoutsPending: string; paidOut: string }
  daily: { date: string; sales: string; count: number }[]
  recent: { id: string; type: string; status: string; amount: string; payerName?: string; reference?: string; createdAt: string }[]
}

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, loading } = useData<Dashboard>(`/merchants/${id}/dashboard`)
  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return null
  const t = data.totals
  const c = data.currency
  const max = Math.max(1, ...data.daily.map((d) => Number(d.sales)))

  return (
    <>
      <PageHeader title="Overview" subtitle={`All amounts in ${c}. Balances come straight from the BukkaPay ledger.`} />
      <GettingStarted id={id} payments={Number(t.transactionCount ?? 0)} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Today" value={money(t.todaySales, c)} sub={`${t.todayCount} payments`} />
        <Stat label="This month" value={money(t.monthSales, c)} sub={`${t.monthCount} payments`} />
        <Stat label="All time" value={money(t.totalSales, c)} sub={`${t.transactionCount} payments · ${t.uniqueCustomers} customers`} />
        <Stat label="Fees paid" value={money(t.feesPaid, c)} />
        <Stat label="Refunds" value={money(t.refunds, c)} sub={`${t.refundCount} refunds`} />
        <Stat label="Pending" value={money(t.pendingPayments, c)} sub={`${t.pendingCount} pending`} />
        <Stat label="Failed" value={money(t.failedPayments, c)} sub={`${t.failedCount} failed`} />
        <Stat label="Paid out" value={money(data.settlement.paidOut, c)} sub={`${money(data.settlement.payoutsPending, c)} on the way`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2">
          <p className="font-semibold mb-4">Sales, last 30 days</p>
          {data.daily.length ? (
            <div className="flex items-end gap-1 h-40" role="img" aria-label="Daily sales bar chart">
              {data.daily.map((d) => (
                <div key={d.date} className="flex-1 group relative">
                  <div className="bg-brand-500 rounded-t-md hover:bg-brand-700" style={{ height: `${(Number(d.sales) / max) * 150}px` }} />
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded bg-ink px-2 py-1 text-[10px] text-white">
                    {d.date}: {money(d.sales, c)}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty>No sales yet.</Empty>}
        </Card>
        <Card>
          <p className="font-semibold mb-3">Available balance</p>
          {data.settlement.balances.map((b) => (
            <p key={b.currency} className="font-display text-3xl font-semibold tabular-nums">{money(b.available, b.currency)}</p>
          ))}
          <p className="text-xs text-ink-muted mt-2">Available to pay out to your bank account. Pending payouts are shown as pending until the bank confirms.</p>
        </Card>
      </div>

      <h2 className="font-semibold mt-8 mb-3">Recent activity</h2>
      {data.recent.length ? (
        <Table head={["When", "Type", "Customer", "Amount", "Status", "Reference"]}>
          {data.recent.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(r.createdAt)}</td>
              <td className="px-4 py-3 capitalize">{r.type}</td>
              <td className="px-4 py-3">{r.payerName ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{money(r.amount, c)}</td>
              <td className="px-4 py-3"><Badge value={r.status} /></td>
              <td className="px-4 py-3 font-mono text-xs">{r.reference ?? "—"}</td>
            </tr>
          ))}
        </Table>
      ) : <Empty>No activity yet.</Empty>}
    </>
  )
}
