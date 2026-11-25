"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api, API_URL, getToken } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Empty, Field, Input, Modal, Notice, PageHeader, Select, Table, PasswordInput } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Tx = { id: string; type: string; status: string; amount: string; payerName?: string; reference?: string; createdAt: string }

export default function TransactionsPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const [q, setQ] = useState("")
  const [type, setType] = useState("")
  const [status, setStatus] = useState("")
  const params = new URLSearchParams(Object.entries({ q, type, status }).filter(([, v]) => v) as [string, string][])
  const { data, error, loading, reload } = useData<{ transactions: Tx[]; total: number }>(`/merchants/${id}/transactions/search?${params}`)
  const [refunding, setRefunding] = useState<Tx | null>(null)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [pin, setPin] = useState("")
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  const exportCsv = async () => {
    const res = await fetch(`${API_URL}/api/v1/merchants/${id}/transactions.csv`, { headers: { Authorization: `Bearer ${getToken()}` } })
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement("a")
    a.href = url
    a.download = `bukkapay-transactions.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const refund = async () => {
    try {
      await api(`/merchants/${id}/transactions/${refunding!.id}/refund`, { method: "POST", json: { amount: amount || undefined, reason, pin } })
      setMsg({ tone: "success", text: "Refund sent to the customer's wallet." })
      setRefunding(null)
      reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  return (
    <>
      <PageHeader title="Transactions" subtitle="Search payments, refunds and payouts. Refunds go straight back to the customer's BukkaPay wallet."
        actions={can(merchant?.role, "finance") ? <Button variant="secondary" onClick={exportCsv}>Export CSV</Button> : null} />
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Input placeholder="Search customer or reference" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option><option value="payment">Payments</option><option value="refund">Refunds</option><option value="withdrawal">Payouts</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option>
        </Select>
      </div>
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : !data?.transactions.length ? <Empty>No transactions match.</Empty> : (
        <Table head={["When", "Type", "Customer", "Amount", "Status", "Reference", ""]}>
          {data.transactions.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(t.createdAt)}</td>
              <td className="px-4 py-3"><Badge value={t.type === "refund" ? "refund" : undefined} />{t.type !== "refund" && <span className="capitalize">{t.type}</span>}</td>
              <td className="px-4 py-3">{t.payerName ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{money(t.amount, merchant?.currency)}</td>
              <td className="px-4 py-3"><Badge value={t.status} /></td>
              <td className="px-4 py-3 font-mono text-xs">{t.reference ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                {t.type === "payment" && t.status === "completed" && can(merchant?.role, "refund") && (
                  <Button variant="ghost" onClick={() => { setRefunding(t); setAmount(""); setReason(""); setPin("") }}>Refund</Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!refunding} title="Refund payment" onClose={() => setRefunding(null)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Original amount {money(refunding?.amount, merchant?.currency)}. Leave the amount empty for a full refund.</p>
          <Field label="Amount (optional)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Your transaction PIN"><PasswordInput inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
          <Button className="w-full" disabled={!reason || !pin} onClick={refund}>Send refund</Button>
        </div>
      </Modal>
    </>
  )
}
