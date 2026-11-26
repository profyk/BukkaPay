import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { can, useBoard, useMe } from "../api"
import {
  BAD, Btn, Card, Empty, ErrorLine, Field, Input, Legend, Loading, Modal, Notes, Page, PeriodPicker, PerCurrency, S1, S2,
  S3, Select, Status, Table, TextArea, dateLabel, label, num, useAction, usePeriod,
} from "../kit"

// Tile map of Africa: one square per country, roughly in place (not to scale).
const TILES: Record<string, [number, number]> = {
  MA: [2, 0], DZ: [3, 0], TN: [4, 0], LY: [5, 0], EG: [6, 0],
  MR: [1, 1], ML: [2, 1], BF: [3, 1], NE: [4, 1], TD: [5, 1], SD: [6, 1], ER: [7, 1],
  SN: [0, 2], GM: [1, 2], GN: [2, 2], CI: [3, 2], GH: [4, 2], NG: [5, 2], CF: [6, 2], SS: [7, 2], ET: [8, 2], DJ: [9, 2],
  GW: [0, 3], SL: [1, 3], LR: [2, 3], TG: [3, 3], BJ: [4, 3], CM: [5, 3], CD: [6, 3], UG: [7, 3], KE: [8, 3], SO: [9, 3],
  CV: [0, 4], ST: [2, 4], GQ: [3, 4], GA: [4, 4], CG: [5, 4], RW: [6, 4], BI: [7, 4], TZ: [8, 4], KM: [9, 4],
  AO: [5, 5], ZM: [6, 5], MW: [7, 5], MZ: [8, 5], SC: [9, 5],
  NA: [4, 6], BW: [5, 6], ZW: [6, 6], MG: [8, 6], MU: [9, 6],
  ZA: [5, 7], LS: [6, 7], SZ: [7, 7],
}
const STATUS_COLOR: Record<string, string> = { Operational: S1, Pilot: S3, "Under development": S2, Planned: "hsl(var(--muted))", "Temporarily suspended": BAD }

export function Countries() {
  const per = usePeriod("month")
  const q = useBoard<any>("/countries", per.params, per.ready)
  const [sel, setSel] = useState<string | null>(null)
  const list = q.data?.countries ?? []
  const byCode = useMemo(() => Object.fromEntries(list.map((c: any) => [c.code, c])), [list])
  const c = sel ? byCode[sel] : null
  const counts = list.reduce((a: any, x: any) => { a[x.statusLabel] = (a[x.statusLabel] ?? 0) + 1; return a }, {})
  return (
    <Page title="Countries & expansion" subtitle="Where BukkaPay operates, pilots and plans to launch." actions={<PeriodPicker value={per.p} onChange={per.setP} />}>
      <Loading q={q} />
      {q.data && <>
        <div className="grid lg:grid-cols-[minmax(0,520px)_1fr] gap-4">
          <Card title="African expansion map" note="Tile map: each square is a country, roughly in place. Select one for details.">
            <Legend items={Object.keys(STATUS_COLOR).map((k) => [`${k} (${counts[k] ?? 0})`, STATUS_COLOR[k]])} />
            <div className="relative mx-auto" style={{ display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: 4, maxWidth: 480 }}>
              {Array.from({ length: 80 }).map((_, i) => {
                const x = i % 10, y = Math.floor(i / 10)
                const code = Object.keys(TILES).find((k) => TILES[k][0] === x && TILES[k][1] === y)
                if (!code) return <span key={i} />
                const row = byCode[code]
                const bg = row ? STATUS_COLOR[row.statusLabel] : "transparent"
                const dark = row && ["Operational", "Under development", "Temporarily suspended", "Pilot"].includes(row.statusLabel)
                return (
                  <button key={i} onClick={() => setSel(code)} aria-label={`${row?.name ?? code}: ${row?.statusLabel ?? "not listed"}`}
                    title={`${row?.name ?? code}: ${row?.statusLabel ?? "not listed"}`}
                    className={`aspect-square rounded-md text-[10px] font-semibold border transition-transform hover:scale-110 ${sel === code ? "ring-2 ring-offset-2 ring-offset-card ring-foreground" : ""} ${row ? "border-transparent" : "border-dashed border-border text-muted-foreground"}`}
                    style={{ background: bg, color: dark ? "#fff" : undefined }}>{code}</button>
                )
              })}
            </div>
          </Card>
          <Card title={c ? c.name : "Select a country"} note={c ? `${c.statusLabel}${c.launchedAt ? ` · launched ${dateLabel(c.launchedAt)}` : ""}` : "Click a tile on the map, or a row below."}>
            {c ? <CountryDetail c={c} /> : <Empty text="No country selected." />}
          </Card>
        </div>
        <Card title="All countries">
          <Table rows={list.filter((x: any) => x.status !== "planned" || x.statusLabel !== "Planned" || x.registeredCustomers > 0 || x.merchants > 0).concat(list.filter((x: any) => x.statusLabel === "Planned" && !x.registeredCustomers && !x.merchants))}
            cols={[["Country", (r: any) => <button className="text-left font-medium hover:underline" onClick={() => setSel(r.code)}>{r.name}</button>], ["Status", (r: any) => <Status value={r.statusLabel === "Operational" ? "live" : r.statusLabel === "Pilot" ? "pilot" : r.statusLabel === "Temporarily suspended" ? "suspended" : "planned"} text={r.statusLabel} />],
              ["Currencies", (r: any) => r.currencies.map((x: any) => x.currency + (x.walletEnabled ? "" : "*")).join(", ") || r.defaultCurrency], ["Customers", (r: any) => num(r.registeredCustomers), "r"], ["Active", (r: any) => num(r.activeCustomers), "r"], ["Merchants", (r: any) => num(r.merchants), "r"],
              ["Volume", (r: any) => <PerCurrency rows={r.volume} field="volume" />, "r"], ["Revenue", (r: any) => <PerCurrency rows={r.revenue} field="revenue" />, "r"]]} />
          <p className="text-xs text-muted-foreground mt-2">* Currency used in the country but not enabled for wallets.</p>
        </Card>
        <Notes items={q.data.notes} />
      </>}
    </Page>
  )
}

