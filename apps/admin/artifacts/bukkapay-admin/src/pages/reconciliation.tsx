import { useState } from "react"
import { Play, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"

type Run = { id: string; kind: string; provider?: string; status: string; summary: Record<string, number>; startedBy?: string; startedAt: string }
type Item = {
  id: string; result: string; reference?: string; ledgerAmount?: string; providerAmount?: string; currency?: string
  details: Record<string, any>; resolution: string; resolutionNote?: string
}
type Funding = { id: string; reference: string; purpose: string; amount: string; currency: string; providerAmount?: string; status: string; reviewReason?: string; createdAt: string }
type Withdrawal = { id: string; reference: string; amount: string; currency: string; status: string; failureReason?: string; createdAt: string }

export default function ReconciliationPage() {
  const runs = useApi<Run[]>(["recon-runs"], "/admin/reconciliation/runs")
  const [selected, setSelected] = useState<string | null>(null)
  const items = useApi<Item[]>(["recon-items", selected], selected ? `/admin/reconciliation/runs/${selected}/items` : "/admin/reconciliation/runs")
  const review = useApi<Funding[]>(["funding-review"], "/admin/funding-requests", { status: "review" })
  const payouts = useApi<Withdrawal[]>(["withdrawals-open"], "/admin/withdrawal-requests", { status: "submitted" })
  const action = useAction([["recon-runs"], ["recon-items"], ["withdrawals-open"]])
  const [uploading, setUploading] = useState(false)
  const [resolving, setResolving] = useState<Item | null>(null)

  return (
    <Page
      title="Reconciliation"
      subtitle="Matches the ledger against itself and against provider/custodian statements. Exceptions are investigated and closed with a note; money corrections go through an approved ledger adjustment — records are never edited to make totals agree."
      actions={<>
        <Button variant="outline" onClick={() => setUploading(true)}><Upload className="w-4 h-4 mr-2" />Import statement</Button>
        <Button onClick={() => action.mutate({ url: "/admin/reconciliation/runs/ledger", success: "Ledger integrity check complete" })}>
          <Play className="w-4 h-4 mr-2" />Run ledger check
        </Button>
      </>}
    >
      <Section title="Runs">
        <DataTable
          rows={runs.data} loading={runs.isLoading} error={runs.error} rowKey={(r) => r.id}
          columns={[
            { header: "Started", cell: (r) => when(r.startedAt) },
            { header: "Kind", cell: (r) => `${r.kind.replace(/_/g, " ")}${r.provider ? ` · ${r.provider}` : ""}` },
            { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
            { header: "Exceptions", cell: (r) => <span className={r.summary?.exceptions ? "text-destructive font-semibold" : "text-emerald-600"}>{r.summary?.exceptions ?? 0}</span> },
            { header: "By", cell: (r) => r.startedBy ?? "—" },
            { header: "Run ID", cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
            { header: "", className: "text-right", cell: (r) => <Button size="sm" variant={selected === r.id ? "default" : "outline"} onClick={() => setSelected(r.id)}>Items</Button> },
          ]}
        />
      </Section>
      {selected && (
        <Section title="Exceptions">
          <DataTable
            rows={items.data} loading={items.isLoading} rowKey={(i) => i.id} empty="No exceptions — fully reconciled."
            columns={[
              { header: "Result", cell: (i) => <StatusBadge value={i.result} /> },
              { header: "Reference", cell: (i) => <span className="font-mono text-xs">{i.reference ?? "—"}</span> },
              { header: "Ledger", className: "tabular-nums", cell: (i) => money(i.ledgerAmount, i.currency) },
              { header: "Provider / other", className: "tabular-nums", cell: (i) => money(i.providerAmount, i.currency) },
              { header: "Details", cell: (i) => <pre className="text-xs whitespace-pre-wrap max-w-xs">{JSON.stringify(i.details)}</pre> },
              { header: "Resolution", cell: (i) => i.resolution === "open" ? <StatusBadge value="open" /> : <span title={i.resolutionNote}>{i.resolution}</span> },
              { header: "", className: "text-right", cell: (i) => i.resolution === "open" ? <Button size="sm" variant="outline" onClick={() => setResolving(i)}>Resolve</Button> : null },
            ]}
          />
        </Section>
      )}
      <Section title="Top-ups held for review">
        <DataTable
          rows={review.data} loading={review.isLoading} rowKey={(f) => f.id} empty="Nothing held for review."
          columns={[
            { header: "Created", cell: (f) => when(f.createdAt) },
            { header: "Reference", cell: (f) => <span className="font-mono text-xs">{f.reference}</span> },
            { header: "Purpose", cell: (f) => f.purpose.replace(/_/g, " ") },
            { header: "Expected", cell: (f) => money(f.amount, f.currency) },
            { header: "Provider reported", cell: (f) => money(f.providerAmount, f.currency) },
            { header: "Reason", cell: (f) => f.reviewReason ?? "—" },
          ]}
        />
      </Section>
      <Section title="Payouts awaiting confirmation">
        <DataTable
          rows={payouts.data} loading={payouts.isLoading} rowKey={(w) => w.id} empty="No open payouts."
          columns={[
            { header: "Created", cell: (w) => when(w.createdAt) },
            { header: "Reference", cell: (w) => <span className="font-mono text-xs">{w.reference}</span> },
            { header: "Amount", cell: (w) => money(w.amount, w.currency) },
            { header: "Note", cell: (w) => w.failureReason ?? "—" },
            {
              header: "", className: "text-right", cell: (w) => (
                <Button size="sm" variant="outline" onClick={() => action.mutate({ url: `/admin/withdrawal-requests/${w.id}/confirm`, success: "Payout confirmed against statement" })}>
                  Confirm paid
                </Button>
              ),
            },
          ]}
        />
      </Section>
      <FormDialog
        open={uploading} onOpenChange={setUploading} title="Import provider statement"
        description="CSV with columns reference, amount, currency and optional direction (in/out)."
        fields={[
          { name: "provider", label: "Provider code", required: true, placeholder: "stitch" },
          { name: "csv", label: "Statement CSV", type: "textarea", required: true, placeholder: "reference,amount,currency,direction\nTOPUP-…,100.00,ZAR,in" },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/reconciliation/runs/statement", body: v, success: "Statement reconciled" })}
      />
      <FormDialog
        open={!!resolving} onOpenChange={(o) => !o && setResolving(null)} title="Resolve exception"
        fields={[
          { name: "resolution", label: "Resolution", type: "select", required: true, options: [{ value: "resolved", label: "Resolved" }, { value: "ignored", label: "Ignore (explained)" }] },
          { name: "note", label: "Explanation", type: "textarea", required: true },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: `/admin/reconciliation/items/${resolving!.id}/resolve`, body: v, success: "Exception closed" })}
      />
    </Page>
  )
}
