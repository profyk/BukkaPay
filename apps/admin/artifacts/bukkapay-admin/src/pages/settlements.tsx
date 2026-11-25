import { useState } from "react"
import { Download, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, Stat, StatusBadge, errorMessage, money, useAction, useApi, when } from "@/components/network/kit"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/api"

type Position = { currency: string; position: string; action: string; amount: string; pool?: string }
type Line = {
  id: string; pool?: string; fromCurrency: string; toCurrency: string; fromAmount: string; expectedToAmount?: string; rate?: string
  status: string; bankReference?: string; actualFromAmount?: string; actualToAmount?: string; journalReference?: string
  approvalStatus?: string
}
type Run = {
  id: string; reference: string; periodStart: string; periodEnd: string; status: string; createdBy: string
  createdAt: string; unfunded: { currency: string; amount?: string; note: string }[]; lines: Line[]
}

/** Weekly cross-border bulk settlement of the book-transfer pools. */
export default function SettlementsPage() {
  const { data, isLoading, error } = useApi<{ positions: Position[]; runs: Run[] }>(["settlements"], "/admin/settlements")
  const action = useAction([["settlements"], ["approvals"]])
  const { toast } = useToast()
  const [sending, setSending] = useState<Line | null>(null)
  const open = data?.runs.find((r) => r.status === "proposed" || r.status === "in_progress")

  const download = async (run: Run) => {
    try {
      const res = await api.get(`/admin/settlements/${run.id}/instructions.csv`, { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url; a.download = `${run.reference}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toast({ title: "Download failed", description: errorMessage(e), variant: "destructive" }) }
  }

  return (
    <Page
      title="Cross-border settlement"
      subtitle="Book transfers pay out from the destination pool and leave the sender's money in the source pool. Every Monday at 06:00 UTC (or now, with the button) the pools are netted into as few bank transfers as possible. Make each transfer at the bank, record it here, and a second admin approves booking it."
      actions={<Button onClick={() => action.mutate({ url: "/admin/settlements/run", success: "Settlement run built" })} disabled={open?.status === "in_progress"}>
        <Play className="w-4 h-4 mr-2" />Run settlement now
      </Button>}
    >
      <Section title="Pool positions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(data?.positions ?? []).map((p) => (
            <Stat key={`${p.pool}-${p.currency}`} label={`${p.pool === "fx" ? "FX" : "Book"} · ${p.currency}`} value={money(p.amount, p.currency)}
                  tone={p.action === "top_up" ? "warn" : p.action === "surplus" ? "good" : undefined} />
          ))}
          {!data?.positions.length && <p className="text-sm text-muted-foreground">No book transfers yet.</p>}
        </div>
        <p className="text-xs text-muted-foreground">Book: cross-border transfers paid out of a country pool. FX: currency swaps (amber = customers bought this currency from us and it must be bought in; green = we hold spare from what they paid). Amber needs funding; green is spare cash.</p>
      </Section>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
      {(data?.runs ?? []).map((run) => (
        <Section key={run.id} title={`${run.reference} · ${run.periodStart} to ${run.periodEnd}`} actions={
          <div className="flex gap-2 items-center">
            <StatusBadge value={run.status} />
            <Button size="sm" variant="outline" onClick={() => download(run)}><Download className="w-4 h-4 mr-1" />Bank instructions</Button>
            {(run.status === "proposed" || run.status === "in_progress") && (
              <Button size="sm" variant="ghost" onClick={() => action.mutate({ url: `/admin/settlements/${run.id}/cancel`, success: "Run cancelled" })}>Cancel run</Button>
            )}
          </div>
        }>
          <DataTable
            rows={run.lines} rowKey={(l) => l.id} empty="No transfers needed."
            columns={[
              { header: "Type", cell: (l) => l.pool === "fx" ? <span title="Customers bought this currency from us: buy it with what they paid">FX hedge</span> : "Book pools" },
              { header: "Send", cell: (l) => money(l.actualFromAmount ?? l.fromAmount, l.fromCurrency) },
              { header: "Receive", cell: (l) => l.actualToAmount ? money(l.actualToAmount, l.toCurrency) : l.expectedToAmount ? `≈ ${money(l.expectedToAmount, l.toCurrency)}` : "rate needed" },
              { header: "Mid rate", cell: (l) => l.rate ? Number(l.rate).toFixed(4) : "—" },
              { header: "Bank ref", cell: (l) => <span className="font-mono text-xs">{l.bankReference ?? "—"}</span> },
              { header: "Status", cell: (l) => <div className="space-y-1"><StatusBadge value={l.status} />{l.approvalStatus && l.status === "requested" && <p className="text-xs text-muted-foreground">approval: {l.approvalStatus}</p>}</div> },
              { header: "Booked", cell: (l) => <span className="font-mono text-xs">{l.journalReference ?? "—"}</span> },
              { header: "", className: "text-right whitespace-nowrap", cell: (l) => (l.status === "pending" || (l.status === "requested" && ["rejected", "failed"].includes(l.approvalStatus ?? ""))) && (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" onClick={() => setSending(l)}>Record transfer</Button>
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ url: `/admin/settlement-lines/${l.id}/cancel`, success: "Line cancelled" })}>Skip</Button>
                </div>
              ) },
            ]}
          />
          {!!run.unfunded.length && (
            <div className="text-sm rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
              {run.unfunded.map((u, i) => <p key={i}><b>{u.currency}</b> {u.amount ? money(u.amount, u.currency) : ""}: {u.note}</p>)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Built by {run.createdBy} · {when(run.createdAt)}</p>
        </Section>
      ))}

      <FormDialog
        open={!!sending} onOpenChange={(o) => !o && setSending(null)}
        title={`Record transfer ${sending?.fromCurrency} → ${sending?.toCurrency}`}
        description="Only after the money has actually moved at the bank. This files a booking request that a second admin approves."
        initial={{ sentAmount: sending?.fromAmount, receivedAmount: sending?.expectedToAmount ?? "" }}
        fields={[
          { name: "bankReference", label: "Bank / RTGS / PAPSS reference", required: true },
          { name: "sentAmount", label: `Sent (${sending?.fromCurrency ?? ""})`, required: true },
          { name: "receivedAmount", label: `Received (${sending?.toCurrency ?? ""})`, required: true, help: "From the receiving bank statement" },
        ]}
        submitLabel="File for approval"
        onSubmit={(v) => action.mutateAsync({
          url: `/admin/settlement-lines/${sending!.id}/sent`, success: "Filed for approval",
          body: { bankReference: v.bankReference, sentAmount: String(v.sentAmount), receivedAmount: String(v.receivedAmount) },
        })}
      />
    </Page>
  )
}