function CountryDetail({ c }: { c: any }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        {[["Customers", c.registeredCustomers], ["Active", c.activeCustomers], ["Merchants", c.merchants]].map(([l, v]) => <div key={l} className="rounded-xl bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold tabular-nums">{num(v)}</p></div>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><p className="text-xs text-muted-foreground">Transaction volume</p><PerCurrency rows={c.volume} field="volume" /></div>
        <div><p className="text-xs text-muted-foreground">Company revenue</p><PerCurrency rows={c.revenue} field="revenue" /></div>
        <div><p className="text-xs text-muted-foreground">Operating expenses / profitability</p><span className="text-muted-foreground">Not tracked by country</span></div>
        <div><p className="text-xs text-muted-foreground">Regulator / licence model</p>{c.regulator ?? "—"} {c.licenceModel ? `· ${label(c.licenceModel)}` : ""}</div>
      </div>
      <div><p className="text-xs text-muted-foreground mb-1">Readiness</p><div className="flex flex-wrap gap-2">{Object.entries(c.readiness).map(([k, v]) => <Status key={k} value={v ? "approved" : "pending"} text={`${label(k)}: ${v ? "ready" : "not yet"}`} />)}</div></div>
      <div><p className="text-xs text-muted-foreground mb-1">Custodians</p>{c.custodians.length ? c.custodians.map((x: any, i: number) => <p key={i}>{x.name} · {x.currency} · {x.role} · <Status value={x.status} /></p>) : <span className="text-muted-foreground">None recorded</span>}</div>
      <div><p className="text-xs text-muted-foreground mb-1">Banking and PSP partners</p>{c.partners.length ? c.partners.map((x: any, i: number) => <p key={i}>{x.name} ({label(x.type)}) · <Status value={x.status} /></p>) : <span className="text-muted-foreground">None recorded</span>}</div>
      <div><p className="text-xs text-muted-foreground mb-1">Milestones</p>{c.milestones.length ? c.milestones.map((x: any, i: number) => <p key={i}>{x.title} · {x.progress}% · <Status value={x.status} /></p>) : <span className="text-muted-foreground">None recorded</span>}</div>
    </div>
  )
}

// ─── milestones ─────────────────────────────────────────────────────────────
const MS_CATEGORIES = ["banking_partnership", "psp_partnership", "custodian_partnership", "merchant_acquisition", "pos_network", "country_launch", "regulatory", "product_launch", "payment_corridor", "technology"]

export function Milestones() {
  const me = useMe()
  const q = useBoard<any>("/milestones")
  const [edit, setEdit] = useState<any | null>(null)
  const [cat, setCat] = useState("")
  const rows = (q.data?.milestones ?? []).filter((m: any) => !cat || m.category === cat)
  return (
    <Page title="Strategic milestones" subtitle={q.data?.note}
      actions={<>
        <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="!w-52 h-9 !py-1"><option value="">All categories</option>{MS_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>
        {can(me.data, "milestones.manage") && <Btn onClick={() => setEdit({ status: "planned", progress: 0, partnershipStage: "not_applicable", category: "product_launch" })}><Plus className="w-4 h-4" />Add milestone</Btn>}
      </>}>
      <Loading q={q} />
      {q.data && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {!rows.length && <Empty text="No milestones recorded yet." />}
        {rows.map((m: any) => (
          <Card key={m.id} title={m.title} note={`${label(m.category)}${m.country_code ? ` · ${m.country_code}` : ""}`}
            actions={can(me.data, "milestones.manage") ? <Btn small kind="ghost" onClick={() => setEdit(m)}>Edit</Btn> : undefined}>
            {m.description && <p className="text-sm text-muted-foreground mb-3">{m.description}</p>}
            <div className="h-2 rounded-full bg-muted overflow-hidden mb-2"><div className="h-full rounded-full" style={{ width: `${m.progress}%`, background: S1 }} /></div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><Status value={m.status} /><span className="tabular-nums">{m.progress}%</span>
              {m.partnership_stage !== "not_applicable" && <Status value={["signed", "live"].includes(m.partnership_stage) ? "signed" : "proposed"} text={q.data.stageLabels[m.partnership_stage]} />}</div>
            <dl className="grid grid-cols-2 gap-2 text-xs mt-3">
              <div><dt className="text-muted-foreground">Responsible</dt><dd>{m.responsible ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Target</dt><dd>{dateLabel(m.target_date)}</dd></div>
              {m.completed_on && <div><dt className="text-muted-foreground">Completed</dt><dd>{dateLabel(m.completed_on)}</dd></div>}
              {m.document_ids?.length > 0 && <div><dt className="text-muted-foreground">Documents</dt><dd>{m.document_ids.length} attached</dd></div>}
            </dl>
            {m.comments && <p className="text-xs mt-3 border-t border-border pt-2">{m.comments}</p>}
          </Card>
        ))}
      </div>}
      {edit && <MilestoneModal m={edit} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function MilestoneModal({ m, onClose }: { m: any; onClose: () => void }) {
  const a = useAction(m.id ? "patch" : "post", ["/milestones", "/health", "/countries"])
  const [f, setF] = useState<any>({ category: m.category, title: m.title ?? "", description: m.description ?? "", responsible: m.responsible ?? "", countryCode: m.country_code ?? "",
    targetDate: m.target_date ?? "", completedOn: m.completed_on ?? "", status: m.status, progress: m.progress, partnershipStage: m.partnership_stage ?? m.partnershipStage, comments: m.comments ?? "", documentIds: (m.document_ids ?? []).join(", ") })
  const save = async () => {
    await a.run(m.id ? `/milestones/${m.id}` : "/milestones", { ...f, countryCode: f.countryCode || null, targetDate: f.targetDate || null, completedOn: f.completedOn || null,
      progress: Number(f.progress), documentIds: f.documentIds.split(",").map((s: string) => s.trim()).filter(Boolean) })
    onClose()
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  return (
    <Modal open title={m.id ? "Edit milestone" : "New milestone"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title"><Input value={f.title} onChange={set("title")} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set("category")}>{MS_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Description"><TextArea value={f.description} onChange={set("description")} /></Field></div>
        <Field label="Responsible executive"><Input value={f.responsible} onChange={set("responsible")} /></Field>
        <Field label="Country (optional)"><Input maxLength={2} value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value.toUpperCase() })} /></Field>
        <Field label="Target date"><Input type="date" value={f.targetDate} onChange={set("targetDate")} /></Field>
        <Field label="Completion date"><Input type="date" value={f.completedOn} onChange={set("completedOn")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["planned", "in_progress", "completed", "delayed", "cancelled"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label={`Progress: ${f.progress}%`}><input type="range" min={0} max={100} step={5} value={f.progress} onChange={set("progress")} className="w-full" /></Field>
        <Field label="Partnership stage" hint="Only 'Signed' and 'Live' are confirmed partnerships."><Select value={f.partnershipStage} onChange={set("partnershipStage")}>{["not_applicable", "proposed", "in_discussion", "signed", "live"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Supporting document IDs" hint="Comma-separated, from Documents."><Input value={f.documentIds} onChange={set("documentIds")} /></Field>
        <div className="sm:col-span-2"><Field label="Management comments"><TextArea value={f.comments} onChange={set("comments")} /></Field></div>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={f.title.length < 3}>Save</Btn></div>
    </Modal>
  )
}

// ─── risks ──────────────────────────────────────────────────────────────────
const RISK_CATEGORIES = ["financial", "liquidity", "regulatory", "compliance", "operational", "technology", "cybersecurity", "partner", "fx", "strategic", "reputational", "legal"]

export function Risks() {
  const me = useMe()
  const q = useBoard<any>("/risks")
  const [edit, setEdit] = useState<any | null>(null)
  const risks = q.data?.risks ?? []
  const open = risks.filter((r: any) => r.status !== "closed")
  return (
    <Page title="Risk register" subtitle="Likelihood × impact on a 1–5 scale. 15 or more is high."
      actions={can(me.data, "risks.manage") ? <Btn onClick={() => setEdit({ likelihood: 3, impact: 3, status: "open", category: "operational" })}><Plus className="w-4 h-4" />Add risk</Btn> : undefined}>
      <Loading q={q} />
      {q.data && <>
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <Card title="Heat map" note="Open risks by likelihood and impact.">
            <div className="grid gap-1" style={{ gridTemplateColumns: "auto repeat(5, minmax(0,1fr))" }}>
              {[5, 4, 3, 2, 1].map((l) => [
                <span key={`l${l}`} className="text-[10px] text-muted-foreground pr-1 self-center">{l}</span>,
                ...[1, 2, 3, 4, 5].map((i) => {
                  const n = open.filter((r: any) => r.likelihood === l && r.impact === i).length
                  const score = l * i
                  return <div key={`${l}${i}`} title={`Likelihood ${l}, impact ${i}: ${n} risk(s)`} className="aspect-square rounded flex items-center justify-center text-xs font-semibold tabular-nums"
                    style={{ background: `color-mix(in oklab, ${score >= 15 ? BAD : score >= 8 ? S3 : S1} ${n ? 70 : 14}%, transparent)`, color: n ? "#fff" : undefined }}>{n || ""}</div>
                }),
              ])}
              <span />{[1, 2, 3, 4, 5].map((i) => <span key={i} className="text-[10px] text-muted-foreground text-center">{i}</span>)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Up: likelihood. Across: impact.</p>
          </Card>
          <Card title="Risks">
            <Table rows={risks} empty="No risks recorded yet." cols={[["Risk", (r: any) => <><p className="font-medium">{r.title}</p>{r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}</>], ["Category", (r: any) => label(r.category)],
              ["Score", (r: any) => <Status value={r.rating === "high" ? "behind_target" : r.rating === "medium" ? "needs_attention" : "on_track"} text={`${r.score} ${r.rating}`} />], ["Owner", (r: any) => r.owner ?? "—"], ["Mitigation", (r: any) => <span className="text-xs">{r.mitigation ?? "—"}</span>],
              ["Status", (r: any) => <Status value={r.status} />], ["Review", (r: any) => dateLabel(r.review_date)],
              ["", (r: any) => can(me.data, "risks.manage") ? <Btn small kind="ghost" onClick={() => setEdit(r)}>Edit</Btn> : null]]} />
          </Card>
        </div>
      </>}
      {edit && <RiskModal r={edit} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function RiskModal({ r, onClose }: { r: any; onClose: () => void }) {
  const a = useAction(r.id ? "patch" : "post", ["/risks", "/health"])
  const [f, setF] = useState<any>({ title: r.title ?? "", description: r.description ?? "", category: r.category, likelihood: r.likelihood, impact: r.impact, owner: r.owner ?? "", mitigation: r.mitigation ?? "", status: r.status, reviewDate: r.review_date ?? "" })
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const save = async () => { await a.run(r.id ? `/risks/${r.id}` : "/risks", { ...f, likelihood: Number(f.likelihood), impact: Number(f.impact), reviewDate: f.reviewDate || null }); onClose() }
  return (
    <Modal open title={r.id ? "Edit risk" : "New risk"} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Title"><Input value={f.title} onChange={set("title")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><TextArea value={f.description} onChange={set("description")} /></Field></div>
        <Field label="Category"><Select value={f.category} onChange={set("category")}>{RISK_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select></Field>
        <Field label="Risk owner"><Input value={f.owner} onChange={set("owner")} /></Field>
        <Field label="Likelihood (1–5)"><Select value={f.likelihood} onChange={set("likelihood")}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Field label="Impact (1–5)"><Select value={f.impact} onChange={set("impact")}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Mitigation plan"><TextArea value={f.mitigation} onChange={set("mitigation")} /></Field></div>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["open", "mitigating", "accepted", "closed"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Review date"><Input type="date" value={f.reviewDate} onChange={set("reviewDate")} /></Field>
      </div>
      <ErrorLine text={a.error} />
      <div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={f.title.length < 3}>Save</Btn></div>
    </Modal>
  )
}
