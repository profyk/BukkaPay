import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, Stat, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"
import { api } from "@/lib/api"

type Party = { id: string; name: string; email?: string; kycLevel?: number; country?: string; kybStatus?: string }
type Escrow = {
  reference: string; status: string; currency: string; amount: string; fee: string; feeRate: string
  releaseCondition: string; autoReleaseAt: string | null; buyer: Party | null; seller: Party | null; invoice: string | null
  disputeReason: string | null; disputedAt: string | null; resolvedBy: string | null; resolutionNote: string | null; createdAt: string
  events?: { event: string; actor: string; actorId: string | null; note: string | null; at: string }[]
}
type Desk = { counts: Record<string, number>; held: { currency: string; amount: string }[]; escrows: Escrow[] }

const FILTERS = ["disputed", "funded", "released", "refunded", ""]

/** AfCFTA trade escrow desk: what's held, and mediation of disputes. */
export default function TradeEscrowsPage() {
  const perms = usePermissions()
  const [status, setStatus] = useState("disputed")
  const [open, setOpen] = useState<string | null>(null)
  const [resolving, setResolving] = useState<"release" | "refund" | null>(null)
  const desk = useApi<Desk>(["trade-escrows", status], "/admin/trade/escrows", status ? { status } : undefined)
  const detail = useApi<Escrow>(["trade-escrow", open], open ? `/admin/trade/escrows/${open}` : "/admin/trade/escrows")
  const action = useAction([["trade-escrows"], ["trade-escrow", open]])

  if (open && detail.data && "reference" in (detail.data as any)) {
    const e = detail.data as Escrow
    return (
      <Page title={`Escrow ${e.reference}`} subtitle={`${money(e.amount, e.currency)} · ${e.status}`}
        actions={<Button variant="outline" onClick={() => setOpen(null)}><ArrowLeft className="w-4 h-4 mr-2" />All escrows</Button>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Held" value={money(e.amount, e.currency)} />
          <Stat label="Escrow fee" value={`${money(e.fee, e.currency)} (${(Number(e.feeRate) * 100).toFixed(2)}%)`} />
          <Stat label="Auto-release" value={e.autoReleaseAt ? when(e.autoReleaseAt) : "—"} />
        </div>
        <Section title="Parties">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Buyer</p><p className="font-semibold">{e.buyer?.name}</p><p className="text-muted-foreground">{e.buyer?.email} · KYC level {e.buyer?.kycLevel}</p></div>
            <div className="rounded-2xl border border-border p-4"><p className="text-xs text-muted-foreground">Seller</p><p className="font-semibold">{e.seller?.name}</p><p className="text-muted-foreground">{e.seller?.country} · KYB {e.seller?.kybStatus}</p></div>
          </div>
          {e.disputeReason && <p className="mt-4 rounded-2xl bg-destructive/5 border border-destructive/20 p-4 text-sm"><span className="font-semibold">Dispute:</span> {e.disputeReason}</p>}
          {e.resolutionNote && <p className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm"><span className="font-semibold">Resolution ({e.resolvedBy}):</span> {e.resolutionNote}</p>}
          {e.status === "disputed" && perms.can("compliance.manage") && (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => setResolving("release")}>Pay the seller</Button>
              <Button variant="outline" onClick={() => setResolving("refund")}>Refund the buyer</Button>
            </div>
          )}
        </Section>
        <Section title="Timeline">
          <DataTable rows={e.events} rowKey={(x) => `${x.event}-${x.at}`} columns={[
            { header: "When", cell: (x) => when(x.at) },
            { header: "Event", cell: (x) => x.event.replace(/_/g, " ") },
            { header: "By", cell: (x) => `${x.actor}${x.actorId && x.actor === "admin" ? ` (${x.actorId})` : ""}` },
            { header: "Note", cell: (x) => x.note ?? "" },
          ]} />
        </Section>
        <FormDialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}
          title={resolving === "release" ? "Pay the seller" : "Refund the buyer"}
          description="This is final and recorded with your name. Explain the decision for both parties and the audit log."
          fields={[{ name: "note", label: "Decision note (at least 10 characters)", type: "textarea", required: true }]}
          submitLabel="Confirm decision" busy={action.isPending}
          onSubmit={(v: any) => action.mutateAsync({ url: `/admin/trade/escrows/${e.reference}/resolve`, body: { outcome: resolving, note: v.note }, success: "Escrow resolved" }).then(() => setResolving(null))} />
      </Page>
    )
  }

  const d = desk.data
  const exportReport = async () => {
    const res = await api.get("/admin/trade/report.csv", { responseType: "blob" })
    const url = URL.createObjectURL(res.data as Blob)
    const a = Object.assign(document.createElement("a"), { href: url, download: `bukkapay-trade-report-${new Date().toISOString().slice(0, 10)}.csv` })
    a.click(); URL.revokeObjectURL(url)
  }
  return (
    <Page title="Trade escrow desk" subtitle="Buyer money held against supplier invoices in SYS_TRADE_ESCROW. Disputed escrows wait here for a decision; nothing moves until you decide."
      actions={<Button variant="outline" onClick={exportReport}>Export AfCFTA trade report (CSV)</Button>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Disputed" value={d?.counts?.disputed ?? 0} tone={d?.counts?.disputed ? "bad" : undefined} />
        <Stat label="Funded (held)" value={d?.counts?.funded ?? 0} />
        <Stat label="Released" value={d?.counts?.released ?? 0} tone="good" />
        <Stat label="Refunded" value={d?.counts?.refunded ?? 0} />
      </div>
      {!!d?.held?.length && (
        <Section title="Currently held">
          <div className="flex flex-wrap gap-4">{d.held.map((h) => <Stat key={h.currency} label={h.currency} value={money(h.amount, h.currency)} />)}</div>
        </Section>
      )}
      <Section title="Escrows" actions={
        <div className="flex flex-wrap gap-2">{FILTERS.map((f) => (
          <Button key={f || "all"} size="sm" variant={status === f ? "default" : "outline"} onClick={() => setStatus(f)}>{f || "all"}</Button>
        ))}</div>
      }>
        <DataTable rows={d?.escrows} loading={desk.isLoading} error={desk.error} rowKey={(e) => e.reference} empty="No escrows here."
          columns={[
            { header: "Created", cell: (e) => when(e.createdAt) },
            { header: "Reference", cell: (e) => <span className="font-mono text-xs">{e.reference}</span> },
            { header: "Buyer → Seller", cell: (e) => <span>{e.buyer?.name} → {e.seller?.name}</span> },
            { header: "Amount", className: "text-right tabular-nums", cell: (e) => money(e.amount, e.currency) },
            { header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
            { header: "", className: "text-right", cell: (e) => <Button size="sm" variant="ghost" onClick={() => setOpen(e.reference)}>Open</Button> },
          ]} />
      </Section>
    </Page>
  )
}
