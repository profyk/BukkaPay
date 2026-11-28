"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table, PasswordInput } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"
import { can } from "@/lib/hooks"

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
  const [bank, setBank] = useState({ bankId: "", accountType: "savings", accountHolder: "", accountNumber: "", confirm: "", pin: "" })
  const [editingBank, setEditingBank] = useState(false)
  const digits = bank.accountNumber.replace(/[\s-]/g, "")
  const bankError = !bank.bankId ? "Choose the bank." : bank.accountHolder.trim().length < 2 ? "Enter the account holder's name."
    : !/^\d{6,17}$/.test(digits) ? "Account numbers are 6 to 17 digits." : digits !== bank.confirm.replace(/[\s-]/g, "") ? "The account numbers don't match."
    : !bank.pin ? "Enter your transaction PIN." : null
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
    if (bankError) return
    setMsg(null)
    try {
      // Only the bank fields, never the masked number we display.
      await api(`/merchants/${id}/banking`, { method: "PATCH", json: {
        bankId: bank.bankId, accountType: bank.accountType, accountHolder: bank.accountHolder.trim(), accountNumber: digits, pin: bank.pin } })
      setMsg({ tone: "success", text: "Payout bank account updated. We've sent you a notification as a security check." })
      setBank({ bankId: "", accountType: "savings", accountHolder: "", accountNumber: "", confirm: "", pin: "" }); setEditingBank(false)
      detail.reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); setBank((b) => ({ ...b, pin: "" })) }
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
            <Field label="Transaction PIN"><PasswordInput inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
          </div>
          <Button className="mt-4" disabled={!amount || !pin} onClick={withdraw}>Pay out to bank</Button>
          <p className="mt-2 text-xs text-ink-muted">To {detail.data?.bankName ?? "—"} ····{(detail.data?.accountNumber ?? "").slice(-4)}</p>
        </Card>
        <Card>
          <p className="font-semibold mb-3">Payout bank account</p>
          {!editingBank ? (
            <>
              {detail.data?.bankName ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-ink-muted">Bank</dt><dd className="font-medium">{detail.data.bankName}</dd></div>
                  <div><dt className="text-xs text-ink-muted">Account</dt><dd className="font-medium font-mono">····{(detail.data.accountNumber ?? "").slice(-4)}</dd></div>
                  <div><dt className="text-xs text-ink-muted">Holder</dt><dd className="font-medium">{detail.data.accountHolder}</dd></div>
                  <div><dt className="text-xs text-ink-muted">Type</dt><dd className="font-medium capitalize">{detail.data.accountType}</dd></div>
                </dl>
              ) : <p className="text-sm text-ink-muted">No payout account yet. Add one to withdraw your sales.</p>}
              {can(merchant?.role, "owner")
                ? <Button variant="secondary" className="mt-4" onClick={() => setEditingBank(true)}>{detail.data?.bankName ? "Change account" : "Add bank account"}</Button>
                : <p className="mt-4 text-xs text-ink-muted">Only the owner can change where payouts go.</p>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bank">
                  <Select value={bank.bankId} onChange={(e) => setBank({ ...bank, bankId: e.target.value })}>
                    <option value="">Choose…</option>
                    {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
                <Field label="Account type">
                  <Select value={bank.accountType} onChange={(e) => setBank({ ...bank, accountType: e.target.value })}>
                    <option value="savings">Savings</option><option value="cheque">Cheque</option><option value="current">Current</option>
                    <option value="business">Business</option><option value="transmission">Transmission</option>
                  </Select>
                </Field>
                <div className="col-span-2"><Field label="Account holder" hint="Exactly as the bank has it."><Input autoComplete="off" value={bank.accountHolder} onChange={(e) => setBank({ ...bank, accountHolder: e.target.value })} /></Field></div>
                <Field label="Account number"><Input inputMode="numeric" autoComplete="off" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} /></Field>
                <Field label="Type it again"><Input inputMode="numeric" autoComplete="off" onPaste={(e) => e.preventDefault()} value={bank.confirm} onChange={(e) => setBank({ ...bank, confirm: e.target.value })} /></Field>
                <div className="col-span-2"><Field label="Transaction PIN" hint="Required to change where your money goes."><PasswordInput inputMode="numeric" value={bank.pin} onChange={(e) => setBank({ ...bank, pin: e.target.value })} /></Field></div>
              </div>
              {bankError && (bank.accountNumber || bank.confirm || bank.pin) && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{bankError}</p>}
              <div className="mt-4 flex gap-2">
                <Button onClick={saveBank} disabled={!!bankError}>Save bank account</Button>
                <Button variant="ghost" onClick={() => setEditingBank(false)}>Cancel</Button>
              </div>
            </>
          )}
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
