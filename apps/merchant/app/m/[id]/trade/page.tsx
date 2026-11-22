"use client"

import { useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Item = { description: string; quantity: string; unit: string; unitPrice: string; hsCode: string; originCountry: string }
type Invoice = { reference: string; status: string; currency: string; total: string; buyerName?: string; buyerCountry?: string | null; paymentMode: string; createdAt: string; payUrl?: string }
type Escrow = { reference: string; status: string; currency: string; amount: string; fee: string; sellerReceives: string; autoReleaseAt?: string | null; disputeReason?: string | null; createdAt: string }

const blank = (): Item => ({ description: "", quantity: "1", unit: "", unitPrice: "", hsCode: "", originCountry: "" })
const CURRENCIES = ["ZAR", "BWP", "USD"]
const INCOTERMS = ["", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"]

export default function TradePage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const invoices = useData<Invoice[]>(`/merchants/${id}/trade-invoices`)
  const escrows = useData<Escrow[]>(`/merchants/${id}/escrows`)
  const [buyerName, setBuyerName] = useState("")
  const [buyerCountry, setBuyerCountry] = useState("")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [currency, setCurrency] = useState(merchant?.currency ?? "ZAR")
  const [mode, setMode] = useState("either")
  const [incoterm, setIncoterm] = useState("")
  const [tax, setTax] = useState("0")
  const [items, setItems] = useState<Item[]>([blank()])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [created, setCreated] = useState<Invoice | null>(null)

  const subtotal = useMemo(() => items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0), [items])
  const total = subtotal + (Number(tax) || 0)
  const set = (n: number, patch: Partial<Item>) => setItems((l) => l.map((it, i) => (i === n ? { ...it, ...patch } : it)))

  const create = async () => {
    setMsg(null); setBusy(true)
    try {
      const inv = await api<Invoice>(`/merchants/${id}/trade-invoices`, {
        method: "POST",
        json: {
          buyerName, buyerCountry: buyerCountry || undefined, buyerPhone: buyerPhone || undefined, currency, paymentMode: mode,
          incoterm: incoterm || undefined, taxTotal: tax || "0",
          items: items.filter((i) => i.description.trim()).map((i) => ({
            description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, unit: i.unit || undefined,
            hsCode: i.hsCode || undefined, originCountry: i.originCountry.toUpperCase() || undefined,
          })),
        },
      })
      setCreated(inv); setItems([blank()]); setBuyerName(""); setBuyerPhone(""); setTax("0")
      invoices.reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) } finally { setBusy(false) }
  }

  const share = (inv: Invoice) => {
    const url = inv.payUrl ?? `https://app.bukkapay.com/trade/${inv.reference}`
    const text = `${merchant?.businessName} invoice ${inv.reference}: ${money(inv.total, inv.currency)}. Pay securely with BukkaPay${inv.paymentMode !== "instant" ? " (escrow available)" : ""}: ${url}`
    window.open(`https://wa.me/${buyerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener")
  }
  const cancel = async (inv: Invoice) => {
    try { await api(`/merchants/${id}/trade-invoices/${inv.reference}/cancel`, { method: "POST" }); invoices.reload() }
    catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const dispute = async (e: Escrow) => {
    const reason = window.prompt("What's the problem with this order? (at least 10 characters)")
    if (!reason) return
    try { await api(`/merchants/${id}/escrows/${e.reference}/dispute`, { method: "POST", json: { reason } }); escrows.reload() }
    catch (err: any) { setMsg({ tone: "error", text: err.message }) }
  }

  return (
    <>
      <PageHeader title="Trade invoices" subtitle="Invoice buyers across the border in ZAR, BWP or USD. They pay instantly or into BukkaPay escrow — escrow money is released to you when they confirm the goods arrived, or automatically after 14 days." />

      <Card className="mb-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Buyer name"><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></Field>
          <Field label="Buyer country (2 letters)"><Input maxLength={2} value={buyerCountry} onChange={(e) => setBuyerCountry(e.target.value.toUpperCase())} placeholder="ZA" /></Field>
          <Field label="Buyer WhatsApp (optional)"><Input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+27…" /></Field>
          <Field label="Currency"><Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Buyer can pay">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="either">Instant or escrow</option><option value="escrow">Escrow only</option><option value="instant">Instant only</option>
            </Select>
          </Field>
          <Field label="Incoterm (optional)"><Select value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>{INCOTERMS.map((t) => <option key={t} value={t}>{t || "—"}</option>)}</Select></Field>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted"><tr>{["Description", "Qty", "Unit", "Unit price", "HS code", "Origin", ""].map((h) => <th key={h} className="pb-2 pr-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it, n) => (
                <tr key={n}>
                  <td className="pr-2 pb-2"><Input value={it.description} onChange={(e) => set(n, { description: e.target.value })} placeholder="Maize meal 10kg" /></td>
                  <td className="pr-2 pb-2 w-20"><Input inputMode="decimal" value={it.quantity} onChange={(e) => set(n, { quantity: e.target.value })} /></td>
                  <td className="pr-2 pb-2 w-24"><Input value={it.unit} onChange={(e) => set(n, { unit: e.target.value })} placeholder="bag" /></td>
                  <td className="pr-2 pb-2 w-28"><Input inputMode="decimal" value={it.unitPrice} onChange={(e) => set(n, { unitPrice: e.target.value })} /></td>
                  <td className="pr-2 pb-2 w-28"><Input value={it.hsCode} onChange={(e) => set(n, { hsCode: e.target.value })} placeholder="1102.20" /></td>
                  <td className="pr-2 pb-2 w-20"><Input maxLength={2} value={it.originCountry} onChange={(e) => set(n, { originCountry: e.target.value.toUpperCase() })} placeholder="BW" /></td>
                  <td className="pb-2">{items.length > 1 && <button className="text-red-600 text-xs" onClick={() => setItems((l) => l.filter((_, i) => i !== n))}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <Button variant="secondary" onClick={() => setItems((l) => [...l, blank()])}>Add item</Button>
          <div className="flex items-end gap-4">
            <Field label="Tax"><Input className="w-28" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
            <div className="text-right"><p className="text-xs text-ink-muted">Total</p><p className="text-2xl font-semibold">{money(total.toFixed(2), currency)}</p></div>
          </div>
        </div>
        <Button className="mt-4" disabled={busy || !buyerName.trim() || total <= 0} onClick={create}>{busy ? "Creating…" : "Create invoice"}</Button>
      </Card>

      {created && (
        <div className="mb-6"><Notice tone="success">
          Invoice {created.reference} created for {money(created.total, created.currency)}.{" "}
          <button className="underline font-medium" onClick={() => share(created)}>Share on WhatsApp</button>{" · "}
          <button className="underline font-medium" onClick={() => navigator.clipboard?.writeText(created.payUrl ?? "")}>Copy pay link</button>
        </Notice></div>
      )}
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <h2 className="font-display text-lg font-semibold mb-3">Invoices</h2>
      {!invoices.data?.length ? <Empty>No trade invoices yet.</Empty> : (
        <Table head={["Created", "Reference", "Buyer", "Total", "Pay by", "Status", ""]}>
          {invoices.data.map((i) => (
            <tr key={i.reference}>
              <td className="px-4 py-3">{when(i.createdAt)}</td>
              <td className="px-4 py-3 font-mono text-xs">{i.reference}</td>
              <td className="px-4 py-3">{i.buyerName}{i.buyerCountry ? ` (${i.buyerCountry})` : ""}</td>
              <td className="px-4 py-3">{money(i.total, i.currency)}</td>
              <td className="px-4 py-3 capitalize">{i.paymentMode}</td>
              <td className="px-4 py-3"><Badge value={i.status} /></td>
              <td className="px-4 py-3 text-right">{i.status === "issued" && <button className="text-xs text-red-600" onClick={() => cancel(i)}>Cancel</button>}</td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="font-display text-lg font-semibold mt-8 mb-3">Escrows</h2>
      {!escrows.data?.length ? <Empty>No escrow payments yet.</Empty> : (
        <Table head={["Created", "Reference", "Amount", "You receive", "Status", "Releases", ""]}>
          {escrows.data.map((e) => (
            <tr key={e.reference}>
              <td className="px-4 py-3">{when(e.createdAt)}</td>
              <td className="px-4 py-3 font-mono text-xs">{e.reference}</td>
              <td className="px-4 py-3">{money(e.amount, e.currency)}</td>
              <td className="px-4 py-3">{money(e.sellerReceives, e.currency)} <span className="text-xs text-ink-muted">after {money(e.fee, e.currency)} fee</span></td>
              <td className="px-4 py-3"><Badge value={e.status} /></td>
              <td className="px-4 py-3">{e.status === "funded" && e.autoReleaseAt ? when(e.autoReleaseAt) : "—"}</td>
              <td className="px-4 py-3 text-right">{e.status === "funded" && <button className="text-xs text-red-600" onClick={() => dispute(e)}>Dispute</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
