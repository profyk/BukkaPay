import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Bool, DataTable, FormDialog, Page, Stat, StatusBadge, useAction, useApi, useRequestApproval,
} from "@/components/network/kit"

type Country = {
  code: string; name: string; region: string; defaultCurrency: string; status: string
  complianceApproved: boolean; custodianReady: boolean; providerReady: boolean; hasActiveCustodian: boolean
  regulatoryNotes?: string | null
}

export default function NetworkCountriesPage() {
  const { data, isLoading, error } = useApi<Country[]>(["countries"], "/admin/network/countries")
  const patch = useAction([["countries"]])
  const requestApproval = useRequestApproval([["countries"]])
  const [creating, setCreating] = useState(false)
  const [statusFor, setStatusFor] = useState<Country | null>(null)
  const [regionFilter, setRegionFilter] = useState("Africa")

  const rows = (data ?? []).filter((c) => regionFilter === "all" || c.region === regionFilter)
  const counts = (s: string) => (data ?? []).filter((c) => c.status === s).length

  return (
    <Page
      title="Countries"
      subtitle="Where BukkaPay operates. A country only becomes available after compliance sign-off, an active primary custodian and a ready provider — and the status change itself needs a second admin's approval."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add country</Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Live" value={counts("live")} tone="good" />
        <Stat label="Pilot" value={counts("pilot")} tone="warn" />
        <Stat label="Planned" value={counts("planned")} />
        <Stat label="Suspended" value={counts("suspended")} tone="bad" />
      </div>
      <div className="flex gap-2">
        {["Africa", "Europe", "Americas", "Middle East", "Asia", "Oceania", "all"].map((r) => (
          <Button key={r} size="sm" variant={regionFilter === r ? "default" : "outline"} onClick={() => setRegionFilter(r)}>
            {r === "all" ? "All" : r}
          </Button>
        ))}
      </div>
      <DataTable
        rows={rows} loading={isLoading} error={error} rowKey={(c) => c.code}
        columns={[
          { header: "Country", cell: (c) => <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.code}</p></div> },
          { header: "Currency", cell: (c) => c.defaultCurrency },
          { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          {
            header: "Compliance", cell: (c) => (
              <button className="underline-offset-2 hover:underline" onClick={() => patch.mutate({
                method: "patch", url: `/admin/network/countries/${c.code}`,
                body: { complianceApproved: !c.complianceApproved }, success: "Compliance flag updated",
              })}><Bool value={c.complianceApproved} yes="Signed off" no="Not signed off" /></button>
            ),
          },
          { header: "Custodian", cell: (c) => <Bool value={c.hasActiveCustodian} yes="Active" no="None" /> },
          {
            header: "Provider", cell: (c) => (
              <button className="underline-offset-2 hover:underline" onClick={() => patch.mutate({
                method: "patch", url: `/admin/network/countries/${c.code}`,
                body: { providerReady: !c.providerReady }, success: "Provider flag updated",
              })}><Bool value={c.providerReady} yes="Ready" no="Not ready" /></button>
            ),
          },
          {
            header: "", className: "text-right",
            cell: (c) => <Button size="sm" variant="outline" onClick={() => setStatusFor(c)}>Change status</Button>,
          },
        ]}
      />

      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add country"
        description="New countries start as 'planned' and are not available to customers."
        fields={[
          { name: "code", label: "ISO code (2 letters)", required: true },
          { name: "name", label: "Name", required: true },
          { name: "region", label: "Region", placeholder: "Africa" },
          { name: "dialCode", label: "Dial code", placeholder: "+263" },
          { name: "defaultCurrency", label: "Currency code", required: true },
        ]}
        onSubmit={(v) => patch.mutateAsync({ url: "/admin/network/countries", body: v, success: "Country added" })}
      />
      <FormDialog
        open={!!statusFor} onOpenChange={(o) => !o && setStatusFor(null)} title={`Change status — ${statusFor?.name ?? ""}`}
        description="This files a maker-checker request. The change runs only when another admin approves it, and is refused if readiness gates aren't met."
        fields={[
          { name: "status", label: "New status", type: "select", required: true, options: ["planned", "pilot", "live", "suspended"].map((s) => ({ value: s, label: s })) },
          { name: "reason", label: "Reason", type: "textarea", required: true },
        ]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("country.set_status", { country: statusFor!.code, status: v.status }, v.reason)}
      />
    </Page>
  )
}
