import { useState } from "react"
import { Globe2, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DataTable, FormDialog, Page, Section, StatusBadge, useAction, useApi, useRequestApproval,
} from "@/components/network/kit"

type Provider = {
  id: string; code: string; name: string; providerType: string; countryCode?: string; currencies: string[]
  methods: string[]; mode: string; status: string; webhookStatus: string; credentialsRef?: string
}

type Coverage = {
  id: string; countryCode: string; countryName: string; capabilities: string[]; currencies: string[]
  status: string; notes?: string
}

type Rollout = {
  catalogue: { code: string; name: string; role: string; why: string; cost: string; countries: number
               capabilities: string[]; coverageByStatus: Record<string, number> }[]
  capabilities: string[]
}

const STATUSES = ["planned", "contracting", "sandbox", "live", "suspended"]

export default function NetworkProvidersPage() {
  const { data, isLoading, error } = useApi<Provider[]>(["providers"], "/admin/network/providers")
  const rollout = useApi<Rollout>(["rollout"], "/admin/network/rollout")
  const action = useAction([["providers"], ["rollout"]])
  const requestApproval = useRequestApproval([["providers"]])
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState<Provider | null>(null)
  const [coverageFor, setCoverageFor] = useState<Provider | null>(null)
  const byCode = Object.fromEntries((data ?? []).map((p) => [p.code, p]))

  return (
    <Page
      title="Payment providers"
      subtitle="Banks, PSPs, mobile-money operators, KYC and settlement networks behind modular adapters. Coverage says what each provider does in each country; only live coverage of an active production provider counts toward a country's readiness. Switching mode or status needs approval."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add provider</Button>}
    >
      <Section title="Recommended rollout stack (cheapest, widest coverage first)">
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(rollout.data?.catalogue ?? []).map((p) => (
            <div key={p.code} className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.role}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600"><Globe2 className="w-3.5 h-3.5" />{p.countries}</span>
              </div>
              <p className="text-sm">{p.why}</p>
              <p className="text-xs text-muted-foreground">Cost: {p.cost}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(p.coverageByStatus).map(([s, n]) => (
                  <span key={s} className="text-xs"><StatusBadge value={s} /> {n}</span>
                ))}
              </div>
              {byCode[p.code] && <Button size="sm" variant="outline" onClick={() => setCoverageFor(byCode[p.code])}>Manage coverage</Button>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Coverage is seeded from vendor-published footprints as <b>planned</b>. Confirm each country against the signed contract before marking it live.</p>
      </Section>

      <Section title="All providers">
        <DataTable
          rows={data} loading={isLoading} error={error} rowKey={(p) => p.id}
          columns={[
            { header: "Provider", cell: (p) => <div><p className="font-semibold">{p.name}</p><p className="text-xs font-mono text-muted-foreground">{p.code}</p></div> },
            { header: "Type", cell: (p) => p.providerType },
            { header: "Country", cell: (p) => p.countryCode ?? "Multi" },
            { header: "Methods", cell: (p) => <span className="text-xs">{p.methods?.join(", ") || "—"}</span> },
            { header: "Mode", cell: (p) => <StatusBadge value={p.mode} /> },
            { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
            { header: "Credentials", cell: (p) => <span className="font-mono text-xs">{p.credentialsRef ?? "—"}</span> },
            { header: "", className: "text-right whitespace-nowrap", cell: (p) => (
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setCoverageFor(p)}>Coverage</Button>
                <Button size="sm" variant="outline" onClick={() => setChanging(p)}>Mode/status</Button>
              </div>
            ) },
          ]}
        />
      </Section>

      {coverageFor && <CoverageDialog provider={coverageFor} capabilities={rollout.data?.capabilities ?? []} onClose={() => setCoverageFor(null)} />}

      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add provider"
        description="New providers start inactive in sandbox mode."
        fields={[
          { name: "code", label: "Adapter code", required: true, help: "Must match an implemented adapter to process payments." },
          { name: "name", label: "Name", required: true },
          { name: "providerType", label: "Type", type: "select", required: true,
            options: ["bank", "psp", "card", "mobile_money", "network", "settlement", "fx", "kyc"].map((v) => ({ value: v, label: v })) },
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

function CoverageDialog({ provider, capabilities, onClose }: { provider: Provider; capabilities: string[]; onClose: () => void }) {
  const key = ["coverage", provider.id]
  const { data, isLoading, error } = useApi<Coverage[]>(key, `/admin/network/providers/${provider.id}/coverage`)
  const action = useAction([key, ["rollout"], ["countries"]])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Coverage | null>(null)
  const list = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  const capHelp = `One or more of: ${capabilities.join(", ")}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider.name}: coverage</DialogTitle>
          <DialogDescription>
            Provider is {provider.status} in {provider.mode} mode. Live coverage counts only while the provider is active in production.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end"><Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" />Add country</Button></div>
        <DataTable
          rows={data} loading={isLoading} error={error} rowKey={(x) => x.id} empty="No coverage yet."
          columns={[
            { header: "Country", cell: (x) => <div><p className="font-medium">{x.countryName}</p><p className="text-xs text-muted-foreground">{x.countryCode} · {x.currencies.join(", ")}</p></div> },
            { header: "Can do", cell: (x) => <span className="text-xs">{x.capabilities.map((k) => k.replace(/_/g, " ")).join(", ")}</span> },
            { header: "Status", cell: (x) => <StatusBadge value={x.status} /> },
            { header: "", className: "text-right whitespace-nowrap", cell: (x) => (
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setEditing(x)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => action.mutate({ method: "delete", url: `/admin/network/provider-coverage/${x.id}`, success: "Coverage removed" })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ) },
          ]}
        />
        <FormDialog
          open={adding} onOpenChange={setAdding} title="Add coverage"
          fields={[
            { name: "countryCode", label: "Country (ISO-2)", required: true },
            { name: "capabilities", label: "Capabilities (comma-separated)", required: true, help: capHelp },
            { name: "currencies", label: "Currencies (comma-separated, default: country currency)" },
            { name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={(v) => action.mutateAsync({
            url: "/admin/network/provider-coverage", success: "Coverage added",
            body: { providerId: provider.id, countryCode: String(v.countryCode).toUpperCase(), capabilities: list(v.capabilities),
                    currencies: list(v.currencies).map((c) => c.toUpperCase()), status: v.status || "planned", notes: v.notes || null },
          })}
        />
        <FormDialog
          open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`Edit ${editing?.countryName ?? ""}`}
          initial={{ status: editing?.status, capabilities: editing?.capabilities.join(", "), currencies: editing?.currencies.join(", "), notes: editing?.notes ?? "" }}
          fields={[
            { name: "status", label: "Status", type: "select", required: true, options: STATUSES.map((s) => ({ value: s, label: s })) },
            { name: "capabilities", label: "Capabilities (comma-separated)", required: true, help: capHelp },
            { name: "currencies", label: "Currencies (comma-separated)" },
            { name: "notes", label: "Notes", type: "textarea" },
          ]}
          onSubmit={(v) => action.mutateAsync({
            method: "patch", url: `/admin/network/provider-coverage/${editing!.id}`, success: "Coverage updated",
            body: { status: v.status, capabilities: list(v.capabilities), currencies: list(v.currencies).map((c) => c.toUpperCase()), notes: v.notes || null },
          })}
        />
      </DialogContent>
    </Dialog>
  )
}
