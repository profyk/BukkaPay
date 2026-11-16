import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, StatusBadge, useAction, useApi, when } from "@/components/network/kit"

type Case = { id: string; title: string; userId?: string; merchantId?: string; status: string; priority: string; notes: any[]; createdAt: string }
type Risk = { id: string; userId?: string; rule: string; severity: string; score: number; reference?: string; details: any; caseId?: string; createdAt: string }
type Screening = { id: string; userId?: string; merchantId?: string; screeningType: string; provider: string; status: string; createdAt: string }

export default function CompliancePage() {
  const cases = useApi<Case[]>(["cases"], "/admin/compliance/cases")
  const risks = useApi<Risk[]>(["risk"], "/admin/compliance/risk-events")
  const screening = useApi<Screening[]>(["screening"], "/admin/compliance/screening")
  const action = useAction([["cases"]])
  const [creating, setCreating] = useState(false)
  const [noteFor, setNoteFor] = useState<Case | null>(null)

  return (
    <Page
      title="Compliance"
      subtitle="Case management, transaction-monitoring signals and screening. The monitoring rules raise signals for human review — they are not an AML programme. No sanctions/PEP screening provider is connected yet, so screening shows 'not screened'."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Open case</Button>}
    >
      <Section title="Cases">
        <DataTable
          rows={cases.data} loading={cases.isLoading} error={cases.error} rowKey={(c) => c.id} empty="No cases."
          columns={[
            { header: "Opened", cell: (c) => when(c.createdAt) },
            { header: "Title", cell: (c) => <p className="font-medium max-w-xs">{c.title}</p> },
            { header: "Subject", cell: (c) => <span className="font-mono text-xs">{c.userId ?? c.merchantId ?? "—"}</span> },
            { header: "Priority", cell: (c) => <StatusBadge value={c.priority} /> },
            { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
            { header: "Notes", cell: (c) => c.notes?.length ?? 0 },
            {
              header: "", className: "text-right", cell: (c) => (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setNoteFor(c)}>Update</Button>
                </div>
              ),
            },
          ]}
        />
      </Section>
      <Section title="Monitoring signals">
        <DataTable
          rows={risks.data} loading={risks.isLoading} rowKey={(r) => r.id} empty="No signals."
          columns={[
            { header: "When", cell: (r) => when(r.createdAt) },
            { header: "Rule", cell: (r) => r.rule.replace(/_/g, " ") },
            { header: "Severity", cell: (r) => <StatusBadge value={r.severity} /> },
            { header: "User", cell: (r) => <span className="font-mono text-xs">{r.userId ?? "—"}</span> },
            { header: "Reference", cell: (r) => <span className="font-mono text-xs">{r.reference ?? "—"}</span> },
            { header: "Details", cell: (r) => <pre className="text-xs whitespace-pre-wrap max-w-xs">{JSON.stringify(r.details)}</pre> },
          ]}
        />
      </Section>
      <Section title="Screening">
        <DataTable
          rows={screening.data} loading={screening.isLoading} rowKey={(s) => s.id} empty="No screening records."
          columns={[
            { header: "When", cell: (s) => when(s.createdAt) },
            { header: "Subject", cell: (s) => <span className="font-mono text-xs">{s.userId ?? s.merchantId}</span> },
            { header: "Type", cell: (s) => s.screeningType },
            { header: "Provider", cell: (s) => s.provider },
            { header: "Result", cell: (s) => <StatusBadge value={s.status} /> },
          ]}
        />
      </Section>
      <FormDialog
        open={creating} onOpenChange={setCreating} title="Open compliance case"
        fields={[
          { name: "title", label: "Title", required: true },
          { name: "userId", label: "User ID" },
          { name: "merchantId", label: "Merchant ID" },
          { name: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"].map((v) => ({ value: v, label: v })) },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/compliance/cases", body: Object.fromEntries(Object.entries(v).filter(([, x]) => x)), success: "Case opened" })}
      />
      <FormDialog
        open={!!noteFor} onOpenChange={(o) => !o && setNoteFor(null)} title="Update case"
        fields={[
          { name: "status", label: "Status", type: "select", options: ["open", "investigating", "escalated", "closed_no_action", "closed_action_taken"].map((v) => ({ value: v, label: v.replace(/_/g, " ") })) },
          { name: "note", label: "Note", type: "textarea" },
          { name: "assignToMe", label: "Assign to me", type: "checkbox" },
        ]}
        onSubmit={(v) => action.mutateAsync({ method: "patch", url: `/admin/compliance/cases/${noteFor!.id}`, body: v, success: "Case updated" })}
      />
    </Page>
  )
}
