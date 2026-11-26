import { useState } from "react"
import { Plus } from "lucide-react"
import { can, useBoard, useMe } from "../api"
import {
  Banner, Btn, Card, Empty, ErrorLine, Field, Input, Kpi, Loading, Modal, Notes, Page, S1, Select, Status, Table, TextArea,
  dateLabel, dateTime, label, money, num, useAction,
} from "../kit"

function Progress({ value, tone = S1 }: { value?: string | null; tone?: string }) {
  const v = Math.min(100, Number(value ?? 0))
  return <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${v}%`, background: tone }} /></div>
}

export function MyInvestment() {
  const q = useBoard<any>("/investments/me")
  const d = q.data
  return (
    <Page title="My investment" subtitle="Your own records. Nobody else's are shown here, and yours aren't shown to other investors.">
      <Loading q={q} />
      {d && (!d.profile ? <Empty text={d.note} /> : <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Investor" value={<span className="text-base">{d.profile.legalName}</span>} sub={label(d.profile.entityType)} />
          <Kpi label="Shares held" value={num(d.totalShares)} />
          <Kpi label="Recorded ownership" value={d.ownershipPercent != null ? `${d.ownershipPercent}%` : "—"} sub="Of shares on the register" />
          <Kpi label="Investments" value={num(d.investments.length)} />
        </div>
        <Card title="Investments">
          <Table rows={d.investments} cols={[["Instrument", (r: any) => label(r.instrument)], ["Committed", (r: any) => money(r.committed, r.currency), "r"], ["Received", (r: any) => money(r.received, r.currency), "r"], ["Outstanding", (r: any) => money(r.outstanding, r.currency), "r"], ["Committed on", (r: any) => dateLabel(r.commitmentDate)], ["Status", (r: any) => <Status value={r.status} />], ["Reference", (r: any) => r.legalReference ?? "—"]]} />
        </Card>
        <Card title="Shareholding">
          <Table rows={d.shareholdings} empty="No shares recorded on the register for you." cols={[["Class", (r: any) => r.shareClass], ["Shares", (r: any) => num(r.shares), "r"], ["% of class", (r: any) => r.classPercent ? `${r.classPercent}%` : "—", "r"], ["Voting", (r: any) => r.voting ? "Yes" : "No"], ["Effective", (r: any) => dateLabel(r.effectiveDate)], ["Register reference", (r: any) => r.legalReference]]} />
        </Card>
        <Notes items={[d.note]} />
      </>)}
    </Page>
  )
}

export function Fundraising() {
  const q = useBoard<any>("/fundraising")
  return (
    <Page title="Fundraising" subtitle={q.data?.note}>
      <Loading q={q} />
      {q.data && <div className="grid md:grid-cols-2 gap-4">
        {!q.data.rounds.length && <Empty text="No funding rounds recorded yet." />}
        {q.data.rounds.map((r: any) => (
          <Card key={r.id} title={r.name} note={`${label(r.instrument)} · ${r.currency}`} actions={<Status value={r.status} />}>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div><p className="text-xs text-muted-foreground">Target</p><p className="font-semibold tabular-nums">{money(r.target, r.currency)}</p></div>
              <div><p className="text-xs text-muted-foreground">Remaining</p><p className="font-semibold tabular-nums">{money(r.remaining, r.currency)}</p></div>
              <div><p className="text-xs text-muted-foreground">Committed</p><p className="tabular-nums">{money(r.committed, r.currency)} ({r.progress ?? 0}%)</p></div>
              <div><p className="text-xs text-muted-foreground">Received</p><p className="tabular-nums">{money(r.received, r.currency)} ({r.receivedProgress ?? 0}%)</p></div>
            </div>
            <p className="text-xs text-muted-foreground mb-1">Committed</p><Progress value={r.progress} />
            <p className="text-xs text-muted-foreground mb-1 mt-2">Received</p><Progress value={r.receivedProgress} tone="var(--s2)" />
            <p className="text-xs text-muted-foreground mt-3">{r.investors} investor(s){r.openedOn ? ` · opened ${dateLabel(r.openedOn)}` : ""}{r.closedOn ? ` · closed ${dateLabel(r.closedOn)}` : ""}</p>
            {r.valuationPreMoney && <p className="text-xs mt-1">Pre-money valuation {money(r.valuationPreMoney, r.currency)} · approved by {r.valuationReference}</p>}
          </Card>
        ))}
      </div>}
      {q.data && <Notes items={[q.data.valuationNote]} />}
    </Page>
  )
}

export function Investors() {
  const me = useMe()
  const q = useBoard<any>("/investors")
  const users = useBoard<any>("/users", undefined, can(me.data, "users.manage"))
  const manage = can(me.data, "investors.manage")
  const [modal, setModal] = useState<{ kind: string; data?: any } | null>(null)
  const d = q.data
  return (
    <Page title="Investors & share register" subtitle={d ? `${num(d.registerTotalShares)} shares on the register` : undefined}
      actions={manage ? <><Btn kind="outline" onClick={() => setModal({ kind: "round" })}><Plus className="w-4 h-4" />Funding round</Btn><Btn onClick={() => setModal({ kind: "investor" })}><Plus className="w-4 h-4" />Investor</Btn></> : undefined}>
      <Loading q={q} />
      {d && <>
        <Banner tone="info">Ownership comes from the approved legal share register. The Boardroom records it; it never issues shares or changes legal ownership.</Banner>
        <Card title="Funding rounds">
          <Table rows={d.rounds} empty="No rounds yet." cols={[["Round", (r: any) => r.name], ["Instrument", (r: any) => label(r.instrument)], ["Target", (r: any) => money(r.target, r.currency), "r"], ["Committed", (r: any) => money(r.committed, r.currency), "r"], ["Received", (r: any) => money(r.received, r.currency), "r"], ["Progress", (r: any) => `${r.progress ?? 0}%`, "r"], ["Status", (r: any) => <Status value={r.status} />],
            ["", (r: any) => manage ? <Btn small kind="ghost" onClick={() => setModal({ kind: "round", data: r })}>Edit</Btn> : null]]} />
        </Card>
        <Card title="Investors">
          {!d.investors.length && <Empty text="No investor records yet." />}
          <div className="space-y-4">
            {d.investors.map((i: any) => (
              <div key={i.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="mr-auto"><p className="font-semibold">{i.legalName}</p><p className="text-xs text-muted-foreground">{label(i.entityType)}{i.country ? ` · ${i.country}` : ""}{i.member ? ` · Boardroom: ${i.member}` : " · no Boardroom account linked"}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold tabular-nums">{num(i.totalShares)} shares</p><p className="text-xs text-muted-foreground">{i.ownershipPercent ?? 0}% recorded</p></div>
                  {manage && <div className="flex gap-1 w-full sm:w-auto"><Btn small kind="outline" onClick={() => setModal({ kind: "investment", data: i })}>+ Investment</Btn><Btn small kind="outline" onClick={() => setModal({ kind: "shares", data: i })}>+ Shares</Btn><Btn small kind="ghost" onClick={() => setModal({ kind: "investor", data: i })}>Edit</Btn></div>}
                </div>
                {i.investments.length > 0 && <div className="mt-3"><Table rows={i.investments} cols={[["Instrument", (r: any) => label(r.instrument)], ["Committed", (r: any) => money(r.committed, r.currency), "r"], ["Received", (r: any) => money(r.received, r.currency), "r"], ["Outstanding", (r: any) => money(r.outstanding, r.currency), "r"], ["Status", (r: any) => <Status value={r.status} />], ["Date", (r: any) => dateLabel(r.commitmentDate)]]} /></div>}
                {i.shareholdings.length > 0 && <div className="mt-3"><Table rows={i.shareholdings} cols={[["Class", (r: any) => r.shareClass], ["Shares", (r: any) => num(r.shares), "r"], ["Effective", (r: any) => dateLabel(r.effectiveDate)], ["Reference", (r: any) => r.legalReference], ["Voting", (r: any) => r.voting ? "Yes" : "No"]]} /></div>}
              </div>
            ))}
          </div>
        </Card>
      </>}
      {modal?.kind === "investor" && <InvestorModal inv={modal.data} members={users.data?.users ?? []} onClose={() => setModal(null)} />}
      {modal?.kind === "round" && <RoundModal r={modal.data} onClose={() => setModal(null)} />}
      {modal?.kind === "investment" && <InvestmentModal inv={modal.data} rounds={d?.rounds ?? []} onClose={() => setModal(null)} />}
      {modal?.kind === "shares" && <SharesModal inv={modal.data} onClose={() => setModal(null)} />}
    </Page>
  )
}

function useForm(init: any) {
  const [f, setF] = useState<any>(init)
  return { f, setF, set: (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }) }
}

function Footer({ a, onClose, onSave, ok = true }: { a: any; onClose: () => void; onSave: () => void; ok?: boolean }) {
  return <><ErrorLine text={a.error} /><div className="flex justify-end gap-2 mt-4"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={onSave} busy={a.busy} disabled={!ok}>Save</Btn></div></>
}

function InvestorModal({ inv, members, onClose }: { inv?: any; members: any[]; onClose: () => void }) {
  const a = useAction(inv ? "patch" : "post", ["/investors", "/fundraising"])
  const { f, set } = useForm({ legalName: inv?.legalName ?? "", entityType: inv?.entityType ?? "individual", country: inv?.country ?? "", contactEmail: inv?.contactEmail ?? "", memberId: inv?.memberId ?? "", notes: inv?.notes ?? "" })
  const save = async () => { await a.run(inv ? `/investors/${inv.id}` : "/investors", { ...f, country: f.country || null, contactEmail: f.contactEmail || null, memberId: f.memberId || null }); onClose() }
  const eligible = members.filter((m: any) => ["investor", "shareholder"].includes(m.role))
  return (
    <Modal open title={inv ? "Edit investor" : "New investor"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Legal name"><Input value={f.legalName} onChange={set("legalName")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={f.entityType} onChange={set("entityType")}>{["individual", "company", "fund", "trust", "other"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Country"><Input maxLength={2} value={f.country} onChange={set("country")} /></Field>
        </div>
        <Field label="Contact email"><Input type="email" value={f.contactEmail} onChange={set("contactEmail")} /></Field>
        <Field label="Boardroom account" hint="Links these records to the person's own 'My investment' page."><Select value={f.memberId} onChange={set("memberId")}><option value="">Not linked</option>{eligible.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.roleLabel})</option>)}</Select></Field>
        <Field label="Notes"><TextArea value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={f.legalName.length >= 2} />
    </Modal>
  )
}

function RoundModal({ r, onClose }: { r?: any; onClose: () => void }) {
  const a = useAction(r ? "patch" : "post", ["/investors", "/fundraising"])
  const { f, set } = useForm({ name: r?.name ?? "", instrument: r?.instrument ?? "equity", currency: r?.currency ?? "USD", targetAmount: r?.target ?? "", valuationPreMoney: r?.valuationPreMoney ?? "", valuationReference: r?.valuationReference ?? "", status: r?.status ?? "planned", openedOn: r?.openedOn ?? "", closedOn: r?.closedOn ?? "", notes: r?.notes ?? "" })
  const save = async () => { await a.run(r ? `/rounds/${r.id}` : "/rounds", { ...f, valuationPreMoney: f.valuationPreMoney || null, valuationReference: f.valuationReference || null, openedOn: f.openedOn || null, closedOn: f.closedOn || null }); onClose() }
  return (
    <Modal open title={r ? "Edit funding round" : "New funding round"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Name"><Input value={f.name} onChange={set("name")} placeholder="Seed" /></Field></div>
        <Field label="Instrument"><Select value={f.instrument} onChange={set("instrument")}>{["equity", "safe", "convertible_note", "loan", "grant"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Currency"><Input maxLength={3} value={f.currency} onChange={set("currency")} /></Field>
        <Field label="Target"><Input inputMode="decimal" value={f.targetAmount} onChange={set("targetAmount")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["planned", "open", "closed", "cancelled"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Opened"><Input type="date" value={f.openedOn} onChange={set("openedOn")} /></Field>
        <Field label="Closed"><Input type="date" value={f.closedOn} onChange={set("closedOn")} /></Field>
        <Field label="Pre-money valuation (optional)"><Input inputMode="decimal" value={f.valuationPreMoney} onChange={set("valuationPreMoney")} /></Field>
        <Field label="Valuation approved by" hint="Required with a valuation, e.g. board resolution RES-2026-004."><Input value={f.valuationReference} onChange={set("valuationReference")} /></Field>
        <div className="col-span-2"><Field label="Notes"><TextArea value={f.notes} onChange={set("notes")} /></Field></div>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={f.name.length >= 2 && f.targetAmount !== ""} />
    </Modal>
  )
}

function InvestmentModal({ inv, rounds, onClose }: { inv: any; rounds: any[]; onClose: () => void }) {
  const a = useAction("post", ["/investors", "/fundraising"])
  const { f, set } = useForm({ roundId: "", instrument: "equity", currency: "USD", committedAmount: "", receivedAmount: "0", commitmentDate: "", receivedDate: "", status: "committed", legalReference: "", notes: "" })
  const save = async () => { await a.run(`/investors/${inv.id}/investments`, { ...f, roundId: f.roundId || null, commitmentDate: f.commitmentDate || null, receivedDate: f.receivedDate || null, legalReference: f.legalReference || null }); onClose() }
  return (
    <Modal open title={`Investment by ${inv.legalName}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Round"><Select value={f.roundId} onChange={set("roundId")}><option value="">No round</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.currency})</option>)}</Select></Field></div>
        <Field label="Instrument"><Select value={f.instrument} onChange={set("instrument")}>{["equity", "safe", "convertible_note", "loan", "grant"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Currency"><Input maxLength={3} value={f.currency} onChange={set("currency")} /></Field>
        <Field label="Committed"><Input inputMode="decimal" value={f.committedAmount} onChange={set("committedAmount")} /></Field>
        <Field label="Received"><Input inputMode="decimal" value={f.receivedAmount} onChange={set("receivedAmount")} /></Field>
        <Field label="Commitment date"><Input type="date" value={f.commitmentDate} onChange={set("commitmentDate")} /></Field>
        <Field label="Received date"><Input type="date" value={f.receivedDate} onChange={set("receivedDate")} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["committed", "partially_received", "received", "cancelled"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
        <Field label="Legal reference"><Input value={f.legalReference} onChange={set("legalReference")} placeholder="Subscription agreement…" /></Field>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={f.committedAmount !== ""} />
    </Modal>
  )
}

function SharesModal({ inv, onClose }: { inv: any; onClose: () => void }) {
  const a = useAction("post", ["/investors"])
  const { f, set } = useForm({ shareClass: "Ordinary", shares: "", effectiveDate: "", legalReference: "", sourceDocumentId: "", voting: true, notes: "" })
  const save = async () => { await a.run(`/investors/${inv.id}/shareholdings`, { ...f, sourceDocumentId: f.sourceDocumentId || null }); onClose() }
  return (
    <Modal open title={`Register entry for ${inv.legalName}`} onClose={onClose}>
      <Banner tone="info">Copy this from the approved legal share register. Recording it here doesn't issue shares.</Banner>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Share class"><Input value={f.shareClass} onChange={set("shareClass")} /></Field>
        <Field label="Number of shares"><Input inputMode="numeric" value={f.shares} onChange={set("shares")} /></Field>
        <Field label="Effective date"><Input type="date" value={f.effectiveDate} onChange={set("effectiveDate")} /></Field>
        <Field label="Register reference"><Input value={f.legalReference} onChange={set("legalReference")} placeholder="Certificate no. / register entry" /></Field>
        <Field label="Source document ID (optional)"><Input value={f.sourceDocumentId} onChange={set("sourceDocumentId")} /></Field>
        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={f.voting} onChange={set("voting")} />Voting shares</label>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={!!f.shares && !!f.effectiveDate && f.legalReference.length >= 2} />
    </Modal>
  )
}

// ─── use of funds ───────────────────────────────────────────────────────────
export function UseOfFunds() {
  const me = useMe()
  const q = useBoard<any>("/use-of-funds")
  const d = q.data
  const [modal, setModal] = useState<{ kind: string; data?: any } | null>(null)
  const decide = useAction("post", ["/use-of-funds"])
  return (
    <Page title="Use of funds" subtitle={d?.approvalRule}
      actions={can(me.data, "use_of_funds.propose") ? <Btn onClick={() => setModal({ kind: "change" })}><Plus className="w-4 h-4" />Propose a budget</Btn> : undefined}>
      <Loading q={q} />
      {d && <>
        {d.totals.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{d.totals.flatMap((t: any) => [
          <Kpi key={t.currency + "a"} label={`Approved budget (${t.currency})`} value={num(t.approvedBudget)} />,
          <Kpi key={t.currency + "b"} label="Allocated" value={num(t.allocated)} />,
          <Kpi key={t.currency + "c"} label="Spent" value={num(t.spent)} sub={`${t.utilisation ?? 0}% of allocation`} />,
          <Kpi key={t.currency + "d"} label="Remaining" value={num(t.remaining)} />,
        ])}</div>}
        <Card title="Capital allocation">
          <Table rows={d.categories} empty="No budgets approved yet." cols={[["Category", (r: any) => r.label], ["Budget", (r: any) => money(r.approvedBudget, r.currency), "r"], ["Allocated", (r: any) => money(r.allocated, r.currency), "r"], ["Spent", (r: any) => money(r.spent, r.currency), "r"], ["Remaining", (r: any) => money(r.remaining, r.currency), "r"],
            ["Used", (r: any) => <div className="w-24"><Progress value={r.utilisation} /><span className="text-xs tabular-nums">{r.utilisation ?? 0}%</span></div>], ["Responsible", (r: any) => r.responsible ?? "—"],
            ["Records", (r: any) => `${r.expenditures.length} · ${r.expenditures.filter((e: any) => e.invoiceDocumentId).length} invoices`],
            ["", (r: any) => can(me.data, "use_of_funds.propose") ? <div className="flex gap-1"><Btn small kind="outline" onClick={() => setModal({ kind: "spend", data: r })}>+ Spending</Btn><Btn small kind="ghost" onClick={() => setModal({ kind: "change", data: r })}>Change</Btn></div> : null]]} />
        </Card>
        <Card title="Spending records">
          <Table rows={d.categories.flatMap((c: any) => c.expenditures.map((e: any) => ({ ...e, category: c.label })))} empty="No spending recorded."
            cols={[["Date", (r: any) => dateLabel(r.date)], ["Category", (r: any) => r.category], ["Description", (r: any) => r.description], ["Supplier", (r: any) => r.supplier ?? "—"], ["Amount", (r: any) => money(r.amount, r.currency), "r"], ["Invoice", (r: any) => r.invoiceDocumentId ? "Attached" : "—"], ["Recorded by", (r: any) => <span className="text-xs">{r.recordedBy}</span>]]} />
        </Card>
        <Card title="Budget changes and approvals" note="History is kept permanently.">
          <ErrorLine text={decide.error} />
          <Table rows={d.changes} empty="No changes yet." cols={[["Proposed", (r: any) => dateTime(r.createdAt)], ["Category", (r: any) => label(r.category)], ["Change", (r: any) => <span className="text-xs">{r.before ? `${num(r.before.approved_budget)} → ` : ""}{num(r.after.approved_budget)} {r.currency} (allocated {num(r.after.allocated)})</span>],
            ["Reason", (r: any) => <span className="text-xs">{r.reason}</span>], ["By", (r: any) => <span className="text-xs">{r.proposedBy}</span>], ["Status", (r: any) => <Status value={r.status} />], ["Decided", (r: any) => r.decidedBy ? <span className="text-xs">{r.decidedBy}</span> : "—"],
            ["", (r: any) => r.status === "pending" && can(me.data, "use_of_funds.approve") ? <div className="flex gap-1"><Btn small onClick={() => decide.run(`/use-of-funds/changes/${r.id}/decide`, { approve: true })}>Approve</Btn><Btn small kind="outline" onClick={() => decide.run(`/use-of-funds/changes/${r.id}/decide`, { approve: false })}>Reject</Btn></div> : null]]} />
        </Card>
      </>}
      {modal?.kind === "change" && <ChangeModal cur={modal.data} options={d?.categoryOptions ?? []} onClose={() => setModal(null)} />}
      {modal?.kind === "spend" && <SpendModal alloc={modal.data} onClose={() => setModal(null)} />}
    </Page>
  )
}

function ChangeModal({ cur, options, onClose }: { cur?: any; options: any[]; onClose: () => void }) {
  const a = useAction("post", ["/use-of-funds"])
  const { f, set } = useForm({ category: cur?.category ?? options[0]?.code, currency: cur?.currency ?? "USD", approvedBudget: cur?.approvedBudget ?? "", allocated: cur?.allocated ?? "", responsible: cur?.responsible ?? "", reason: "" })
  const save = async () => { await a.run("/use-of-funds/changes", { ...f, responsible: f.responsible || null }); onClose() }
  return (
    <Modal open title="Propose a budget" onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-3">Takes effect only after someone else with approval rights approves it.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="Category"><Select value={f.category} onChange={set("category")} disabled={!!cur}>{options.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</Select></Field></div>
        <Field label="Currency"><Input maxLength={3} value={f.currency} onChange={set("currency")} disabled={!!cur} /></Field>
        <Field label="Responsible executive"><Input value={f.responsible} onChange={set("responsible")} /></Field>
        <Field label="Approved budget"><Input inputMode="decimal" value={f.approvedBudget} onChange={set("approvedBudget")} /></Field>
        <Field label="Allocated"><Input inputMode="decimal" value={f.allocated} onChange={set("allocated")} /></Field>
        <div className="col-span-2"><Field label="Reason"><TextArea value={f.reason} onChange={set("reason")} /></Field></div>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={f.reason.length >= 5 && f.approvedBudget !== "" && f.allocated !== ""} />
    </Modal>
  )
}

function SpendModal({ alloc, onClose }: { alloc: any; onClose: () => void }) {
  const a = useAction("post", ["/use-of-funds"])
  const { f, set } = useForm({ spentOn: new Date().toISOString().slice(0, 10), amount: "", description: "", supplier: "", invoiceDocumentId: "" })
  const save = async () => { await a.run("/use-of-funds/expenditures", { ...f, allocationId: alloc.id, currency: alloc.currency, supplier: f.supplier || null, invoiceDocumentId: f.invoiceDocumentId || null }); onClose() }
  return (
    <Modal open title={`Spending: ${alloc.label}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.spentOn} onChange={set("spentOn")} /></Field>
        <Field label={`Amount (${alloc.currency})`}><Input inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <div className="col-span-2"><Field label="Description"><Input value={f.description} onChange={set("description")} /></Field></div>
        <Field label="Supplier"><Input value={f.supplier} onChange={set("supplier")} /></Field>
        <Field label="Invoice document ID" hint="Upload in Documents first."><Input value={f.invoiceDocumentId} onChange={set("invoiceDocumentId")} /></Field>
      </div>
      <Footer a={a} onClose={onClose} onSave={save} ok={!!f.amount && f.description.length >= 3} />
    </Modal>
  )
}

