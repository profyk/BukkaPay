import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"

type Transfer = {
  id: string; reference: string; status: string; fromCurrency: string; toCurrency: string; sourceAmount: string
  fee: string; rate: string; destinationAmount: string; rail: string; railReference?: string
  failureReason?: string; createdAt: string; creditedAt?: string
}
type Webhook = { id: string; provider: string; eventId: string; eventType: string; signatureValid: boolean; status: string; error?: string; receivedAt: string }

export default function CrossBorderPage() {
  const [status, setStatus] = useState("all")
  const transfers = useApi<Transfer[]>(["xb"], "/admin/cross-border-transfers", status === "all" ? undefined : { status })
  const hooks = useApi<Webhook[]>(["webhooks"], "/admin/webhooks")
  const action = useAction([["xb"]])
  const [failing, setFailing] = useState<Transfer | null>(null)

  return (
    <Page
      title="Cross-border transfers"
      subtitle="Each transfer moves sender-debited → instructed → credited only after the rail's signed settlement confirmation. A failed transfer is reversed in full (fee included)."
    >
      <div className="flex gap-2 flex-wrap">
        {["all", "sender_debited", "instructed", "credited", "reversed"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s.replace(/_/g, " ")}</Button>
        ))}
      </div>
      <DataTable
        rows={transfers.data} loading={transfers.isLoading} error={transfers.error} rowKey={(t) => t.id} empty="No cross-border transfers."
        columns={[
          { header: "Created", cell: (t) => when(t.createdAt) },
          { header: "Reference", cell: (t) => <span className="font-mono text-xs">{t.reference}</span> },
          { header: "Sent", cell: (t) => money(t.sourceAmount, t.fromCurrency) },
          { header: "Fee", cell: (t) => money(t.fee, t.fromCurrency) },
          { header: "Rate", cell: (t) => Number(t.rate).toFixed(6) },
          { header: "Receives", cell: (t) => money(t.destinationAmount, t.toCurrency) },
          { header: "Rail", cell: (t) => <span className="font-mono text-xs">{t.rail} {t.railReference ?? ""}</span> },
          { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
          { header: "", className: "text-right", cell: (t) => ["sender_debited", "instructed"].includes(t.status)
              ? <Button size="sm" variant="outline" onClick={() => setFailing(t)}>Mark failed</Button> : t.failureReason ?? null },
        ]}
      />
      <Section title="Provider webhooks">
        <DataTable
          rows={hooks.data} loading={hooks.isLoading} rowKey={(w) => w.id} empty="No webhooks received."
          columns={[
            { header: "Received", cell: (w) => when(w.receivedAt) },
            { header: "Provider", cell: (w) => w.provider },
            { header: "Event", cell: (w) => <span className="font-mono text-xs">{w.eventType} · {w.eventId}</span> },
            { header: "Signature", cell: (w) => w.signatureValid ? "valid" : <span className="text-destructive">invalid</span> },
            { header: "Status", cell: (w) => <StatusBadge value={w.status} /> },
            { header: "Error", cell: (w) => w.error ?? "—" },
          ]}
        />
      </Section>
      <FormDialog
        open={!!failing} onOpenChange={(o) => !o && setFailing(null)} title={`Mark ${failing?.reference} as failed`}
        description="Only after confirming with the rail that the funds were not delivered. The sender is refunded in full."
        fields={[{ name: "reason", label: "Reason / rail confirmation", type: "textarea", required: true }]}
        submitLabel="Fail and refund"
        onSubmit={(v) => action.mutateAsync({ url: `/admin/cross-border-transfers/${failing!.reference}/fail`, body: v, success: "Transfer reversed" })}
      />
    </Page>
  )
}
