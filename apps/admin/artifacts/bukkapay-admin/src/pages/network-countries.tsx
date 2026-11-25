import { useMemo, useState } from "react"
import { CheckCircle2, Circle, Lock, Plus, Search, Unlock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Bool, DataTable, FormDialog, Page, Section, Stat, StatusBadge, useAction, useApi, useRequestApproval, when,
} from "@/components/network/kit"

type Country = {
  code: string; name: string; region: string; defaultCurrency: string; status: string; dialCode?: string
  complianceApproved: boolean; hasActiveCustodian: boolean; liveCollection: boolean; livePayout: boolean
  liveKyc: boolean; open: boolean; iso3?: string; regionalBlocs?: string[]
}

type CheckItem = { key: string; label: string; ok: boolean; required: boolean; detail: string; fix?: string }

type Detail = {
  country: Country & {
    capital?: string; numericCode?: string; languages: string[]; phoneNsnLengths: number[]
    secondaryCurrencies: string[]; mobileMoneyOperators: string[]; regulator?: string; licenceModel?: string
    complianceSignedBy?: string; complianceSignedAt?: string; regulatoryNotes?: string; launchedAt?: string
    currencyPeg?: string
  }
  readiness: { ready: boolean; open: boolean; passed: number; required: number; items: CheckItem[] }
  coverage: { id: string; capabilities: string[]; currencies: string[]; status: string; notes?: string
              provider: { id: string; code: string; name: string; status: string; mode: string } }[]
  custodians: { id: string; currencyCode: string; role: string; status: string; custodian: { name: string; status: string } }[]
  customers: number
  blocs: { code: string; name: string }[]
}

const REGIONS = ["Africa", "Europe", "Americas", "Middle East", "Asia", "Oceania", "all"]
const LICENCE_MODELS = ["own_licence", "partner_bank", "psp_partner", "emi_passport", "sandbox_exemption", "other"]
const COVERAGE_STATUSES = ["planned", "contracting", "sandbox", "live", "suspended"]

