"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select } from "@/components/ui"
import { QrImage, downloadQr } from "@/components/QrImage"
import { useMerchant } from "@/components/merchant-context"

type Qr = { id: string; kind: string; label?: string; amount?: string; currency: string; reference?: string; status: string; expiresAt?: string; payload: string; createdAt: string }

export default function QrPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const { data, error, reload } = useData<Qr[]>(`/merchants/${id}/qr`)
  const [kind, setKind] = useState("dynamic")
  const [amount, setAmount] = useState("")
  const [label, setLabel] = useState("")
  const [minutes, setMinutes] = useState("15")
  const [msg, setMsg] = useState<string | null>(null)
  const [poster, setPoster] = useState<Qr | null>(null)

  const create = async () => {
    setMsg(null)
    try {
      const qr = await api<Qr>(`/merchants/${id}/qr`, {
        method: "POST",
        json: { kind, label: label || undefined, amount: kind === "dynamic" ? amount : undefined, expiresInMinutes: Number(minutes) || 15 },
      })
      setAmount("")
      reload()
      if (qr.kind === "static") setPoster(qr)
    } catch (e: any) { setMsg(e.message) }
  }
  const cancel = async (q: Qr) => { await api(`/merchants/${id}/qr/${q.id}/cancel`, { method: "POST" }); reload() }

  if (poster) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="no-print mb-4 flex justify-between">
          <Button variant="secondary" onClick={() => setPoster(null)}>← Back</Button>
          <Button onClick={() => window.print()}>Print poster</Button>
        </div>
        <Card className="p-10">
          <p className="font-display text-sm font-semibold text-brand-600">Pay with BukkaPay</p>
          <p className="font-display text-3xl font-semibold mt-1">{merchant?.businessName}</p>
          <div className="my-8 flex justify-center"><QrImage value={poster.payload} size={260} /></div>
          <p className="text-sm text-ink-muted">Open the BukkaPay app, tap Scan, enter the amount and confirm with your PIN.</p>
          {poster.label && <p className="mt-4 text-xs text-ink-muted">{poster.label}</p>}
        </Card>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="QR codes" subtitle="Static codes are for your counter or table (the customer enters the amount). Dynamic codes fix the amount for one sale and expire. Every code is signed, so it can't be altered." />
      <Card className="mb-6">
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="dynamic">Dynamic (one sale)</option>
              <option value="static">Static (counter / poster)</option>
            </Select>
          </Field>
          {kind === "dynamic" && <Field label={`Amount (${merchant?.currency})`}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
          {kind === "dynamic" && <Field label="Expires in (minutes)"><Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>}
          <Field label="Label (optional)"><Input value={label} placeholder="Till 1 / Table 4" onChange={(e) => setLabel(e.target.value)} /></Field>
        </div>
        <Button className="mt-4" disabled={kind === "dynamic" && !amount} onClick={create}>Create QR code</Button>
        {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {!data?.length ? <Empty>No QR codes yet.</Empty> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((q) => (
            <Card key={q.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold capitalize">{q.kind} {q.label ? `· ${q.label}` : ""}</p>
                  <p className="text-sm tabular-nums">{q.amount ? money(q.amount, q.currency) : "Customer enters amount"}</p>
                </div>
                <Badge value={q.status} />
              </div>
              <div className="my-4 flex justify-center opacity-100">{q.status === "active" ? <QrImage value={q.payload} size={160} /> : <div className="h-40 w-40 rounded-xl bg-surface dark:bg-white/5" />}</div>
              <p className="text-xs text-ink-muted">Created {when(q.createdAt)}{q.expiresAt ? ` · expires ${when(q.expiresAt)}` : ""}</p>
              {q.reference && <p className="text-xs font-mono text-ink-muted">{q.reference}</p>}
              {q.status === "active" && (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => downloadQr(q.payload, `bukkapay-qr-${q.id}.png`)}>Download</Button>
                  {q.kind === "static" && <Button variant="secondary" onClick={() => setPoster(q)}>Poster</Button>}
                  <Button variant="ghost" onClick={() => cancel(q)}>Cancel</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
