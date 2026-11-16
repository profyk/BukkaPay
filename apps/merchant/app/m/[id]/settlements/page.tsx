"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Payout = { id: string; amount: string; fee: string; status: string; settlementStatus: string; providerReference?: string; currency: string; createdAt: string }
type Bank = { id: string; name: string }
type MerchantDetail = { bankId?: string; bankName?: string; accountHolder?: string; accountNumber?: string; accountType?: string }

export default function SettlementsPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const payouts = useData<Payout[]>(`/merchants/${id}/settlements`)
  const dash = useData<{ settlement: { balances: { currency: string; available: string }[] } }>(`/merchants/${id}/dashboard`)
  const banks = useData<Bank[]>(`/merchants/banks`)
  const detail = useData<MerchantDetail>(`/merchants/${id}`)
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [bank, setBank] = useState<MerchantDetail>({})
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  const withdraw = async () => {
    setMsg(null)
    try {
      const r = await api<{ message: string; fee?: string }>(`/merchants/${id}/withdraw`, { method: "POST", json: { amount, pin } })
      setMsg({ tone: "success", text: `${r.message}${r.fee ? ` Payout fee: ${money(r.fee, merchant?.currency)}.` : ""}` })
      setAmount(""); setPin("")
      payouts.reload(); dash.reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const saveBank = async () => {
    setMsg(null)
    try {
      await api(`/merchants/${id}/banking`, { method: "PATCH", json: { ...detail.data, ...bank } })
      setMsg({ tone: "success", text: "Banking details saved." })
      detail.reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const balance = dash.data?.settlement.balances.find((b) => b.currency === merchant?.currency)

  return (
    <>
      <PageHeader title="Settlements" subtitle="Payouts move your available balance to your bank account through BukkaPay's settlement partner. A payout shows as settled only once the bank confirms it." />
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <div className="grid lg:grid-cols-2 gap-4 mb-8">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Available</p>
          <p className="font-display text-3xl font-semibold tabular-nums mt-1">{money(balance?.available, merchant?.currency)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Amount"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Transaction PIN"><Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
          </div>
          <Button className="mt-4" disabled={!amount || !pin} onClick={withdraw}>Pay out to bank</Button>
          <p className="mt-2 text-xs text-ink-muted">To {detail.data?.bankName ?? "—"} ····{(detail.data?.accountNumber ?? "").slice(-4)}</p>
        </Card>
        <Card>
          <p className="font-semibold mb-3">Payout bank account</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank">
              <Select value={bank.bankId ?? detail.data?.bankId ?? ""} onChange={(e) => setBank({ ...bank, bankId: e.target.value })}>
                <option value="">Choose…</option>
                {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Account type">
              <Select value={bank.accountType ?? detail.data?.accountType ?? "savings"} onChange={(e) => setBank({ ...bank, accountType: e.target.value })}>
                <option value="savings">Savings</option><option value="current">Current / cheque</option>
              </Select>
            </Field>
            <Field label="Account holder"><Input defaultValue={detail.data?.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} /></Field>
            <Field label="Account number"><Input inputMode="numeric" defaultValue={detail.data?.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></Field>
          </div>
          <Button variant="secondary" className="mt-4" onClick={saveBank}>Save bank account</Button>
        </Card>
      </div>
      <h2 className="font-semibold mb-3">Payout history</h2>
      {!payouts.data?.length ? <Empty>No payouts yet.</Empty> : (
        <Table head={["Requested", "Amount", "Fee", "Settlement", "Reference"]}>
          {payouts.data.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(p.createdAt)}</td>
              <td className="px-4 py-3 tabular-nums">{money(p.amount, p.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(p.fee, p.currency)}</td>
              <td className="px-4 py-3"><Badge value={p.settlementStatus} /></td>
              <td className="px-4 py-3 font-mono text-xs">{p.providerReference ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