export default function NetworkCountriesPage() {
  const { data, isLoading, error } = useApi<Country[]>(["countries"], "/admin/network/countries")
  const action = useAction([["countries"]])
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState("Africa")
  const [query, setQuery] = useState("")

  const rows = useMemo(() => (data ?? [])
    .filter((c) => regionFilter === "all" || c.region === regionFilter)
    .filter((c) => !query || `${c.name} ${c.code} ${c.defaultCurrency}`.toLowerCase().includes(query.toLowerCase())),
  [data, regionFilter, query])
  const counts = (s: string) => (data ?? []).filter((c) => c.status === s).length

  return (
    <Page
      title="Countries"
      subtitle="Every African Union member is listed. A country stays locked (no sign-up, no sign-in) until its readiness checklist passes and a second admin approves the unlock."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add country</Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Live" value={counts("live")} tone="good" />
        <Stat label="Pilot" value={counts("pilot")} tone="warn" />
        <Stat label="Locked (planned)" value={counts("planned")} />
        <Stat label="Suspended" value={counts("suspended")} tone="bad" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {REGIONS.map((r) => (
          <Button key={r} size="sm" variant={regionFilter === r ? "default" : "outline"} onClick={() => setRegionFilter(r)}>
            {r === "all" ? "All" : r}
          </Button>
        ))}
        <div className="relative ml-auto w-64">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search country, code, currency" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable
        rows={rows} loading={isLoading} error={error} rowKey={(c) => c.code}
        columns={[
          { header: "Country", cell: (c) => (
            <button className="text-left" onClick={() => setSelected(c.code)}>
              <p className="font-semibold hover:underline">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.code}{c.iso3 ? ` · ${c.iso3}` : ""}{c.dialCode ? ` · ${c.dialCode}` : ""}</p>
            </button>
          ) },
          { header: "Currency", cell: (c) => c.defaultCurrency },
          { header: "Access", cell: (c) => c.open
            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Unlock className="w-3.5 h-3.5" />Open</span>
            : <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="w-3.5 h-3.5" />Locked</span> },
          { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          { header: "Compliance", cell: (c) => <Bool value={c.complianceApproved} yes="Signed" no="—" /> },
          { header: "Custodian", cell: (c) => <Bool value={c.hasActiveCustodian} yes="Active" no="—" /> },
          { header: "Pay-in", cell: (c) => <Bool value={c.liveCollection} yes="Live" no="—" /> },
          { header: "Payout", cell: (c) => <Bool value={c.livePayout} yes="Live" no="—" /> },
          { header: "KYC", cell: (c) => <Bool value={c.liveKyc} yes="Live" no="—" /> },
          { header: "", className: "text-right", cell: (c) => <Button size="sm" variant="outline" onClick={() => setSelected(c.code)}>Open checklist</Button> },
        ]}
      />

      {selected && <CountryDialog code={selected} onClose={() => setSelected(null)} />}

      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add country"
        description="New countries start locked ('planned') and are not available to customers."
        fields={[
          { name: "code", label: "ISO code (2 letters)", required: true },
          { name: "name", label: "Name", required: true },
          { name: "region", label: "Region", placeholder: "Africa" },
          { name: "dialCode", label: "Dial code", placeholder: "+263" },
          { name: "defaultCurrency", label: "Currency code", required: true },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/network/countries", body: v, success: "Country added" })}
      />
    </Page>
  )
}

function CountryDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const key = ["country", code]
  const { data, isLoading } = useApi<Detail>(key, `/admin/network/countries/${code}`)
  const action = useAction([key, ["countries"]])
  const requestApproval = useRequestApproval([key, ["countries"]])
  const [signoff, setSignoff] = useState(false)
  const [editing, setEditing] = useState(false)
  const [statusTo, setStatusTo] = useState<string | null>(null)
  const [coverageEdit, setCoverageEdit] = useState<Detail["coverage"][number] | null>(null)
  const c = data?.country
  const r = data?.readiness

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {c?.name ?? code} {c && <StatusBadge value={c.status} />}
            {c && (c.open
              ? <span className="text-sm text-emerald-600 inline-flex items-center gap-1"><Unlock className="w-4 h-4" />Open for sign-up & sign-in</span>
              : <span className="text-sm text-muted-foreground inline-flex items-center gap-1"><Lock className="w-4 h-4" />Locked</span>)}
          </DialogTitle>
          <DialogDescription>
            {r ? `${r.passed} of ${r.required} required checks pass.` : "Loading…"} {data ? `${data.customers} customer(s) live here.` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data || !c || !r ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {!c.open && (
                <Button disabled={!r.ready} onClick={() => setStatusTo("pilot")}>
                  <Unlock className="w-4 h-4 mr-2" />Request unlock (pilot)
                </Button>
              )}
              {c.status === "pilot" && <Button disabled={!r.ready} onClick={() => setStatusTo("live")}>Request go-live</Button>}
              {c.open && <Button variant="outline" onClick={() => setStatusTo("suspended")}>Request suspension</Button>}
              {c.status !== "planned" && <Button variant="outline" onClick={() => setStatusTo("planned")}><Lock className="w-4 h-4 mr-2" />Request lock</Button>}
              <Button variant="outline" onClick={() => setSignoff(true)}>Compliance sign-off</Button>
              <Button variant="outline" onClick={() => setEditing(true)}>Edit reference data</Button>
            </div>
            {!r.ready && !c.open && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Unlock is disabled until every required check passes. The backend refuses the unlock anyway, even if requested.
              </p>
            )}

            <Section title="Readiness checklist">
              <div className="grid gap-2">
                {r.items.map((i) => (
                  <div key={i.key} className="flex items-start gap-3 border border-border rounded-xl px-3 py-2">
                    {i.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      : i.required ? <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        : <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{i.label} {!i.required && <span className="text-xs text-muted-foreground">(recommended)</span>}</p>
                      <p className="text-xs text-muted-foreground">{i.detail}</p>
                    </div>
                    {!i.ok && i.fix && <span className="text-xs text-muted-foreground whitespace-nowrap">{i.fix}</span>}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Provider coverage">
              <DataTable
                rows={data.coverage} rowKey={(x) => x.id} empty="No provider covers this country yet. Add coverage from Providers."
                columns={[
                  { header: "Provider", cell: (x) => <div><p className="font-medium">{x.provider.name}</p>
                    <p className="text-xs text-muted-foreground">{x.provider.status} · {x.provider.mode}</p></div> },
                  { header: "Can do", cell: (x) => <span className="text-xs">{x.capabilities.map((k) => k.replace(/_/g, " ")).join(", ")}</span> },
                  { header: "Status", cell: (x) => <StatusBadge value={x.status} /> },
                  { header: "", className: "text-right", cell: (x) => <Button size="sm" variant="outline" onClick={() => setCoverageEdit(x)}>Change</Button> },
                ]}
              />
              <p className="text-xs text-muted-foreground">A rail counts only when its coverage is <b>live</b> and the provider itself is active in production (Providers → change mode/status, approval required).</p>
            </Section>

            <Section title="Custodians">
              <DataTable
                rows={data.custodians} rowKey={(x) => x.id} empty="No custodian assigned. Assign one in Custodians."
                columns={[
                  { header: "Custodian", cell: (x) => x.custodian.name },
                  { header: "Currency", cell: (x) => x.currencyCode },
                  { header: "Role", cell: (x) => x.role },
                  { header: "Status", cell: (x) => <StatusBadge value={x.status} /> },
                ]}
              />
            </Section>

            <Section title="Reference">
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <Ref label="ISO codes" value={`${c.code} / ${c.iso3 ?? "—"} / ${c.numericCode ?? "—"}`} />
                <Ref label="Capital" value={c.capital} />
                <Ref label="Dial code" value={`${c.dialCode ?? "—"} (${(c.phoneNsnLengths ?? []).join(" or ") || "?"} digits)`} />
                <Ref label="Currency" value={`${c.defaultCurrency}${c.currencyPeg ? ` · pegged to ${c.currencyPeg}` : ""}`} />
                <Ref label="Also used" value={(c.secondaryCurrencies ?? []).join(", ")} />
                <Ref label="Languages" value={(c.languages ?? []).join(", ")} />
                <Ref label="Regional blocs" value={data.blocs.map((b) => b.code).join(", ")} />
                <Ref label="Mobile money" value={(c.mobileMoneyOperators ?? []).join(", ")} />
                <Ref label="Regulator" value={c.regulator} />
                <Ref label="Licence model" value={c.licenceModel?.replace(/_/g, " ")} />
                <Ref label="Signed off" value={c.complianceSignedBy ? `${c.complianceSignedBy}, ${when(c.complianceSignedAt)}` : undefined} />
                <Ref label="Launched" value={c.launchedAt ? when(c.launchedAt) : undefined} />
              </dl>
              {c.regulatoryNotes && <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded-lg p-3">{c.regulatoryNotes}</p>}
            </Section>
          </div>
        )}

        {c && (
          <>
            <FormDialog
              open={signoff} onOpenChange={setSignoff} title={`Compliance sign-off — ${c.name}`}
              description="Compliance officers only. Record the regulator and the licence model BukkaPay operates under here. Withdrawing the sign-off requires the country to be suspended first."
              initial={{ approved: c.complianceApproved || true, regulator: c.regulator ?? "", licenceModel: c.licenceModel ?? "", notes: c.regulatoryNotes ?? "" }}
              fields={[
                { name: "approved", label: "Signed off", type: "checkbox" },
                { name: "regulator", label: "Regulator", placeholder: "e.g. Central Bank of Kenya" },
                { name: "licenceModel", label: "Licence model", type: "select", options: LICENCE_MODELS.map((m) => ({ value: m, label: m.replace(/_/g, " ") })) },
                { name: "notes", label: "Notes (licence numbers, AML programme, conditions)", type: "textarea" },
              ]}
              onSubmit={(v) => action.mutateAsync({
                url: `/admin/network/countries/${c.code}/compliance`, success: "Compliance sign-off recorded",
                body: { approved: !!v.approved, regulator: v.regulator || null, licenceModel: v.licenceModel || null, notes: v.notes || null },
              })}
            />
            <FormDialog
              open={editing} onOpenChange={setEditing} title={`Reference data — ${c.name}`}
              initial={{ capital: c.capital ?? "", dialCode: c.dialCode ?? "", languages: (c.languages ?? []).join(", "),
                         phoneNsnLengths: (c.phoneNsnLengths ?? []).join(", "), secondaryCurrencies: (c.secondaryCurrencies ?? []).join(", "),
                         mobileMoneyOperators: (c.mobileMoneyOperators ?? []).join(", ") }}
              fields={[
                { name: "capital", label: "Capital" },
                { name: "dialCode", label: "Dial code" },
                { name: "languages", label: "Languages (comma-separated)" },
                { name: "phoneNsnLengths", label: "Mobile number lengths, without the dial code (comma-separated)" },
                { name: "secondaryCurrencies", label: "Other currencies in use (comma-separated)" },
                { name: "mobileMoneyOperators", label: "Mobile money operators (comma-separated)" },
              ]}
              onSubmit={(v) => {
                const list = (s: string) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean)
                return action.mutateAsync({
                  method: "patch", url: `/admin/network/countries/${c.code}`, success: "Reference data saved",
                  body: { capital: v.capital || null, dialCode: v.dialCode || null, languages: list(v.languages),
                          phoneNsnLengths: list(v.phoneNsnLengths).map(Number).filter((n) => n > 0),
                          secondaryCurrencies: list(v.secondaryCurrencies).map((x) => x.toUpperCase()),
                          mobileMoneyOperators: list(v.mobileMoneyOperators) },
                })
              }}
            />
            <FormDialog
              open={!!statusTo} onOpenChange={(o) => !o && setStatusTo(null)} title={`Set ${c.name} to ${statusTo}`}
              description={statusTo === "planned" ? "Locks the country: no sign-ups and no sign-ins." : statusTo === "suspended"
                ? "Stops sign-ups and money movement. Existing customers can still sign in to reach their money and support."
                : "Opens sign-up and sign-in. Runs only when a second admin approves, and only if the checklist still passes."}
              fields={[{ name: "reason", label: "Reason", type: "textarea", required: true }]}
              submitLabel="Request approval"
              onSubmit={(v) => requestApproval("country.set_status", { country: c.code, status: statusTo }, v.reason)}
            />
            <FormDialog
              open={!!coverageEdit} onOpenChange={(o) => !o && setCoverageEdit(null)}
              title={`${coverageEdit?.provider.name ?? ""} in ${c.name}`}
              description="Mark live only when the contract is signed and the integration is tested in production."
              initial={{ status: coverageEdit?.status, notes: coverageEdit?.notes ?? "" }}
              fields={[
                { name: "status", label: "Status", type: "select", required: true, options: COVERAGE_STATUSES.map((s) => ({ value: s, label: s })) },
                { name: "notes", label: "Notes", type: "textarea" },
              ]}
              onSubmit={(v) => action.mutateAsync({
                method: "patch", url: `/admin/network/provider-coverage/${coverageEdit!.id}`, success: "Coverage updated",
                body: { status: v.status, notes: v.notes || null },
              })}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Ref({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  )
}
