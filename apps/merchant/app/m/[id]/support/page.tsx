"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select } from "@/components/ui"

type Ticket = { id: string; reference: string; subject: string; category: string; status: string; channel: string
                createdAt: string; updatedAt?: string; rating?: number | null; canRate: boolean }
type Detail = Ticket & { messages: { id: string; author: string; body: string; createdAt: string }[] }

const STATUS: Record<string, string> = { open: "We're on it", waiting_customer: "Waiting for you", resolved: "Resolved", closed: "Closed" }
const CATEGORIES: [string, string][] = [["merchant", "My business account"], ["payments", "Payments & settlements"],
  ["verification", "Verification"], ["fees", "Fees"], ["fraud", "Fraud or scam"], ["other", "Something else"]]

export default function SupportPage() {
  const list = useData<{ tickets: Ticket[]; email: string }>("/support/tickets")
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ subject: "", category: "merchant", message: "" })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true); setMsg(null)
    try {
      const t = await api<Ticket>("/support/tickets", { method: "POST", json: form })
      setForm({ subject: "", category: "merchant", message: "" })
      list.reload(); setOpen(t.id)
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Help & support" subtitle={`Send us a request and follow it here, or email ${list.data?.email ?? "support@bukkapay.com"} and quote your reference.`} />
      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        <div className="space-y-6">
          <Card>
            <p className="font-semibold mb-3">New request</p>
            <div className="space-y-3">
              <Field label="About"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Summary"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <Field label="Details" hint="Amounts, dates and references help us solve it faster.">
                <textarea className="w-full min-h-[110px] rounded-xl border border-line bg-white px-3 py-2 text-sm dark:bg-white/5 dark:border-white/10"
                          value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
            </div>
            <Button className="mt-3" disabled={busy || form.subject.trim().length < 3 || form.message.trim().length < 2} onClick={create}>Send request</Button>
            {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
          </Card>
          <Card>
            <p className="font-semibold mb-3">Your requests</p>
            {!list.data?.tickets.length ? <Empty>No requests yet.</Empty> : (
              <div className="divide-y divide-line dark:divide-white/10">
                {list.data.tickets.map((t) => (
                  <button key={t.id} onClick={() => setOpen(t.id)} className={`w-full text-left py-3 px-2 rounded-lg ${open === t.id ? "bg-brand-50 dark:bg-white/5" : ""}`}>
                    <div className="flex justify-between gap-2"><span className="font-medium truncate">{t.subject}</span><Badge value={t.status} /></div>
                    <p className="text-xs text-ink-muted">{t.reference} · {when(t.updatedAt ?? t.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
        {open ? <TicketPane id={open} onChange={list.reload} /> : <Card><Empty>Select a request to see the conversation.</Empty></Card>}
      </div>
    </>
  )
}

function TicketPane({ id, onChange }: { id: string; onChange: () => void }) {
  const { data: t, reload, error } = useData<Detail>(`/support/tickets/${id}`)
  const [reply, setReply] = useState("")
  const [stars, setStars] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const act = async (path: string, json?: unknown) => {
    setMsg(null)
    try { await api(path, { method: "POST", json }); setReply(""); reload(); onChange() } catch (e: any) { setMsg(e.message) }
  }
  if (error) return <Card><Notice tone="error">{error}</Notice></Card>
  if (!t) return <Card><p className="text-sm text-ink-muted">Loading…</p></Card>
  return (
    <Card>
      <p className="font-semibold text-lg">{t.subject}</p>
      <p className="text-xs text-ink-muted mb-4">{t.reference} · {STATUS[t.status]}</p>
      <div className="space-y-3 max-h-[480px] overflow-y-auto">
        {t.messages.map((m) => m.author === "system"
          ? <p key={m.id} className="text-center text-xs italic text-ink-muted">{m.body}</p>
          : <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.author === "customer" ? "ml-auto bg-brand-600 text-white" : "bg-surface dark:bg-white/5"}`}>
              {m.body}<p className={`text-[11px] mt-1 ${m.author === "customer" ? "text-white/70" : "text-ink-muted"}`}>{m.author === "agent" ? "BukkaPay Support · " : ""}{when(m.createdAt)}</p>
            </div>)}
      </div>
      {t.status !== "closed" && (
        <div className="mt-4 space-y-2">
          <textarea className="w-full min-h-[80px] rounded-xl border border-line bg-white px-3 py-2 text-sm dark:bg-white/5 dark:border-white/10"
                    placeholder="Write a reply" value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="flex gap-2">
            <Button disabled={!reply.trim()} onClick={() => act(`/support/tickets/${id}/messages`, { message: reply })}>Send</Button>
            {(t.status === "open" || t.status === "waiting_customer") && <Button variant="secondary" onClick={() => act(`/support/tickets/${id}/resolve`)}>It's solved</Button>}
          </div>
        </div>
      )}
      {t.canRate && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-medium">How did we do?</span>
          {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setStars(n)} className="text-2xl text-amber-500" aria-label={`${n} stars`}>{n <= stars ? "★" : "☆"}</button>)}
          <Button disabled={!stars} onClick={() => act(`/support/tickets/${id}/rate`, { rating: stars })}>Rate</Button>
        </div>
      )}
      {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
    </Card>
  )
}
