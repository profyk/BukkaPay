import { useState } from "react"
import { Link, useRoute } from "wouter"
import { Download, FileText, Plus, Upload } from "lucide-react"
import { boardApi, can, download, errorText, useBoard, useMe } from "../api"
import {
  Banner, Btn, Card, Empty, ErrorLine, Field, Input, Loading, Modal, Notes, Page, PerCurrency, Select, Status, Table,
  TextArea, dateLabel, dateTime, label, num, useAction,
} from "../kit"

const ROLE_LABELS: Record<string, string> = { chair: "Chair", executive_director: "Executive directors", non_executive_director: "Non-executive directors", investor: "Investors", shareholder: "Shareholders", financial_observer: "Financial observers" }

function AudiencePicker({ value, onChange, roles = Object.keys(ROLE_LABELS) }: { value: string[]; onChange: (v: string[]) => void; roles?: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">Who can see it <span className="font-normal">(none ticked = every member)</span></p>
      <div className="flex flex-wrap gap-2">{roles.map((r) => (
        <label key={r} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
          <input type="checkbox" checked={value.includes(r)} onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />{ROLE_LABELS[r] ?? label(r)}
        </label>))}</div>
    </div>
  )
}

// ─── meetings ───────────────────────────────────────────────────────────────
export function Meetings() {
  const me = useMe()
  const q = useBoard<any>("/meetings")
  const users = useBoard<any>("/users", undefined, can(me.data, "users.manage"))
  const manage = can(me.data, "meetings.manage")
  const [modal, setModal] = useState<{ kind: string; m?: any } | null>(null)
  const status = useAction("post", ["/meetings"])
  const now = Date.now()
  const list = q.data?.meetings ?? []
  const upcoming = list.filter((m: any) => new Date(m.scheduledAt).getTime() >= now && m.status === "scheduled").reverse()
  const past = list.filter((m: any) => !upcoming.includes(m))
  return (
    <Page title="Board meetings" actions={manage ? <Btn onClick={() => setModal({ kind: "meeting" })}><Plus className="w-4 h-4" />Schedule a meeting</Btn> : undefined}>
      <Loading q={q} />
      <ErrorLine text={status.error} />
      {q.data && <>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Upcoming</h2>
        {!upcoming.length && <Empty text="No meetings scheduled." />}
        <div className="grid md:grid-cols-2 gap-4">{upcoming.map((m: any) => <MeetingCard key={m.id} m={m} manage={manage} onEdit={(kind) => setModal({ kind, m })} onStatus={(s) => status.run(`/meetings/${m.id}/status`, { status: s })} />)}</div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Past and cancelled</h2>
        {!past.length && <Empty text="None yet." />}
        <div className="grid md:grid-cols-2 gap-4">{past.map((m: any) => <MeetingCard key={m.id} m={m} manage={manage} onEdit={(kind) => setModal({ kind, m })} onStatus={(s) => status.run(`/meetings/${m.id}/status`, { status: s })} />)}</div>
      </>}
      {modal?.kind === "meeting" && <MeetingModal m={modal.m} members={users.data?.users ?? modal.m?.attendees?.map((a: any) => ({ id: a.memberId, name: a.name, roleLabel: label(a.role) })) ?? []} onClose={() => setModal(null)} />}
      {modal?.kind === "agenda" && <AgendaModal m={modal.m} onClose={() => setModal(null)} />}
      {modal?.kind === "attendance" && <AttendanceModal m={modal.m} onClose={() => setModal(null)} />}
      {modal?.kind === "minutes" && <MinutesModal m={modal.m} onClose={() => setModal(null)} />}
    </Page>
  )
}

