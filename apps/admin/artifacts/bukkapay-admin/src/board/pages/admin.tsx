import { useState } from "react"
import { Copy, Plus } from "lucide-react"
import { useBoard } from "../api"
import {
  Banner, Btn, Card, Empty, ErrorLine, Field, Input, Loading, Modal, Notes, Page, Select, Status, Table, TextArea,
  dateLabel, dateTime, label, num, useAction,
} from "../kit"

// ─── users & access ─────────────────────────────────────────────────────────
export function Users() {
  const q = useBoard<any>("/users")
  const [modal, setModal] = useState<{ kind: string; u?: any } | null>(null)
  const [link, setLink] = useState<{ link: string; sent: boolean } | null>(null)
  const act = useAction("post", ["/users"])
  const d = q.data
  const doAct = async (path: string, body?: any) => { const r = await act.run(path, body); if (r?.link) setLink({ link: r.link, sent: r.emailSent }) }
  return (
    <Page title="Users & access" subtitle="Invitation only. Roles are enforced by the server; nobody can give themselves a role."
      actions={<Btn onClick={() => setModal({ kind: "invite" })}><Plus className="w-4 h-4" />Invite</Btn>}>
      <Loading q={q} />
      <ErrorLine text={act.error} />
      {link && <Banner tone="info"><p>{link.sent ? "Invitation emailed." : "Email isn't configured, so share this link with the person directly (it works once, for 7 days):"}</p>
        <div className="flex items-center gap-2 mt-2"><code className="text-xs break-all flex-1">{link.link}</code><Btn small kind="outline" onClick={() => navigator.clipboard.writeText(link.link)}><Copy className="w-3.5 h-3.5" />Copy</Btn></div></Banner>}
      {d && <Card>
        <Table rows={d.users} cols={[
          ["Person", (u: any) => <><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}{u.organisation ? ` · ${u.organisation}` : ""}</p></>],
          ["Role", (u: any) => <>{u.roleLabel}{(u.grants.length > 0 || u.denies.length > 0) && <p className="text-[11px] text-muted-foreground">+{u.grants.length} / −{u.denies.length} custom</p>}</>],
          ["Status", (u: any) => <Status value={u.status === "owner" ? "active" : u.status} text={u.status === "owner" ? "Owner" : undefined} />],
          ["MFA", (u: any) => <Status value={u.mfa === "not_set_up" ? "pending" : "active"} text={u.mfa === "authenticator" ? "Authenticator" : u.mfa === "admin_panel" ? "Admin panel" : "Not set up"} />],
          ["Last sign-in", (u: any) => <span className="text-xs">{dateTime(u.lastLoginAt)}{u.failedSignIns7d > 0 && <span className="block text-[var(--bad)]">{u.failedSignIns7d} failed in 7 days</span>}</span>],
          ["", (u: any) => u.status === "owner" ? null : <div className="flex flex-wrap gap-1">
            <Btn small kind="outline" onClick={() => setModal({ kind: "edit", u })}>Access</Btn>
            <Btn small kind="ghost" onClick={() => setModal({ kind: "history", u })}>History</Btn>
            {["invited", "expired"].includes(u.status) && <Btn small kind="ghost" onClick={() => doAct(`/users/${u.id}/resend`)}>Resend</Btn>}
            {u.status === "active" && <Btn small kind="ghost" onClick={() => setModal({ kind: "suspend", u })}>Suspend</Btn>}
            {u.status === "suspended" && <Btn small kind="ghost" onClick={() => doAct(`/users/${u.id}/reactivate`)}>Reactivate</Btn>}
            {u.status !== "revoked" && <Btn small kind="ghost" onClick={() => doAct(`/users/${u.id}/sessions/revoke`)}>Sign out everywhere</Btn>}
            {u.mfa === "authenticator" && <Btn small kind="ghost" onClick={() => doAct(`/users/${u.id}/mfa/reset`)}>Reset MFA</Btn>}
            {u.status !== "revoked" && <Btn small kind="ghost" onClick={() => doAct(`/users/${u.id}/revoke`)}>Revoke</Btn>}
          </div>],
        ]} />
      </Card>}
      {modal?.kind === "invite" && d && <InviteModal roles={d.roles} onClose={() => setModal(null)} onDone={(r) => setLink({ link: r.link, sent: r.emailSent })} />}
      {modal?.kind === "edit" && d && <AccessModal u={modal.u} roles={d.roles} permissions={d.permissions} onClose={() => setModal(null)} />}
      {modal?.kind === "suspend" && <SuspendModal u={modal.u} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal u={modal.u} onClose={() => setModal(null)} />}
    </Page>
  )
}

