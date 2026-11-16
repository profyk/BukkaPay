"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Bill = {
  id: string; merchantId: string; billerName: string; billType: string; description: string | null; amount: string
  currency: string; accountNumber: string | null; billingPeriod: string | null; dueDate: string | null; status: string
  totalCollected: string; paymentCount: number; payUrl: string | null; createdAt: string
}

/** Bills customers pay in the BukkaPay app (school fees, utilities, levies,
 *  subscriptions). Payments settle to this business — moved here from the
 *  customer app's "Billing links". */
export default function BillingPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const { data, error, reload } = useData<Bill[]>("/billing-links")
  const bills = (data ?? []).filter((b) => b.merchantId === id)
  const [form, setForm] = useState({ billerName: "", billType: "other", description: "", amount: "", accountNumber: "", billingPeriod: "", dueDate: "" })
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  const create = async () => {
    setMsg(null)
    try {
      const bill = await api<Bill>("/billing-links", {
        method: "POST",
        json: {
          merchantId: id, currency: merchant?.currency, billerName: form.billerName, billType: form.billType,
          amount: form.amount, description: form.description || undefined, accountNumber: form.accountNumber || undefined,
          billingPeriod: form.billingPeriod || undefined, dueDate: form.dueDate || undefined,
        },
      })
      if (bill.payUrl) await navigator.clipboard?.writeText(bill.payUrl).catch(() => undefined)
      setForm({ billerName: "", billType: "other", description: "", amount: "", accountNumber: "", billingPeriod: "", dueDate: "" })
      setMsg({ tone: "success", text: bill.payUrl ? `Bill created and link copied: ${bill.payUrl}` : "Bill created" })
      reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const setStatus = async (b: Bill, status: string) => {
    try { await api(`/billing-links/${b.id}/status`, { method: "PATCH", json: { status } }); reload() }
    catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  return (
    <>
      <PageHeader title="Bills" subtitle="Send a bill your customers pay from their BukkaPay wallet or by bank. Payments settle to this business's balance." />
      <Card className="mb-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Bill name"><Input placeholder="e.g. Term 1 school fees" value={form.billerName} onChange={(e) => setForm({ ...form, billerName: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.billType} onChange={(e) => setForm({ ...form, billType: e.target.value })}>
              {["school", "utility", "levy", "subscription", "medical", "other"].map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label={`Amount (${merchant?.currency ?? ""})`}><Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Customer account number (optional)"><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></Field>
          <Field label="Period (optional)"><Input placeholder="e.g. March 2027" value={form.billingPeriod} onChange={(e) => setForm({ ...form, billingPeriod: e.target.value })} /></Field>
          <Field label="Due date (optional)"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
        <Button className="mt-4" disabled={!form.billerName || !form.amount} onClick={create}>Create bill</Button>
      </Card>
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {error && <Notice tone="error">{error}</Notice>}
      {!bills.length ? <Empty>No bills yet.</Empty> : (
        <Table head={["Created", "Bill", "Amount", "Collected", "Payments", "Due", "Status", ""]}>
          {bills.map((b) => (
            <tr key={b.id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(b.createdAt)}</td>
              <td className="px-4 py-3">{b.billerName}{b.billingPeriod ? ` · ${b.billingPeriod}` : ""}</td>
              <td className="px-4 py-3 tabular-nums">{money(b.amount, b.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(b.totalCollected, b.currency)}</td>
              <td className="px-4 py-3">{b.paymentCount}</td>
              <td className="px-4 py-3 whitespace-nowrap">{when(b.dueDate)}</td>
              <td className="px-4 py-3"><Badge value={b.status} /></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {b.payUrl && <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(b.payUrl!)}>Copy link</Button>}
                {b.status === "active" && <Button variant="ghost" onClick={() => setStatus(b, "paused")}>Pause</Button>}
                {b.status === "paused" && <Button variant="ghost" onClick={() => setStatus(b, "active")}>Resume</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
