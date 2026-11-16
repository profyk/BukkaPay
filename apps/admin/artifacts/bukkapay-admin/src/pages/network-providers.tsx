import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, StatusBadge, useAction, useApi, useRequestApproval } from "@/components/network/kit"

type Provider = {
  id: string; code: string; name: string; providerType: string; countryCode?: string; currencies: string[]
  methods: string[]; mode: string; status: string; webhookStatus: string; credentialsRef?: string
}

export default function NetworkProvidersPage() {
  const { data, isLoading, error } = useApi<Provider[]>(["providers"], "/admin/network/providers")
  const action = useAction([["providers"]])
  const requestApproval = useRequestApproval([["providers"]])
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState<Provider | null>(null)

  return (
    <Page
      title="Payment providers"
      subtitle="Banks, PSPs, mobile-money operators and settlement networks behind modular adapters. A provider with no adapter (or in sandbox mode) can't move real money. Switching mode or status needs approval."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add provider</Button>}
    >
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(p) => p.id}
        columns={[
          { header: "Provider", cell: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-xs font-mono text-muted-foreground">{p.code}</p></div> },
          { header: "Type", cell: (p) => p.providerType },
          { header: "Country", cell: (p) => p.countryCode ?? "Multi" },
          { header: "Currencies", cell: (p) => p.currencies?.join(", ") || "—" },
          { header: "Methods", cell: (p) => p.methods?.join(", ") || "—" },
          { header: "Mode", cell: (p) => <StatusBadge value={p.mode} /> },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
          { header: "Credentials", cell: (p) => <span className="font-mono text-xs">{p.credentialsRef ?? "—"}</span> },
          { header: "", className: "text-right", cell: (p) => <Button size="sm" variant="outline" onClick={() => setChanging(p)}>Change mode/status</Button> },
        ]}
      />
      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add provider"
        description="New providers start inactive in sandbox mode."
        fields={[
          { name: "code", label: "Adapter code", required: true, help: "Must match an implemented adapter to process payments." },
          { name: "name", label: "Name", required: true },
          { name: "providerType", label: "Type", type: "select", required: true,
            options: ["bank", "psp", "card", "mobile_money", "network", "settlement", "fx"].map((v) => ({ value: v, label: v })) },
          { name: "countryCode", label: "Country (ISO-2)" },
          { name: "currencies", label: "Currencies (comma-separated)" },
          { name: "methods", label: "Methods (comma-separated)" },
          { name: "credentialsRef", label: "Credentials secret name" },
        ]}
        onSubmit={(v) => action.mutateAsync({
          url: "/admin/network/providers", success: "Provider added",
          body: { ...v, currencies: String(v.currencies ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                  methods: String(v.methods ?? "").split(",").map((s) => s.trim()).filter(Boolean) },
        })}
      />
      <FormDialog
        open={!!changing} onOpenChange={(o) => !o && setChanging(null)} title={`Change ${changing?.name ?? ""}`}
        fields={[
          { name: "mode", label: "Mode", type: "select", options: [{ value: "sandbox", label: "sandbox" }, { value: "production", label: "production" }] },
          { name: "status", label: "Status", type: "select", options: ["inactive", "active", "degraded", "suspended"].map((v) => ({ value: v, label: v })) },
          { name: "reason", label: "Reason", type: "textarea", required: true },
        ]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("provider.set_mode", {
          id: changing!.id, ...(v.mode ? { mode: v.mode } : {}), ...(v.status ? { status: v.status } : {}),
        }, v.reason)}
      />
    </Page>
  )
}
