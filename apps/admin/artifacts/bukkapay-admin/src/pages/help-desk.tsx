import { useEffect, useMemo, useState } from "react"
import { Lock, Mail, MessageCircle, Phone, Plus, Search, Send, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormDialog, Page, Stat, StatusBadge, errorMessage, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Ticket = {
  id: string; reference: string; subject: string; category: string; priority: string; status: string; channel: string
  requesterName?: string; requesterEmail?: string; assignee?: string; assigneeId?: string; createdAt: string
  updatedAt?: string; firstResponseAt?: string; waitingMinutes?: number | null; rating?: number | null; ratingComment?: string
}
type Detail = {
  ticket: Ticket
  customer: null | { name: string; email: string; walletId: string; phone?: string; country?: string; kycLevel: number
                     frozen: boolean; accountType: string; since?: string }
  history: Ticket[]
  messages: { id: string; author: string; agent?: string; body: string; internal: boolean; via: string; createdAt: string }[]
  canned: { title: string; body: string }[]
  agents: { id: string; name: string }[]
  categories: string[]; priorities: string[]
}
type Stats = { open: number; waitingCustomer: number; resolved: number; closed: number; urgentActive: number
               avgFirstResponseMinutes: number | null; csat: number | null; rated: number }

const FILTERS: [string, string][] = [["active", "Active"], ["open", "Needs reply"], ["waiting_customer", "Waiting on customer"],
                                      ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All"]]
const CHANNEL_ICON: Record<string, any> = { chat: MessageCircle, app: Smartphone, email: Mail, phone: Phone, web: Mail }
const mins = (m?: number | null) => m == null ? "—" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`

export default function HelpDeskPage() {
  const perms = usePermissions()
  const [filter, setFilter] = useState("active")
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const list = useApi<Ticket[]>(["tickets", filter, mine, q], "/admin/support/tickets", { status: filter, mine, ...(q ? { q } : {}) })
  const stats = useApi<Stats>(["ticket-stats"], "/admin/support/stats")
  const action = useAction([["tickets"], ["ticket-stats"]])
  useEffect(() => { if (!selected && list.data?.length) setSelected(list.data[0].id) }, [list.data, selected])
  const s = stats.data

  return (
    <Page title="Help desk"
      subtitle="Every customer conversation in one inbox: in-app chat, the help form, the email help line and phone calls. Reply here and it reaches the customer the way they wrote to us."
      actions={perms.can("support.manage") ? <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Log a call / new ticket</Button> : undefined}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Needs reply" value={s?.open ?? "…"} tone={(s?.open ?? 0) > 0 ? "warn" : undefined} />
        <Stat label="Urgent" value={s?.urgentActive ?? "…"} tone={(s?.urgentActive ?? 0) > 0 ? "bad" : undefined} />
        <Stat label="Waiting on customer" value={s?.waitingCustomer ?? "…"} />
        <Stat label="First reply (30 days)" value={mins(s?.avgFirstResponseMinutes)} />
        <Stat label="Satisfaction" value={s?.csat ? `${s.csat} / 5` : "—"} tone="good" />
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 min-h-[640px]">
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" placeholder="Reference, subject, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(([v, l]) => <Button key={v} size="sm" variant={filter === v ? "default" : "ghost"} onClick={() => setFilter(v)}>{l}</Button>)}
              <Button size="sm" variant={mine ? "default" : "ghost"} onClick={() => setMine(!mine)}>Mine</Button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!list.isLoading && !list.data?.length && <p className="p-6 text-sm text-muted-foreground text-center">No tickets here. 🎉</p>}
            {list.data?.map((t) => {
              const Icon = CHANNEL_ICON[t.channel] ?? Mail
              return (
                <button key={t.id} onClick={() => setSelected(t.id)}
                        className={`w-full text-left p-3 hover:bg-muted/40 ${selected === t.id ? "bg-primary/10" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm truncate flex-1">{t.subject}</span>
                    {t.priority === "urgent" && <span className="text-[10px] font-bold uppercase text-destructive">urgent</span>}
                    {t.priority === "high" && <span className="text-[10px] font-bold uppercase text-amber-600">high</span>}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                    <span className="truncate">{t.requesterName ?? t.requesterEmail ?? "Customer"} · {t.reference}</span>
                    <span className="shrink-0 ml-2">{t.status === "open" ? `waiting ${mins(t.waitingMinutes)}` : t.status.replace("_", " ")}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        {selected ? <TicketView id={selected} /> : <div className="bg-card border border-border rounded-2xl grid place-items-center text-muted-foreground">Select a ticket</div>}
      </div>

      <FormDialog
        open={creating} onOpenChange={setCreating} title="New ticket for a customer"
        description="For phone calls or walk-ins. Find the customer by wallet ID, or enter an email address."
        fields={[
          { name: "walletId", label: "Customer wallet ID" },
          { name: "email", label: "…or email address" },
          { name: "name", label: "Name (if not a customer yet)" },
          { name: "channel", label: "How they contacted us", type: "select", required: true, options: [{ value: "phone", label: "Phone" }, { value: "email", label: "Email" }, { value: "web", label: "Website / other" }] },
          { name: "subject", label: "Subject", required: true },
          { name: "category", label: "Category", type: "select", options: ["account", "payments", "cards", "transfers", "verification", "merchant", "fraud", "fees", "other"].map((c) => ({ value: c, label: c })) },
          { name: "body", label: "What they need (first message on the ticket)", type: "textarea", required: true },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/support/tickets", success: "Ticket opened",
          body: { walletId: v.walletId || null, email: v.email || null, name: v.name || null, channel: v.channel, subject: v.subject,
                  category: v.category || "other", body: v.body } })}
      />
    </Page>
  )
}

