"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Stat, Table, PasswordInput } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Agent = {
  id: string; name: string; address: string; city?: string; country: string; currency: string; phone?: string
  openingHours?: string; latitude?: string; longitude?: string; status: string; dailyLimit: string; approvedAt?: string
}
type AgentInfo = { agent: Agent | null; eligible?: boolean; float?: string; todayVolume?: string }
type Tx = {
  id: string; reference: string; kind: string; status: string; currency: string; amount: string; fee: string
  commission: string; createdAt: string; completedAt?: string; customerName?: string
}

export default function AgentPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const info = useData<AgentInfo>(`/merchants/${id}/agent`)
  const agent = info.data?.agent
  const txs = useData<Tx[]>(agent ? `/merchants/${id}/agent/transactions` : null)
  const reloadAll = () => { info.reload(); txs.reload() }
  const [editing, setEditing] = useState(false)

  return (
    <>
      <PageHeader
        title="Cash agent"
        subtitle="Serve BukkaPay customers with cash. Cash-in: a customer gives you cash and you send it to their wallet from your balance (you earn a commission). Cash-out: a customer shows a one-time code and you hand over cash (you keep part of their fee)."
      />
      {info.error && <Notice tone="error">{info.error}</Notice>}
      {info.data && !agent && (
        info.data.eligible
          ? (can(merchant?.role, "settings") ? <ApplyForm id={id} onDone={reloadAll} /> : <Notice tone="info">Ask the business owner or an admin to apply.</Notice>)
          : <Notice tone="warn">Complete business verification first. Only verified businesses can become cash agents.</Notice>
      )}
      {agent && (
        <div className="space-y-6">
          {agent.status === "pending" && <Notice tone="info">Your application is with BukkaPay for review. You can start serving customers once it's approved.</Notice>}
          {agent.status === "suspended" && <Notice tone="error">Your cash agent account is suspended. Contact BukkaPay support.</Notice>}
          <div className="grid sm:grid-cols-4 gap-4">
            <Stat label="Status" value={<Badge value={agent.status} />} />
            <Stat label="Float (your balance)" value={money(info.data?.float, agent.currency)} sub="Cash-ins are paid from this" />
            <Stat label="Last 24 hours" value={money(info.data?.todayVolume, agent.currency)} sub={`Limit ${money(agent.dailyLimit, agent.currency)}`} />
            <Stat label="Location" value={<span className="text-base">{agent.city ?? "—"}</span>} sub={agent.address} />
          </div>
          {agent.status === "active" && can(merchant?.role, "collect") && (
            <div className="grid lg:grid-cols-2 gap-6">
              <CashIn id={id} currency={agent.currency} onDone={reloadAll} />
              <CashOut id={id} onDone={reloadAll} />
            </div>
          )}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">Transactions</p>
              {can(merchant?.role, "settings") && <Button variant="secondary" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Edit details"}</Button>}
            </div>
            {editing && <div className="mb-6"><ApplyForm id={id} agent={agent} onDone={() => { setEditing(false); reloadAll() }} /></div>}
            {txs.error && <Notice tone="error">{txs.error}</Notice>}
            {!txs.data?.length ? <Empty>No cash transactions yet.</Empty> : (
              <Table head={["Reference", "Type", "Amount", "You earned", "Status", "When"]}>
                {txs.data.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs">{t.reference}</td>
                    <td>{t.kind === "cash_in" ? "Cash in" : "Cash out"}</td>
                    <td className="tabular-nums">{money(t.amount, t.currency)}</td>
                    <td className="tabular-nums">{money(t.commission, t.currency)}</td>
                    <td><Badge value={t.status} /></td>
                    <td>{when(t.completedAt ?? t.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

function ApplyForm({ id, agent, onDone }: { id: string; agent?: Agent; onDone: () => void }) {
  const [f, setF] = useState({
    displayName: agent?.name ?? "", address: agent?.address ?? "", city: agent?.city ?? "", phone: agent?.phone ?? "",
    openingHours: agent?.openingHours ?? "", latitude: agent?.latitude ?? "", longitude: agent?.longitude ?? "",
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const submit = async () => {
    setBusy(true); setMsg(null)
    try {
      await api(`/merchants/${id}/agent`, { method: "POST", json: {
        displayName: f.displayName, address: f.address, city: f.city || null, phone: f.phone || null,
        openingHours: f.openingHours || null,
        latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null,
      } })
      onDone()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const useMyLocation = () => navigator.geolocation?.getCurrentPosition((p) => {
    set("latitude", p.coords.latitude.toFixed(6)); set("longitude", p.coords.longitude.toFixed(6))
  })
  return (
    <Card>
      <p className="font-semibold mb-3">{agent ? "Agent details" : "Become a BukkaPay cash agent"}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name customers will see"><Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Street address"><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Town / city"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Opening hours" hint="e.g. Mon–Sat 08:00–18:00"><Input value={f.openingHours} onChange={(e) => set("openingHours", e.target.value)} /></Field>
        <Field label="Map location (optional)" hint="Helps customers find you">
          <div className="flex gap-2">
            <Input placeholder="Latitude" value={f.latitude} onChange={(e) => set("latitude", e.target.value)} />
            <Input placeholder="Longitude" value={f.longitude} onChange={(e) => set("longitude", e.target.value)} />
            <Button variant="secondary" type="button" onClick={useMyLocation}>Here</Button>
          </div>
        </Field>
      </div>
      <Button className="mt-4" disabled={busy || f.displayName.length < 2 || f.address.length < 5} onClick={submit}>
        {agent ? "Save details" : "Apply"}
      </Button>
      {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
    </Card>
  )
}

function CashIn({ id, currency, onDone }: { id: string; currency: string; onDone: () => void }) {
  const [customer, setCustomer] = useState("")
  const [amount, setAmount] = useState("")
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const submit = async () => {
    setBusy(true); setMsg(null)
    try {
      const tx = await api<Tx>(`/merchants/${id}/agent/cash-in`, { method: "POST", json: { customer: customer.trim(), amount, pin } })
      setMsg({ tone: "success", text: `Done. ${money(tx.amount, tx.currency)} is in ${tx.customerName ?? "the customer"}'s wallet. Ref ${tx.reference}. You earned ${money(tx.commission, tx.currency)}.` })
      setCustomer(""); setAmount(""); setPin(""); setConfirming(false); onDone()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) } finally { setBusy(false) }
  }
  return (
    <Card>
      <p className="font-semibold">Cash in (deposit)</p>
      <p className="text-sm text-ink-muted mb-3">Take the customer's cash first, then send the same amount to their wallet.</p>
      <div className="space-y-3">
        <Field label="Customer's wallet ID or username"><Input value={customer} onChange={(e) => { setCustomer(e.target.value); setConfirming(false) }} /></Field>
        <Field label={`Amount (${currency})`}><Input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setConfirming(false) }} /></Field>
        {confirming && <Field label="Your PIN"><PasswordInput inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></Field>}
      </div>
      {!confirming
        ? <Button className="mt-4" disabled={!customer || !amount} onClick={() => setConfirming(true)}>Continue</Button>
        : <div className="mt-4 flex gap-2">
            <Button disabled={busy || !pin} onClick={submit}>Send {money(amount, currency)}</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
          </div>}
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </Card>
  )
}

function CashOut({ id, onDone }: { id: string; onDone: () => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Tx | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setMsg(null); setDone(null)
    try {
      const tx = await api<Tx>(`/merchants/${id}/agent/cash-out`, { method: "POST", json: { code: code.replace(/\D/g, "") } })
      setDone(tx); setCode(""); onDone()
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <Card>
      <p className="font-semibold">Cash out (withdrawal)</p>
      <p className="text-sm text-ink-muted mb-3">The customer creates an 8-digit code in their app. Enter it, then hand over the amount shown.</p>
      <Field label="Customer's code">
        <Input inputMode="numeric" maxLength={9} placeholder="1234 5678" className="tracking-[0.3em] text-lg font-mono"
               value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Button className="mt-4" disabled={busy || code.replace(/\D/g, "").length !== 8} onClick={submit}>Check code and pay out</Button>
      {done && (
        <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
          <p className="text-sm text-emerald-800">Hand over</p>
          <p className="text-3xl font-display font-semibold text-emerald-900">{money(done.amount, done.currency)}</p>
          <p className="text-xs text-emerald-800 mt-1">Ref {done.reference} · you earned {money(done.commission, done.currency)}</p>
        </div>
      )}
      {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
    </Card>
  )
}