function InviteModal({ roles, onClose, onDone }: { roles: any[]; onClose: () => void; onDone: (r: any) => void }) {
  const a = useAction("post", ["/users"])
  const [f, setF] = useState({ email: "", name: "", role: "investor", organisation: "", title: "" })
  const save = async () => { const r = await a.run("/users", { ...f, organisation: f.organisation || null, title: f.title || null }); onDone(r); onClose() }
  const role = roles.find((r) => r.code === f.role)
  return (
    <Modal open title="Invite someone to the Boardroom" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</Select></Field>
        {role && <p className="text-xs text-muted-foreground">{role.permissions.length ? `${role.permissions.length} permissions: ${role.permissions.slice(0, 8).join(", ")}${role.permissions.length > 8 ? "…" : ""}` : "No access until you grant specific items."}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Organisation"><Input value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} /></Field>
          <Field label="Position"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Seed investor" /></Field>
        </div>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={!f.email.includes("@") || f.name.length < 2}>Send invitation</Btn></div>
    </Modal>
  )
}

function AccessModal({ u, roles, permissions, onClose }: { u: any; roles: any[]; permissions: any[]; onClose: () => void }) {
  const a = useAction("patch", ["/users"])
  const [f, setF] = useState<any>({ role: u.role, grants: u.grants, denies: u.denies, title: u.title ?? "", organisation: u.organisation ?? "", phone: u.phone ?? "", appointedOn: u.appointedOn ?? "" })
  const base: string[] = roles.find((r) => r.code === f.role)?.permissions ?? []
  const toggle = (p: string) => {
    const inBase = base.includes(p)
    if (inBase) setF({ ...f, denies: f.denies.includes(p) ? f.denies.filter((x: string) => x !== p) : [...f.denies, p] })
    else setF({ ...f, grants: f.grants.includes(p) ? f.grants.filter((x: string) => x !== p) : [...f.grants, p] })
  }
  const has = (p: string) => (base.includes(p) && !f.denies.includes(p)) || f.grants.includes(p)
  const save = async () => { await a.run(`/users/${u.id}`, { ...f, grants: f.grants.filter((p: string) => !base.includes(p)), denies: f.denies.filter((p: string) => base.includes(p)), appointedOn: f.appointedOn || null, title: f.title || null, organisation: f.organisation || null, phone: f.phone || null }); onClose() }
  return (
    <Modal open title={`Access: ${u.name}`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, grants: [], denies: [] })}>{roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</Select></Field>
        <Field label="Position"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Organisation"><Input value={f.organisation} onChange={(e) => setF({ ...f, organisation: e.target.value })} /></Field>
        <Field label="Appointment date"><Input type="date" value={f.appointedOn} onChange={(e) => setF({ ...f, appointedOn: e.target.value })} /></Field>
      </div>
      <p className="text-xs font-medium text-muted-foreground mt-4 mb-2">Permissions (role defaults are pre-ticked; owner-only items can't be given)</p>
      <div className="grid sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
        {permissions.map((p: any) => (
          <label key={p.code} className={`flex items-start gap-2 text-sm rounded-lg px-2 py-1.5 ${p.ownerOnly ? "opacity-50" : "hover:bg-muted"}`}>
            <input type="checkbox" disabled={p.ownerOnly} checked={has(p.code)} onChange={() => toggle(p.code)} className="mt-1" />
            <span><span className="block">{p.label}</span><span className="text-[11px] text-muted-foreground font-mono">{p.code}{base.includes(p.code) ? " · role default" : ""}</span></span>
          </label>))}
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy}>Save access</Btn></div>
    </Modal>
  )
}