function TicketView({ id }: { id: string }) {
  const perms = usePermissions()
  const key = ["ticket", id]
  const { data, isLoading, error } = useApi<Detail>(key, `/admin/support/tickets/${id}`)
  const action = useAction([key, ["tickets"], ["ticket-stats"]])
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  useEffect(() => { setBody(""); setInternal(false) }, [id])
  const can = perms.can("support.manage")
  const t = data?.ticket
  const closed = t?.status === "closed"
  const patch = (b: Record<string, unknown>, success: string) => action.mutate({ method: "patch", url: `/admin/support/tickets/${id}`, body: b, success })
  const send = (statusAfter?: string) => action.mutateAsync({
    url: `/admin/support/tickets/${id}/reply`, success: internal ? "Note added" : statusAfter === "resolved" ? "Sent and resolved" : "Reply sent",
    body: { body, internal, statusAfter: internal ? undefined : statusAfter },
  }).then(() => setBody(""))
  const thread = useMemo(() => data?.messages ?? [], [data])

  if (isLoading || !data || !t) return <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">{error ? errorMessage(error) : "Loading…"}</div>
  return (
    <div className="grid xl:grid-cols-[1fr_280px] gap-4">
      <div className="bg-card border border-border rounded-2xl flex flex-col min-h-[640px]">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold flex-1">{t.subject}</h2>
            <StatusBadge value={t.status} />
          </div>
          <p className="text-xs text-muted-foreground">{t.reference} · via {t.channel} · opened {when(t.createdAt)}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {thread.map((m) => (
            <div key={m.id} className={`flex ${m.author === "customer" ? "justify-start" : m.author === "system" ? "justify-center" : "justify-end"}`}>
              {m.author === "system"
                ? <p className="text-xs text-muted-foreground italic">{m.body} · {when(m.createdAt)}</p>
                : (
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.internal
                    ? "bg-amber-50 border border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100"
                    : m.author === "customer" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                    {m.internal && <p className="text-[11px] font-semibold flex items-center gap-1 mb-1"><Lock className="w-3 h-3" />Internal note</p>}
                    {m.body}
                    <p className={`text-[11px] mt-1 ${m.author === "customer" || m.internal ? "text-muted-foreground" : "text-primary-foreground/70"}`}>
                      {m.author === "customer" ? (t.requesterName ?? "Customer") : (m.agent ?? "Agent")} · {m.via} · {when(m.createdAt)}
                    </p>
                  </div>
                )}
            </div>
          ))}
          {t.rating && <p className="text-center text-sm">Customer rated {"★".repeat(t.rating)}{t.ratingComment ? `: "${t.ratingComment}"` : ""}</p>}
        </div>
        {can && !closed && (
          <div className="border-t border-border p-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              {data.canned.map((c) => <Button key={c.title} size="sm" variant="outline" onClick={() => setBody(c.body)}>{c.title}</Button>)}
            </div>
            <textarea className={`w-full min-h-[96px] rounded-xl border px-3 py-2 text-sm bg-background ${internal ? "border-amber-400" : "border-input"}`}
                      placeholder={internal ? "Internal note: only agents see this" : `Reply to ${t.requesterName ?? "the customer"} (${t.channel === "chat" ? "in the app" : "by email"})`}
                      value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm mr-auto"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note</label>
              {!internal && <Button variant="outline" disabled={!body.trim() || action.isPending} onClick={() => send("resolved")}>Send &amp; resolve</Button>}
              <Button disabled={!body.trim() || action.isPending} onClick={() => send()}><Send className="w-4 h-4 mr-2" />{internal ? "Add note" : "Send"}</Button>
            </div>
          </div>
        )}
        {closed && <p className="p-4 text-sm text-muted-foreground border-t border-border">This ticket is closed. If the customer writes again, a new ticket opens.</p>}
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3 text-sm">
          <Sel label="Status" value={t.status} disabled={!can} options={["open", "waiting_customer", "resolved", "closed"]} onChange={(v) => patch({ status: v }, "Status updated")} />
          <Sel label="Priority" value={t.priority} disabled={!can} options={data.priorities} onChange={(v) => patch({ priority: v }, "Priority updated")} />
          <Sel label="Category" value={t.category} disabled={!can} options={data.categories} onChange={(v) => patch({ category: v }, "Category updated")} />
          <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground uppercase">Assigned to</span>
            <select disabled={!can} className="w-full h-9 rounded-md border border-input bg-background px-2" value={t.assigneeId ?? ""}
                    onChange={(e) => patch({ assigneeId: e.target.value }, "Assigned")}>
              <option value="">Unassigned</option>
              {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-sm space-y-1">
          <p className="font-semibold mb-1">Customer</p>
          {data.customer ? <>
            <p>{data.customer.name}</p>
            <p className="text-muted-foreground">{data.customer.email}</p>
            <p className="font-mono text-xs">{data.customer.walletId}</p>
            <p className="text-muted-foreground">{data.customer.accountType} · {data.customer.country ?? "—"} · KYC {data.customer.kycLevel}{data.customer.frozen ? " · FROZEN" : ""}</p>
            {data.customer.since && <p className="text-muted-foreground">Customer since {new Date(data.customer.since).toLocaleDateString()}</p>}
          </> : <p className="text-muted-foreground">{t.requesterName ?? ""} {t.requesterEmail ?? "Not a BukkaPay customer (yet)"}</p>}
        </div>
        {!!data.history.length && (
          <div className="bg-card border border-border rounded-2xl p-4 text-sm">
            <p className="font-semibold mb-2">Earlier tickets</p>
            {data.history.map((h) => <p key={h.id} className="truncate text-muted-foreground">{h.reference} · {h.subject} · {h.status}</p>)}
          </div>
        )}
      </div>
    </div>
  )
}

function Sel({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1"><span className="text-xs font-semibold text-muted-foreground uppercase">{label}</span>
      <select disabled={disabled} className="w-full h-9 rounded-md border border-input bg-background px-2 capitalize" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
      </select></label>
  )
}