function MeetingCard({ m, manage, onEdit, onStatus }: { m: any; manage: boolean; onEdit: (k: string) => void; onStatus: (s: string) => void }) {
  return (
    <Card title={m.title} note={`${dateTime(m.scheduledAt)} · ${m.durationMinutes} min · ${label(m.kind)}`} actions={<Status value={m.status} />}>
      <div className="text-sm space-y-3">
        {(m.location || m.videoLink) && <p className="text-muted-foreground">{m.location}{m.videoLink && <> · <a href={m.videoLink} target="_blank" rel="noreferrer noopener" className="underline">Join link</a></>}</p>}
        <div><p className="text-xs text-muted-foreground mb-1">Agenda</p>{m.agenda.length ? <ol className="list-decimal pl-5 space-y-0.5">{m.agenda.map((a: any) => <li key={a.id}>{a.title}{a.presenter && <span className="text-muted-foreground"> · {a.presenter}</span>}</li>)}</ol> : <span className="text-muted-foreground">Not set</span>}</div>
        <div><p className="text-xs text-muted-foreground mb-1">Participants</p><div className="flex flex-wrap gap-1.5">{m.attendees.map((a: any) => <span key={a.memberId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{a.name}{a.attendance !== "invited" && <Status value={a.attendance} />}</span>)}</div></div>
        {m.minutes ? <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Minutes <Status value={m.minutes.status} /></summary><div className="whitespace-pre-wrap mt-2 text-sm">{m.minutes.body}</div></details> : <p className="text-xs text-muted-foreground">Minutes not published yet.</p>}
        {manage && <div className="flex flex-wrap gap-1.5 pt-1">
          <Btn small kind="outline" onClick={() => onEdit("meeting")}>Edit</Btn><Btn small kind="outline" onClick={() => onEdit("agenda")}>Agenda</Btn>
          <Btn small kind="outline" onClick={() => onEdit("attendance")}>Attendance</Btn>{m.minutes?.status !== "published" && <Btn small kind="outline" onClick={() => onEdit("minutes")}>Minutes</Btn>}
          {m.status === "scheduled" && <><Btn small kind="ghost" onClick={() => onStatus("held")}>Mark held</Btn><Btn small kind="ghost" onClick={() => onStatus("cancelled")}>Cancel</Btn></>}
        </div>}
      </div>
    </Card>
  )
}

function MeetingModal({ m, members, onClose }: { m?: any; members: any[]; onClose: () => void }) {
  const a = useAction(m ? "patch" : "post", ["/meetings", "/notifications"])
  const local = (iso?: string) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""
  const [f, setF] = useState<any>({ title: m?.title ?? "", kind: m?.kind ?? "board", when: local(m?.scheduledAt), durationMinutes: m?.durationMinutes ?? 60, location: m?.location ?? "", videoLink: m?.videoLink ?? "", attendeeIds: m?.attendees?.map((x: any) => x.memberId) ?? [] })
  const save = async () => {
    await a.run(m ? `/meetings/${m.id}` : "/meetings", { title: f.title, kind: f.kind, scheduledAt: new Date(f.when).toISOString(), durationMinutes: Number(f.durationMinutes), location: f.location || null, videoLink: f.videoLink || null, attendeeIds: f.attendeeIds })
    onClose()
  }
  const active = members.filter((x: any) => !x.status || ["active", "owner"].includes(x.status))
  return (
    <Modal open title={m ? "Edit meeting" : "Schedule a meeting"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
        <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["board", "committee", "agm", "egm", "investor"].map((k) => <option key={k} value={k}>{k.length <= 3 ? k.toUpperCase() : label(k)}</option>)}</Select></Field>
        <Field label="Date and time"><Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
        <Field label="Duration (minutes)"><Input type="number" min={10} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Video link (https)"><Input value={f.videoLink} onChange={(e) => setF({ ...f, videoLink: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><p className="text-xs font-medium text-muted-foreground mb-1">Participants (they'll be notified)</p>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">{active.map((x: any) => (
            <label key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><input type="checkbox" checked={f.attendeeIds.includes(x.id)}
              onChange={(e) => setF({ ...f, attendeeIds: e.target.checked ? [...f.attendeeIds, x.id] : f.attendeeIds.filter((i: string) => i !== x.id) })} />{x.name} · {x.roleLabel}</label>))}</div></div>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={f.title.length < 3 || !f.when}>Save</Btn></div>
    </Modal>
  )
}

function AgendaModal({ m, onClose }: { m: any; onClose: () => void }) {
  const a = useAction("put", ["/meetings"])
  const [items, setItems] = useState<any[]>(m.agenda.length ? m.agenda.map((x: any) => ({ title: x.title, presenter: x.presenter ?? "", notes: x.notes ?? "", documentIds: (x.documentIds ?? []).join(", ") })) : [{ title: "", presenter: "", notes: "", documentIds: "" }])
  const upd = (i: number, k: string, v: string) => setItems(items.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const save = async () => { await a.run(`/meetings/${m.id}/agenda`, { items: items.filter((x) => x.title.trim()).map((x) => ({ ...x, documentIds: x.documentIds.split(",").map((s: string) => s.trim()).filter(Boolean) })) }); onClose() }
  return (
    <Modal open title={`Agenda: ${m.title}`} onClose={onClose} wide>
      <div className="space-y-3">{items.map((x, i) => (
        <div key={i} className="rounded-xl border border-border p-3 grid sm:grid-cols-[2fr_1fr] gap-2">
          <Input placeholder={`Item ${i + 1}`} value={x.title} onChange={(e) => upd(i, "title", e.target.value)} />
          <Input placeholder="Presenter" value={x.presenter} onChange={(e) => upd(i, "presenter", e.target.value)} />
          <Input placeholder="Notes" value={x.notes} onChange={(e) => upd(i, "notes", e.target.value)} />
          <Input placeholder="Document IDs" value={x.documentIds} onChange={(e) => upd(i, "documentIds", e.target.value)} />
        </div>))}
        <Btn kind="outline" small onClick={() => setItems([...items, { title: "", presenter: "", notes: "", documentIds: "" }])}><Plus className="w-3.5 h-3.5" />Add item</Btn>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy}>Save agenda</Btn></div>
    </Modal>
  )
}

function AttendanceModal({ m, onClose }: { m: any; onClose: () => void }) {
  const a = useAction("put", ["/meetings"])
  const [att, setAtt] = useState<Record<string, string>>(Object.fromEntries(m.attendees.map((x: any) => [x.memberId, x.attendance])))
  return (
    <Modal open title="Record attendance" onClose={onClose}>
      <div className="space-y-2">{m.attendees.map((x: any) => (
        <div key={x.memberId} className="flex items-center gap-2"><span className="mr-auto text-sm">{x.name}</span>
          <Select value={att[x.memberId]} onChange={(e) => setAtt({ ...att, [x.memberId]: e.target.value })} className="!w-36">{["invited", "present", "absent", "apologies"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>))}
        {!m.attendees.length && <Empty text="Add participants to the meeting first." />}</div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={async () => { await a.run(`/meetings/${m.id}/attendance`, { attendance: att }); onClose() }} busy={a.busy}>Save</Btn></div>
    </Modal>
  )
}

function MinutesModal({ m, onClose }: { m: any; onClose: () => void }) {
  const a = useAction("put", ["/meetings", "/notifications"])
  const [body, setBody] = useState(m.minutes?.body ?? "")
  const save = async (status: string) => { await a.run(`/meetings/${m.id}/minutes`, { body, status }); onClose() }
  return (
    <Modal open title={`Minutes: ${m.title}`} onClose={onClose} wide>
      <TextArea rows={14} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Minutes of the meeting…" />
      <p className="text-xs text-muted-foreground mt-2">Drafts are visible only to people who manage meetings. Once published, minutes can't be changed.</p>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="outline" onClick={() => save("draft")} busy={a.busy} disabled={body.length < 10}>Save draft</Btn><Btn kind="outline" onClick={() => save("approved")} busy={a.busy} disabled={body.length < 10}>Approve</Btn><Btn onClick={() => save("published")} busy={a.busy} disabled={body.length < 10}>Publish</Btn></div>
    </Modal>
  )
}

// ─── resolutions ────────────────────────────────────────────────────────────
export function Resolutions() {
  const me = useMe()
  const q = useBoard<any>("/resolutions")
  const manage = can(me.data, "resolutions.manage")
  const act = useAction("post", ["/resolutions", "/notifications"])
  const [open, setOpen] = useState(false)
  const list = q.data?.resolutions ?? []
  return (
    <Page title="Resolutions" subtitle="Directors vote as the board; shareholders vote on the share register. The two are never mixed."
      actions={manage ? <Btn onClick={() => setOpen(true)}><Plus className="w-4 h-4" />New resolution</Btn> : undefined}>
      <Loading q={q} />
      <ErrorLine text={act.error} />
      {q.data && !list.length && <Empty text="No resolutions yet." />}
      <div className="space-y-4">{list.map((r: any) => (
        <Card key={r.id} title={`${r.reference} · ${r.title}`} note={`${r.bodyType === "board" ? "Board resolution" : "Shareholder resolution"} · ${label(r.threshold)} · quorum ${r.quorum}${r.weighted ? " · weighted by shares" : ""}`}
          actions={<div className="flex items-center gap-2"><Status value={r.status} />{r.outcome && <Status value={r.outcome} />}</div>}>
          <div className="text-sm whitespace-pre-wrap">{r.body}</div>
          {r.weightingBasis && <p className="text-xs text-muted-foreground mt-2">Weighting authorised by: {r.weightingBasis}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>{r.votesCast} of {r.eligibleCount} voted</span>{r.closesAt && <span>Closes {dateTime(r.closesAt)}</span>}{r.concludedAt && <span>Concluded {dateTime(r.concludedAt)}</span>}
            {r.myVote && <span className="text-foreground">Your vote: <strong>{label(r.myVote)}</strong> (final)</span>}
          </div>
          {r.canVote && <div className="mt-4 rounded-xl border border-border p-3">
            <p className="text-sm font-medium mb-2">Cast your vote. Votes are final once cast.</p>
            <div className="flex flex-wrap gap-2">{["for", "against", "abstain"].map((c) => <Btn key={c} kind={c === "for" ? "primary" : "outline"} busy={act.busy}
              onClick={() => act.run(`/resolutions/${r.id}/vote`, { choice: c })}>{label(c)}</Btn>)}</div>
          </div>}
          {r.result && <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            {["for", "against", "abstain"].map((c) => <div key={c} className="rounded-xl bg-muted py-2"><p className="text-xs text-muted-foreground">{label(c)}</p><p className="font-semibold tabular-nums">{r.result[c].votes}{r.weighted ? ` · ${num(r.result[c].weight)}` : ""}</p></div>)}
            <p className="col-span-3 text-xs text-muted-foreground">{r.result.quorumMet ? "Quorum met." : "Quorum not met."} {r.result.basis}</p>
          </div>}
          {r.voters && <details className="mt-3"><summary className="text-xs cursor-pointer text-muted-foreground">Eligible voters</summary>
            <ul className="text-xs mt-2 space-y-0.5">{r.voters.map((v: any, i: number) => <li key={i}>{v.name}{r.weighted ? ` (weight ${num(v.weight)})` : ""}: {v.choice ? label(v.choice) : v.voted ? "voted" : "not yet voted"}</li>)}</ul></details>}
          {manage && r.status !== "concluded" && r.status !== "cancelled" && <div className="flex flex-wrap gap-2 mt-4">
            {r.status === "draft" && <Btn small onClick={() => act.run(`/resolutions/${r.id}/open`)}>Open for voting</Btn>}
            {r.status === "open" && <Btn small onClick={() => act.run(`/resolutions/${r.id}/conclude`)}>Conclude and publish result</Btn>}
            <Btn small kind="ghost" onClick={() => act.run(`/resolutions/${r.id}/cancel`)}>Cancel</Btn>
          </div>}
        </Card>))}
      </div>
      {open && <ResolutionModal onClose={() => setOpen(false)} />}
    </Page>
  )
}

function ResolutionModal({ onClose }: { onClose: () => void }) {
  const a = useAction("post", ["/resolutions"])
  const [f, setF] = useState<any>({ title: "", body: "", bodyType: "board", threshold: "simple_majority", quorum: 1, weighted: false, weightingBasis: "", closesAt: "", documentIds: "" })
  const save = async () => {
    await a.run("/resolutions", { ...f, quorum: Number(f.quorum), closesAt: f.closesAt ? new Date(f.closesAt).toISOString() : null, weightingBasis: f.weightingBasis || null, documentIds: f.documentIds.split(",").map((s: string) => s.trim()).filter(Boolean) })
    onClose()
  }
  return (
    <Modal open title="New resolution" onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Resolution text"><TextArea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
        <Field label="Who votes"><Select value={f.bodyType} onChange={(e) => setF({ ...f, bodyType: e.target.value, weighted: e.target.value === "board" ? false : f.weighted })}><option value="board">The board (directors)</option><option value="shareholders">Shareholders (on the register)</option></Select></Field>
        <Field label="Passes with"><Select value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })}>{["simple_majority", "two_thirds", "three_quarters", "unanimous"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Quorum (minimum votes cast)"><Input type="number" min={1} value={f.quorum} onChange={(e) => setF({ ...f, quorum: e.target.value })} /></Field>
        <Field label="Voting deadline"><Input type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></Field>
        {f.bodyType === "shareholders" && <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.weighted} onChange={(e) => setF({ ...f, weighted: e.target.checked })} />Weight votes by voting shares</label>
          {f.weighted && <Field label="Legal basis for weighting" hint="e.g. Articles of association, clause 12"><Input value={f.weightingBasis} onChange={(e) => setF({ ...f, weightingBasis: e.target.value })} /></Field>}
        </>}
        <div className="sm:col-span-2"><Field label="Supporting document IDs (optional)"><Input value={f.documentIds} onChange={(e) => setF({ ...f, documentIds: e.target.value })} /></Field></div>
      </div>
      <Notes items={["Eligible voters default to every active director (board) or every member with voting shares on the register (shareholders). Check the company's constitution and shareholder agreements before opening a vote."]} />
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={f.title.length < 5 || f.body.length < 10}>Create draft</Btn></div>
    </Modal>
  )
}

// ─── reports ────────────────────────────────────────────────────────────────
export function Reports() {
  const q = useBoard<any>("/reports")
  const [open, setOpen] = useState(false)
  const pub = q.data?.canPublish
  return (
    <Page title="Reports" subtitle="Published reports are frozen: corrections are published as a new version." actions={pub ? <Btn onClick={() => setOpen(true)}><Plus className="w-4 h-4" />New report</Btn> : undefined}>
      <Loading q={q} />
      {q.data && <Card>
        <Table rows={q.data.reports} empty="No reports published yet." cols={[["Report", (r: any) => <Link href={`/reports/${r.id}`} className="font-medium hover:underline">{r.title}</Link>], ["Period", (r: any) => `${dateLabel(r.periodStart)} – ${dateLabel(r.periodEnd)}`], ["Type", (r: any) => label(r.kind)], ["Version", (r: any) => `v${r.version}`, "r"],
          ["Status", (r: any) => <Status value={r.status} />], ["Reconciliation", (r: any) => <Status value={r.reconciliationStatus === "reconciled" ? "reconciled" : "unreconciled"} text={label(r.reconciliationStatus)} />], ["Published", (r: any) => r.publishedAt ? dateLabel(r.publishedAt) : "—"],
          ["", (r: any) => ["published", "superseded"].includes(r.status) ? <Btn small kind="ghost" onClick={() => download(`/reports/${r.id}/pdf`, `bukkapay-report-${r.periodEnd}-v${r.version}.pdf`)}><Download className="w-3.5 h-3.5" />PDF</Btn> : null]]} />
      </Card>}
      {open && <ReportModal onClose={() => setOpen(false)} />}
    </Page>
  )
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const a = useAction("post", ["/reports"])
  const [f, setF] = useState<any>({ kind: "monthly", title: "", periodStart: "", periodEnd: "", summary: "", audience: [] as string[] })
  const save = async () => { await a.run("/reports", f); onClose() }
  return (
    <Modal open title="New report" onClose={onClose} wide>
      <p className="text-sm text-muted-foreground mb-3">The figures are captured now and frozen. Approve, then publish.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["monthly", "quarterly", "annual", "custom", "board_pack"].map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="October 2026 report" /></Field>
        <Field label="From"><Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Management commentary"><TextArea rows={6} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><AudiencePicker value={f.audience} onChange={(v) => setF({ ...f, audience: v })} /></div>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={f.title.length < 3 || !f.periodStart || !f.periodEnd}>Create draft</Btn></div>
    </Modal>
  )
}

export function ReportDetail() {
  const [, params] = useRoute("/reports/:id")
  const id = params?.id ?? ""
  const q = useBoard<any>(`/reports/${id}`, undefined, !!id)
  const a = useAction("post", ["/reports"])
  const del = useAction("delete", ["/reports"])
  const [correct, setCorrect] = useState(false)
  const [note, setNote] = useState("")
  const r = q.data
  const st = r?.snapshot?.statements
  return (
    <Page title={r?.title ?? "Report"} subtitle={r ? `${dateLabel(r.periodStart)} – ${dateLabel(r.periodEnd)} · version ${r.version} · ${r.reportingCurrency}` : undefined}
      actions={r && <>
        {["published", "superseded"].includes(r.status) && <Btn kind="outline" onClick={() => download(`/reports/${r.id}/pdf`, `bukkapay-report-${r.periodEnd}-v${r.version}.pdf`)}><FileText className="w-4 h-4" />Download PDF</Btn>}
        {r.status === "draft" && <><Btn onClick={() => a.run(`/reports/${r.id}/approve`)} busy={a.busy}>Approve</Btn><Btn kind="ghost" onClick={() => del.run(`/reports/${r.id}`).then(() => history.back())}>Delete draft</Btn></>}
        {r.status === "approved" && <Btn onClick={() => a.run(`/reports/${r.id}/publish`)} busy={a.busy}>Publish</Btn>}
        {r.status === "published" && q.data && <Btn kind="outline" onClick={() => setCorrect(true)}>Publish a correction</Btn>}
      </>}>
      <Loading q={q} />
      <ErrorLine text={a.error || del.error} />
      {r && <>
        <div className="flex flex-wrap gap-2 text-xs">
          <Status value={r.status} /><span className="rounded-full bg-muted px-2.5 py-1">Accounts: {label(r.accountsStatus)}</span><span className="rounded-full bg-muted px-2.5 py-1">Reconciliation: {label(r.reconciliationStatus)}</span>
          {r.publishedAt && <span className="rounded-full bg-muted px-2.5 py-1">Published {dateTime(r.publishedAt)} by {r.publishedBy}</span>}
          {r.contentSha256 && <span className="rounded-full bg-muted px-2.5 py-1 font-mono" title="Fingerprint of the frozen content">SHA-256 {r.contentSha256.slice(0, 16)}…</span>}
        </div>
        {r.status === "superseded" && <Banner>This version has been superseded by a correction.</Banner>}
        {r.correctionNote && <Banner tone="info">Correction: {r.correctionNote}</Banner>}
        {r.summary && <Card title="Commentary"><div className="text-sm whitespace-pre-wrap leading-relaxed">{r.summary}</div></Card>}
        {st && <Card title="Profit and loss" note={label(st.status)}>
          <Table rows={st.months} cols={[["Month", (m: any) => m.month.slice(0, 7)], ["Revenue", (m: any) => num(m.revenue), "r"], ["Direct costs", (m: any) => num(m.directCosts), "r"], ["Gross profit", (m: any) => num(m.grossProfit), "r"], ["Operating exp.", (m: any) => m.operatingExpenses != null ? num(m.operatingExpenses) : "n/a", "r"], ["Net", (m: any) => m.netProfit != null ? num(m.netProfit) : "n/a", "r"]]} />
        </Card>}
        {r.snapshot?.revenue && <Card title="Revenue streams"><Table rows={r.snapshot.revenue.streams} cols={[["Stream", (x: any) => x.label], ["Status", (x: any) => <Status value={x.status} />], ["Actual", (x: any) => <PerCurrency rows={x.actual} />, "r"]]} /></Card>}
        {r.snapshot?.currencies && <Card title="By currency"><Table rows={r.snapshot.currencies} cols={[["Currency", (x: any) => x.code], ["Wallet balances", (x: any) => num(x.customerWalletBalances), "r"], ["Deposits", (x: any) => num(x.deposits), "r"], ["Withdrawals", (x: any) => num(x.withdrawals), "r"], ["Revenue", (x: any) => num(x.revenue), "r"]]} /></Card>}
        <Notes items={r.methodology?.dataSources} />
      </>}
      <Modal open={correct} title="Publish a correction" onClose={() => setCorrect(false)}>
        <p className="text-sm text-muted-foreground mb-3">This creates a new version with today's figures. The published version stays on record, marked superseded once the correction is published.</p>
        <Field label="What changed and why"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorLine text={a.error} />
        <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={() => setCorrect(false)}>Cancel</Btn><Btn busy={a.busy} disabled={note.length < 5} onClick={async () => { const n = await a.run(`/reports/${r.id}/correct`, { note }); window.location.assign(`/reports/${n.id}`) }}>Create correction draft</Btn></div>
      </Modal>
    </Page>
  )
}

// ─── documents ──────────────────────────────────────────────────────────────
export function Documents() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const q = useBoard<any>("/documents", { ...(search ? { q: search } : {}), ...(category ? { category } : {}) })
  const [upload, setUpload] = useState<any | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const archive = useAction("post", ["/documents"])
  const open = async (d: any) => {
    setErr(null)
    try {
      const { data } = await boardApi.post(`/documents/${d.id}/download`)
      const a = Object.assign(document.createElement("a"), { href: data.url, target: "_blank", rel: "noopener noreferrer", download: data.filename })
      a.click()
    } catch (e) { setErr(errorText(e)) }
  }
  return (
    <Page title="Document library" subtitle="Private storage. Downloads use links that expire in two minutes."
      actions={<>
        <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-48 h-9" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-48 h-9 !py-1"><option value="">All categories</option>{q.data?.categories.map((c: string) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        {q.data?.canManage && <Btn onClick={() => setUpload({})}><Upload className="w-4 h-4" />Upload</Btn>}
      </>}>
      <Loading q={q} />
      <ErrorLine text={err || archive.error} />
      {q.data && <Card>
        <Table rows={q.data.documents} empty="No documents yet." cols={[["Document", (d: any) => <><button onClick={() => open(d)} className="font-medium hover:underline text-left">{d.title}</button>{d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}<p className="text-[11px] text-muted-foreground">{d.filename} · {num(d.sizeBytes / 1024)} KB</p></>],
          ["Category", (d: any) => label(d.category)], ["Version", (d: any) => <span title={d.versions.map((v: any) => `v${v.version} ${dateLabel(v.uploadedAt)}`).join("\n")}>v{d.version}{d.versions.length > 1 ? ` of ${d.versions.length}` : ""}</span>],
          ["Audience", (d: any) => <span className="text-xs">{d.audience.length ? d.audience.map((a: string) => ROLE_LABELS[a] ?? a).join(", ") : "All members"}</span>], ["Uploaded", (d: any) => <span className="text-xs">{dateTime(d.uploadedAt)}<br />{d.uploadedBy}</span>],
          ["", (d: any) => <div className="flex gap-1"><Btn small kind="ghost" onClick={() => open(d)}><Download className="w-3.5 h-3.5" /></Btn>{q.data.canManage && <><Btn small kind="ghost" onClick={() => setUpload({ familyId: d.familyId, title: d.title, category: d.category, audience: d.audience })}>New version</Btn>{!d.archived && <Btn small kind="ghost" onClick={() => archive.run(`/documents/${d.id}/archive`)}>Archive</Btn>}</>}<span className="text-[10px] text-muted-foreground self-center font-mono" title="Document ID">{d.id.slice(0, 8)}</span></div>]]} />
      </Card>}
      {upload && <UploadModal init={upload} categories={q.data?.categories ?? []} onClose={() => setUpload(null)} />}
    </Page>
  )
}

const MIME_OK = ["application/pdf", "image/png", "image/jpeg", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]

function UploadModal({ init, categories, onClose }: { init: any; categories: string[]; onClose: () => void }) {
  const a = useAction("post", ["/documents", "/notifications"])
  const [f, setF] = useState<any>({ title: init.title ?? "", description: "", category: init.category ?? "investor_presentation", audience: init.audience ?? [] })
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!file) return
    if (!MIME_OK.includes(file.type)) { setErr("Upload a PDF, Word, Excel, PowerPoint, CSV, PNG or JPEG file"); return }
    if (file.size > 20 * 1024 * 1024) { setErr("Files must be 20 MB or smaller"); return }
    const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file) })
    await a.run("/documents", { ...f, filename: file.name, mimeType: file.type, base64: b64, familyId: init.familyId ?? null, description: f.description || null })
    onClose()
  }
  return (
    <Modal open title={init.familyId ? "Upload a new version" : "Upload a document"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="File (max 20 MB)"><input type="file" accept={MIME_OK.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></Field></div>
        <div className="sm:col-span-2"><AudiencePicker value={f.audience} onChange={(v) => setF({ ...f, audience: v })} /></div>
      </div>
      <ErrorLine text={err || a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={!file || f.title.length < 2}>Upload</Btn></div>
    </Modal>
  )
}

// ─── announcements ──────────────────────────────────────────────────────────
export function Announcements() {
  const q = useBoard<any>("/announcements")
  const [edit, setEdit] = useState<any | null>(null)
  return (
    <Page title="Announcements" actions={q.data?.canManage ? <Btn onClick={() => setEdit({})}><Plus className="w-4 h-4" />New announcement</Btn> : undefined}>
      <Loading q={q} />
      {q.data && !q.data.announcements.length && <Empty text="No announcements yet." />}
      <div className="space-y-4 max-w-3xl">{q.data?.announcements.map((u: any) => (
        <Card key={u.id}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Status value={u.status} /><span>{label(u.category)}</span>{u.period && <span>· {u.period}</span>}{u.publishedAt && <span>· {dateLabel(u.publishedAt)}</span>}
            {u.audience.length > 0 && <span>· for {u.audience.map((a: string) => ROLE_LABELS[a] ?? a).join(", ")}</span>}
            {q.data.canManage && <Btn small kind="ghost" onClick={() => setEdit(u)}>Edit</Btn>}</div>
          <h2 className="text-lg font-semibold mt-2">{u.title}</h2>
          <div className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{u.body}</div>
          {u.documentIds.length > 0 && <p className="text-xs text-muted-foreground mt-3">{u.documentIds.length} attachment(s) in the document library.</p>}
        </Card>))}
      </div>
      {edit && <AnnouncementModal u={edit} categories={q.data?.categories ?? []} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function AnnouncementModal({ u, categories, onClose }: { u: any; categories: string[]; onClose: () => void }) {
  const a = useAction(u.id ? "patch" : "post", ["/announcements", "/notifications", "/updates"])
  const [f, setF] = useState<any>({ title: u.title ?? "", period: u.period ?? "", body: u.body ?? "", category: u.category ?? "business_update", audience: u.audience ?? [], documentIds: (u.documentIds ?? []).join(", ") })
  const save = async (publish: boolean) => { await a.run(u.id ? `/announcements/${u.id}` : "/announcements", { ...f, period: f.period || null, documentIds: f.documentIds.split(",").map((s: string) => s.trim()).filter(Boolean), publish }); onClose() }
  return (
    <Modal open title={u.id ? "Edit announcement" : "New announcement"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
        <Field label="Period (optional)"><Input value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} placeholder="November 2026" /></Field>
        <Field label="Attachment document IDs"><Input value={f.documentIds} onChange={(e) => setF({ ...f, documentIds: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Message"><TextArea rows={8} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><AudiencePicker value={f.audience} onChange={(v) => setF({ ...f, audience: v })} /></div>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="outline" onClick={() => save(false)} busy={a.busy} disabled={f.title.length < 3 || f.body.length < 10}>Save draft</Btn><Btn onClick={() => save(true)} busy={a.busy} disabled={f.title.length < 3 || f.body.length < 10}>Publish and notify</Btn></div>
    </Modal>
  )
}