function SuspendModal({ u, onClose }: { u: any; onClose: () => void }) {
  const a = useAction("post", ["/users"])
  const [reason, setReason] = useState("")
  return (
    <Modal open title={`Suspend ${u.name}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-3">They're signed out at once and can't sign in until reactivated.</p>
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="danger" busy={a.busy} disabled={reason.length < 3} onClick={async () => { await a.run(`/users/${u.id}/suspend`, { reason }); onClose() }}>Suspend</Btn></div>
    </Modal>
  )
}

function HistoryModal({ u, onClose }: { u: any; onClose: () => void }) {
  const q = useBoard<any>(`/users/${u.id}/history`)
  return (
    <Modal open title={`Sign-ins and activity: ${u.name}`} onClose={onClose} wide>
      <Loading q={q} />
      {q.data && <>
        <h3 className="text-sm font-semibold mb-2">Sessions</h3>
        <Table rows={q.data.sessions} empty="No sessions." cols={[["Started", (s: any) => dateTime(s.createdAt)], ["Last seen", (s: any) => dateTime(s.lastSeenAt)], ["IP", (s: any) => s.ip ?? "—"], ["Device", (s: any) => <span className="text-xs line-clamp-1">{s.device ?? "—"}</span>], ["", (s: any) => <Status value={s.revoked ? "revoked" : new Date(s.expiresAt) > new Date() ? "active" : "expired"} />]]} />
        <h3 className="text-sm font-semibold mt-4 mb-2">Activity</h3>
        <Table rows={q.data.access} empty="No activity." cols={[["When", (a: any) => dateTime(a.at)], ["What", (a: any) => <span className={a.action === "sign_in_failed" ? "text-[var(--bad)]" : ""}>{label(a.action)}</span>], ["IP", (a: any) => a.ip ?? "—"]]} />
      </>}
    </Modal>
  )
}

// ─── audit ──────────────────────────────────────────────────────────────────
export function Audit() {
  const [action, setAction] = useState("")
  const q = useBoard<any>("/audit", { limit: 200, ...(action ? { action } : {}) })
  return (
    <Page title="Audit trail" subtitle="Every change in the Boardroom. The database refuses edits and deletions of this log."
      actions={<Input placeholder="Filter by action (e.g. resolution.)" value={action} onChange={(e) => setAction(e.target.value)} className="!w-64 h-9" />}>
      <Loading q={q} />
      {q.data && <Card>
        <Table rows={q.data.entries} empty="Nothing recorded yet." cols={[["When", (e: any) => <span className="text-xs whitespace-nowrap">{dateTime(e.at)}</span>], ["Who", (e: any) => <span className="text-xs">{e.actor}</span>], ["Action", (e: any) => <code className="text-xs">{e.action}</code>],
          ["Record", (e: any) => <span className="text-xs">{e.targetType}{e.targetId ? ` · ${e.targetId.slice(0, 8)}` : ""}</span>],
          ["Change", (e: any) => (e.before || e.after) ? <details><summary className="text-xs cursor-pointer text-muted-foreground">View</summary><pre className="text-[11px] whitespace-pre-wrap max-w-md">{e.before ? `Before: ${JSON.stringify(e.before, null, 1)}\n` : ""}{e.after ? `After: ${JSON.stringify(e.after, null, 1)}` : ""}</pre></details> : "—"],
          ["IP", (e: any) => <span className="text-xs">{e.ip ?? "—"}</span>]]} />
      </Card>}
    </Page>
  )
}

// ─── company settings ───────────────────────────────────────────────────────
const ACCOUNT_GROUPS: [string, [string, string][]][] = [
  ["Operating expenses", [["staffCosts", "Salaries and staff"], ["technologyCosts", "Technology"], ["cloudCosts", "Cloud infrastructure"], ["marketingCosts", "Marketing"], ["complianceLegalCosts", "Legal and compliance"], ["bankingCosts", "Banking charges"], ["pspCosts", "PSP fees"], ["cybersecurityCosts", "Cybersecurity"], ["officeAdminCosts", "Administration"], ["countryOpsCosts", "Country operations"], ["otherCosts", "Other approved expenses"]]],
  ["Below EBITDA and other income", [["otherIncome", "Other income"], ["depreciation", "Depreciation"], ["amortisation", "Amortisation"], ["financeCosts", "Finance costs"], ["tax", "Tax"]]],
  ["Balance sheet (month-end)", [["cashBalance", "Cash and cash equivalents"], ["receivables", "Receivables"], ["otherAssets", "Other assets"], ["otherLiabilities", "Liabilities"], ["equity", "Shareholders' equity"]]],
  ["Cash flow (month)", [["operatingCashFlow", "Operating"], ["investingCashFlow", "Investing"], ["financingCashFlow", "Financing"], ["fundingRaised", "Funding received"]]],
]

export function Settings() {
  const [tab, setTab] = useState("accounts")
  return (
    <Page title="Company settings" subtitle="Management accounts, reporting periods, budgets, targets and revenue stream status.">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {[["accounts", "Management accounts"], ["periods", "Reporting periods"], ["budgets", "Budgets"], ["targets", "Targets"], ["streams", "Revenue streams"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>{l}</button>))}
      </div>
      {tab === "accounts" && <AccountsTab />}
      {tab === "periods" && <PeriodsTab />}
      {tab === "budgets" && <BudgetsTab />}
      {tab === "targets" && <TargetsTab />}
      {tab === "streams" && <StreamsTab />}
    </Page>
  )
}

function AccountsTab() {
  const q = useBoard<any>("/settings/accounts")
  const a = useAction("put", ["/settings", "/dashboard", "/financials", "/overview", "/health"])
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const existing = q.data?.accounts.find((x: any) => x.month.slice(0, 7) === month)
  const [f, setF] = useState<any>(null)
  const form = f ?? { currency: existing?.currency ?? "USD", accountsStatus: existing?.accountsStatus ?? "management", headcount: existing?.headcount ?? "", notes: existing?.notes ?? "",
    ...Object.fromEntries(ACCOUNT_GROUPS.flatMap(([, ls]) => ls.map(([k]) => [k, existing?.[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] ?? ""]))) }
  const set = (k: string, v: any) => setF({ ...form, [k]: v })
  const save = async () => {
    const body: any = { month: `${month}-01`, currency: form.currency, accountsStatus: form.accountsStatus, headcount: form.headcount === "" ? null : Number(form.headcount), notes: form.notes || null }
    ACCOUNT_GROUPS.forEach(([, ls]) => ls.forEach(([k]) => { body[k] = form[k] === "" ? (["staffCosts", "technologyCosts", "cloudCosts", "marketingCosts", "complianceLegalCosts", "bankingCosts", "pspCosts", "cybersecurityCosts", "officeAdminCosts", "countryOpsCosts", "otherCosts", "otherIncome", "fundingRaised"].includes(k) ? "0" : null) : form[k] }))
    await a.run("/settings/accounts", body); setF(null)
  }
  return (
    <div className="space-y-4">
      <Card title="Monthly management accounts" note="The figures the ledger can't know. Locked periods can't be changed.">
        <div className="flex flex-wrap gap-3 mb-4">
          <Field label="Month"><Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setF(null) }} /></Field>
          <Field label="Currency"><Input maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} className="!w-24" /></Field>
          <Field label="How reliable"><Select value={form.accountsStatus} onChange={(e) => set("accountsStatus", e.target.value)}>{["draft", "management", "reviewed", "audited"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <Field label="Headcount"><Input type="number" min={0} value={form.headcount} onChange={(e) => set("headcount", e.target.value)} className="!w-28" /></Field>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {ACCOUNT_GROUPS.map(([g, ls]) => (
            <div key={g}><p className="text-sm font-semibold mb-2">{g}</p>
              <div className="grid sm:grid-cols-2 gap-2">{ls.map(([k, l]) => <Field key={k} label={l}><Input inputMode="decimal" value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={g.startsWith("Operating") ? "0" : "Not entered"} /></Field>)}</div></div>))}
        </div>
        <div className="mt-4"><Field label="Notes"><TextArea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        <ErrorLine text={a.error} />
        <div className="flex justify-end mt-4"><Btn onClick={save} busy={a.busy}>Save {month}</Btn></div>
      </Card>
      <Card title="Entered months"><Table rows={q.data?.accounts ?? []} cols={[["Month", (r: any) => r.month.slice(0, 7)], ["Currency", (r: any) => r.currency], ["Status", (r: any) => <Status value={r.accounts_status ?? r.accountsStatus} />], ["Cash", (r: any) => num(r.cash_balance), "r"], ["Headcount", (r: any) => num(r.headcount), "r"]]} /></Card>
    </div>
  )
}

function PeriodsTab() {
  const q = useBoard<any>("/settings/periods")
  const a = useAction("put", ["/settings"])
  const [f, setF] = useState({ kind: "month", startDate: new Date().toISOString().slice(0, 8) + "01", status: "closed" })
  return (
    <div className="space-y-4">
      <Card title="Close or lock a period" note="Closed or locked periods stop management accounts from being edited. A locked period stays locked.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["month", "quarter", "year"].map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></Field>
          <Field label="Containing"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["open", "closed", "locked"].map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></Field>
          <Btn onClick={() => a.run("/settings/periods", f)} busy={a.busy}>Save</Btn>
        </div>
        <ErrorLine text={a.error} />
      </Card>
      <Card title="Periods"><Table rows={q.data?.periods ?? []} empty="No periods closed yet." cols={[["Period", (r: any) => r.label], ["From", (r: any) => dateLabel(r.start)], ["To", (r: any) => dateLabel(r.end)], ["Status", (r: any) => <Status value={r.status === "open" ? "open" : r.status === "locked" ? "approved" : "pending"} text={label(r.status)} />], ["By", (r: any) => <span className="text-xs">{r.closedBy ?? "—"}</span>]]} /></Card>
    </div>
  )
}

function BudgetsTab() {
  const q = useBoard<any>("/settings/budgets")
  const a = useAction("put", ["/settings", "/financials", "/health"])
  const [f, setF] = useState({ month: new Date().toISOString().slice(0, 7), category: "staff_costs", currency: "USD", amount: "" })
  return (
    <div className="space-y-4">
      <Card title="Set a monthly budget">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Month"><Input type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{(q.data?.categories ?? []).map((c: string) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
          <Field label="Currency"><Input maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} className="!w-24" /></Field>
          <Field label="Amount"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="!w-36" /></Field>
          <Btn onClick={() => a.run("/settings/budgets", { ...f, month: `${f.month}-01` })} busy={a.busy} disabled={!f.amount}>Save</Btn>
        </div>
        <ErrorLine text={a.error} />
      </Card>
      <Card title="Budgets"><Table rows={q.data?.budgets ?? []} empty="No budgets yet." cols={[["Month", (r: any) => r.month.slice(0, 7)], ["Category", (r: any) => label(r.category)], ["Amount", (r: any) => `${r.currency} ${num(r.amount)}`, "r"]]} /></Card>
    </div>
  )
}

function TargetsTab() {
  const q = useBoard<any>("/settings/targets")
  const a = useAction("put", ["/settings"])
  const [f, setF] = useState<any>({ metric: "registered_customers", periodStart: "", periodEnd: "", target: "", currency: "", notes: "" })
  return (
    <div className="space-y-4">
      <Card title="Approved targets" note="Targets feed the company health scorecard. Money targets need a currency.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Metric"><Select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{["registered_customers", "active_customers", "active_merchants", "revenue", "transaction_volume", "net_profit", "countries_live"].map((m) => <option key={m} value={m}>{label(m)}</option>)}</Select></Field>
          <Field label="From"><Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
          <Field label="Target"><Input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Currency (money only)"><Input maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <ErrorLine text={a.error} />
        <div className="flex justify-end mt-3"><Btn onClick={() => a.run("/settings/targets", { ...f, currency: f.currency || null, notes: f.notes || null })} busy={a.busy} disabled={!f.target || !f.periodStart || !f.periodEnd}>Save target</Btn></div>
      </Card>
      <Card title="Targets"><Table rows={q.data?.targets ?? []} empty="No targets set." cols={[["Metric", (r: any) => label(r.metric)], ["Period", (r: any) => `${dateLabel(r.periodStart)} – ${dateLabel(r.periodEnd)}`], ["Target", (r: any) => `${r.currency ? r.currency + " " : ""}${num(r.target)}`, "r"], ["Notes", (r: any) => r.notes ?? "—"]]} /></Card>
    </div>
  )
}

function StreamsTab() {
  const q = useBoard<any>("/settings/revenue-streams")
  const a = useAction("put", ["/settings", "/revenue", "/dashboard"])
  return (
    <Card title="Revenue stream status" note="Planned and in-development streams never show amounts as actual revenue. Actual revenue always comes from the ledger.">
      <ErrorLine text={a.error} />
      {!q.data?.streams.length && <Empty text="No streams configured." />}
      <Table rows={q.data?.streams ?? []} cols={[["Stream", (r: any) => r.label], ["Code", (r: any) => <code className="text-xs">{r.code}</code>],
        ["Status", (r: any) => <Select value={r.status} onChange={(e) => a.run(`/settings/revenue-streams/${r.code}`, { status: e.target.value, notes: r.notes })} className="!w-44 !py-1">{["operational", "in_development", "planned", "disabled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>]]} />
    </Card>
  )
}

// ─── my account ─────────────────────────────────────────────────────────────
export function Account() {
  const q = useBoard<any>("/auth/sessions")
  const me = useBoard<any>("/auth/me")
  const revoke = useAction("post", ["/auth/sessions"])
  const pw = useAction("post")
  const [f, setF] = useState({ currentPassword: "", newPassword: "", otp: "" })
  const [done, setDone] = useState(false)
  return (
    <Page title="My account" subtitle={me.data ? `${me.data.name} · ${me.data.roleLabel}` : undefined}>
      <Card title="Sessions" note="Sessions end after 12 hours, or 30 minutes without activity.">
        <ErrorLine text={revoke.error} />
        <Table rows={q.data?.sessions ?? []} cols={[["Started", (s: any) => dateTime(s.createdAt)], ["Last active", (s: any) => dateTime(s.lastSeenAt)], ["IP", (s: any) => s.ip ?? "—"], ["Device", (s: any) => <span className="text-xs line-clamp-1">{s.device ?? "—"}</span>],
          ["", (s: any) => s.current ? <Status value="active" text="This session" /> : s.revoked ? <Status value="revoked" /> : new Date(s.expiresAt) < new Date() ? <Status value="expired" /> : <Btn small kind="outline" onClick={() => revoke.run(`/auth/sessions/${s.id}/revoke`)}>Sign out</Btn>]]} />
      </Card>
      <Card title="Sign-in history"><Table rows={q.data?.history ?? []} cols={[["When", (h: any) => dateTime(h.at)], ["What", (h: any) => <span className={h.action === "sign_in_failed" ? "text-[var(--bad)]" : ""}>{label(h.action)}</span>], ["IP", (h: any) => h.ip ?? "—"]]} /></Card>
      {me.data && !me.data.isOwner && <Card title="Change password">
        {done && <Banner tone="info">Password changed.</Banner>}
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
          <Field label="New password (12+ characters)"><Input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
          <Field label="Authenticator code"><Input inputMode="numeric" maxLength={6} value={f.otp} onChange={(e) => setF({ ...f, otp: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <ErrorLine text={pw.error} />
        <div className="flex justify-end mt-3"><Btn busy={pw.busy} disabled={f.newPassword.length < 12 || f.otp.length !== 6} onClick={async () => { await pw.run("/auth/password", f); setDone(true); setF({ currentPassword: "", newPassword: "", otp: "" }) }}>Change password</Btn></div>
      </Card>}
      <Notes items={["Lost your phone? Ask the company administrator to reset your authenticator; you'll set up a new one at your next sign-in."]} />
    </Page>
  )
}
