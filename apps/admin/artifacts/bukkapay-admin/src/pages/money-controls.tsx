import { useState } from "react"
import { AlertTriangle, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, Page, Section, Stat, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Item = {
  id: string; status: string; createdAt: string; walletId?: string; holder?: string; source?: string; direction?: string
  currency?: string; amount?: string; companyCostUsd?: string; ownerRequired: boolean; requestedBy: string
  approvedBy?: string; reason: string
}
type Report = { days: number; items: Item[]; flags: string[]; companyCostUsd: string
                limits: Record<string, number>; labels: Record<string, string> }

/** Who moved money by hand, who approved it, what it cost the company. */
export default function MoneyControlsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading, error } = useApi<Report>(["adjustments-report", days], "/admin/adjustments/report", { days })
  const perms = usePermissions()
  const action = useAction([["adjustments-report"]])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const items = data?.items ?? []
  const executed = items.filter((i) => i.status === "executed")

  return (
    <Page
      title="Money controls"
      subtitle="Every manual money adjustment, who asked, who approved and what it cost BukkaPay. Adjustments are by wallet ID only, always balanced against a named source, and need the owner above these limits."
      actions={<div className="flex gap-2">{[7, 30, 90].map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d} days</Button>)}</div>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Adjustments made" value={executed.length} />
        <Stat label="Waiting for approval" value={items.filter((i) => i.status === "pending").length} tone="warn" />
        <Stat label="Needed the owner" value={items.filter((i) => i.ownerRequired).length} />
        <Stat label="Company cost (USD)" value={data?.companyCostUsd ?? "—"} tone={Number(data?.companyCostUsd) > 0 ? "warn" : undefined} />
      </div>

      {!!data?.flags.length && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-1">
          <p className="font-semibold text-amber-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Patterns to review</p>
          {data.flags.map((f) => <p key={f} className="text-sm text-amber-900">{f}</p>)}
        </div>
      )}

      <Section title="Adjustments">
        <DataTable
          rows={items} loading={isLoading} error={error} rowKey={(i) => i.id} empty="No manual adjustments in this period."
          columns={[
            { header: "When", cell: (i) => when(i.createdAt) },
            { header: "Customer", cell: (i) => <div><p className="font-medium">{i.holder ?? "—"}</p><p className="font-mono text-xs text-muted-foreground">{i.walletId}</p></div> },
            { header: "Amount", cell: (i) => <span>{i.direction === "debit" ? "−" : "+"}{money(i.amount, i.currency)}</span> },
            { header: "Source", cell: (i) => (i.source ?? "").replace(/_/g, " ") },
            { header: "Company cost", cell: (i) => Number(i.companyCostUsd) > 0 ? `USD ${i.companyCostUsd}` : "—" },
            { header: "Requested by", cell: (i) => <span className="text-xs">{i.requestedBy}</span> },
            { header: "Approved by", cell: (i) => <span className="text-xs">{i.approvedBy ?? "—"}</span> },
            { header: "Status", cell: (i) => <div className="space-y-1"><StatusBadge value={i.status} />{i.ownerRequired && <p className="text-xs text-amber-700">owner</p>}</div> },
            { header: "Reason", cell: (i) => <p className="max-w-xs text-xs">{i.reason}</p> },
          ]}
        />
      </Section>

      <Section title="Limits">
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {data && Object.entries(data.limits).map(([k, v]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              <span>{data.labels[k] ?? k}</span>
              <Input type="number" className="w-28" disabled={!perms.isSuperAdmin} value={String(draft[k] ?? v)}
                     onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }))} />
            </label>
          ))}
          {perms.isSuperAdmin
            ? <Button size="sm" disabled={!Object.keys(draft).length} onClick={async () => {
                await action.mutateAsync({ method: "patch", url: "/admin/adjustments/controls", body: draft, success: "Limits saved" })
                setDraft({})
              }}><Save className="w-4 h-4 mr-2" />Save limits</Button>
            : <p className="text-xs text-muted-foreground">Only the owner can change these limits.</p>}
        </div>
      </Section>
    </Page>
  )
}
