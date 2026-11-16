import { useState } from "react"
import { Plus, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, StatusBadge, useAction, useApi, useRequestApproval, when } from "@/components/network/kit"

type Custodian = {
  id: string; name: string; countryCode: string; institutionType: string; status: string
  integrationStatus: string; regulatoryStatus: string; safeguardingArrangement?: string
}
type Assignment = {
  id: string; countryCode: string; currencyCode: string; custodianId: string; role: string; status: string
  settlementAccountRef?: string; effectiveFrom?: string; effectiveTo?: string
}

export default function NetworkCustodiansPage() {
  const { data, isLoading, error } = useApi<{ custodians: Custodian[]; assignments: Assignment[] }>(
    ["custodians"], "/admin/network/custodians")
  const action = useAction([["custodians"], ["countries"]])
  const requestApproval = useRequestApproval([["custodians"]])
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [activating, setActivating] = useState<Assignment | null>(null)
  const byId = Object.fromEntries((data?.custodians ?? []).map((c) => [c.id, c]))

  return (
    <Page
      title="Local Custodian Network"
      subtitle="Regulated institutions that safeguard customer funds in each country. BukkaPay runs the technology; custodians hold the money. Activating or replacing a custodian is maker-checker and never moves existing balances by itself — replacing an active one requires a clean reconciliation run."
      actions={<>
        <Button variant="outline" onClick={() => setAssigning(true)}><Link2 className="w-4 h-4 mr-2" />Assign to country</Button>
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add custodian</Button>
      </>}
    >
      <Section title="Institutions">
        <DataTable
          rows={data?.custodians} loading={isLoading} error={error} rowKey={(c) => c.id}
          empty="No custodians recorded yet. Add the institutions you're onboarding with."
          columns={[
            { header: "Institution", cell: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.institutionType}</p></div> },
            { header: "Country", cell: (c) => c.countryCode },
            { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
            { header: "Integration", cell: (c) => <StatusBadge value={c.integrationStatus} /> },
            { header: "Regulatory", cell: (c) => c.regulatoryStatus },
            {
              header: "", className: "text-right", cell: (c) => (
                <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={c.status}
                        onChange={(e) => action.mutate({ method: "patch", url: `/admin/network/custodians/${c.id}`,
                          body: { status: e.target.value }, success: "Custodian updated" })}>
                  {["prospect", "onboarding", "active", "suspended", "terminated"].map((s) => <option key={s}>{s}</option>)}
                </select>
              ),
            },
          ]}
        />
      </Section>
      <Section title="Country assignments">
        <DataTable
          rows={data?.assignments} loading={isLoading} rowKey={(a) => a.id}
          empty="No assignments. A country needs an active primary custodian before it can go live."
          columns={[
            { header: "Country / currency", cell: (a) => `${a.countryCode} · ${a.currencyCode}` },
            { header: "Custodian", cell: (a) => byId[a.custodianId]?.name ?? a.custodianId },
            { header: "Role", cell: (a) => a.role },
            { header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
            { header: "Settlement account", cell: (a) => a.settlementAccountRef ?? "—" },
            { header: "Effective", cell: (a) => `${when(a.effectiveFrom)} → ${a.effectiveTo ? when(a.effectiveTo) : "now"}` },
            {
              header: "", className: "text-right", cell: (a) => a.status === "pending"
                ? <Button size="sm" variant="outline" onClick={() => setActivating(a)}>Request activation</Button> : null,
            },
          ]}
        />
      </Section>

      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add custodian"
        fields={[
          { name: "name", label: "Institution name", required: true },
          { name: "countryCode", label: "Country (ISO-2)", required: true },
          { name: "institutionType", label: "Type", type: "select", required: true,
            options: ["bank", "emi", "trust", "mobile_money", "other"].map((v) => ({ value: v, label: v })) },
          { name: "regulatoryStatus", label: "Regulatory status", placeholder: "e.g. licence application filed" },
          { name: "safeguardingArrangement", label: "Safeguarding arrangement", type: "textarea" },
          { name: "apiConfigRef", label: "API config secret name", help: "The name of a secret in the environment — never the secret itself." },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/network/custodians", body: v, success: "Custodian added" })}
      />
      <FormDialog
        open={assigning} onOpenChange={setAssigning} title="Assign custodian to a country"
        description="Creates a pending assignment. It takes effect only after approval."
        fields={[
          { name: "custodianId", label: "Custodian", type: "select", required: true,
            options: (data?.custodians ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.countryCode})` })) },
          { name: "countryCode", label: "Country (ISO-2)", required: true },
          { name: "currencyCode", label: "Currency", required: true },
          { name: "role", label: "Role", type: "select", required: true, options: [{ value: "primary", label: "primary" }, { value: "backup", label: "backup" }] },
          { name: "settlementAccountRef", label: "Settlement account reference" },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/network/custodian-assignments", body: v, success: "Assignment created (pending)" })}
      />
      <FormDialog
        open={!!activating} onOpenChange={(o) => !o && setActivating(null)} title="Request custodian activation"
        description="If this replaces an active custodian, attach the ID of a completed reconciliation run with no exceptions."
        fields={[
          { name: "reconciliationRunId", label: "Reconciliation run ID (when replacing)" },
          { name: "reason", label: "Reason", type: "textarea", required: true },
        ]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("country_custodian.activate",
          { id: activating!.id, ...(v.reconciliationRunId ? { reconciliation_run_id: v.reconciliationRunId } : {}) }, v.reason)}
      />
    </Page>
  )
}
