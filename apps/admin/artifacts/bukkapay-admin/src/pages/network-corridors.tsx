import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bool, DataTable, FormDialog, Page, StatusBadge, money, useAction, useApi, useRequestApproval, when } from "@/components/network/kit"

type Corridor = {
  id: string; fromCountry: string; toCountry: string; fromCurrency: string; toCurrency: string; status: string
  settlementModel: string; railProviderId?: string; rate?: string; rateSource: string; rateUpdatedAt?: string
  rateFresh: boolean; maxRateAgeSeconds: number; fxMarkupBps: number; quoteTtlSeconds: number
  minAmount: string; maxAmount: string; liquidityLimit?: string
}
type Provider = { id: string; code: string; name: string }

export default function NetworkCorridorsPage() {
  const { data, isLoading, error } = useApi<Corridor[]>(["corridors"], "/admin/network/corridors")
  const { data: providers } = useApi<Provider[]>(["providers"], "/admin/network/providers")
  const action = useAction([["corridors"]])
  const requestApproval = useRequestApproval([["corridors"]])
  const [creating, setCreating] = useState(false)
  const [rateFor, setRateFor] = useState<Corridor | null>(null)
  const [statusFor, setStatusFor] = useState<Corridor | null>(null)
  const rail = (id?: string) => providers?.find((p) => p.id === id)?.code ?? "—"

  return (
    <Page
      title="Corridors & FX"
      subtitle="Approved cross-border routes. Customers get an executable quote (rate, fee, exact amounts, expiry); stale rates are refused. Recipients are credited only after the rail confirms settlement."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />New corridor</Button>}
    >
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(c) => c.id}
        columns={[
          { header: "Route", cell: (c) => <div className="font-semibold">{c.fromCountry} → {c.toCountry}<p className="text-xs text-muted-foreground font-normal">{c.fromCurrency} → {c.toCurrency}</p></div> },
          { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          { header: "Rail", cell: (c) => <span className="font-mono text-xs">{rail(c.railProviderId)}</span> },
          { header: "Rate", cell: (c) => c.rate ? <div><p className="tabular-nums">{Number(c.rate).toFixed(6)}</p><p className="text-xs text-muted-foreground">{c.rateSource} · {when(c.rateUpdatedAt)}</p></div> : "—" },
          { header: "Fresh", cell: (c) => <Bool value={c.rateFresh} yes="Fresh" no="Stale" /> },
          { header: "Markup", cell: (c) => `${c.fxMarkupBps} bps` },
          { header: "Limits", cell: (c) => `${money(c.minAmount)} – ${money(c.maxAmount)}` },
          { header: "Liquidity cap", cell: (c) => c.liquidityLimit ? money(c.liquidityLimit, c.toCurrency) : "—" },
          {
            header: "", className: "text-right whitespace-nowrap", cell: (c) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setRateFor(c)}>Set rate</Button>
                <Button size="sm" variant="outline" onClick={() => setStatusFor(c)}>Status</Button>
              </div>
            ),
          },
        ]}
      />
      <FormDialog
        open={creating} onOpenChange={setCreating} title="New corridor" description="Created as a draft."
        fields={[
          { name: "fromCountry", label: "From country", required: true },
          { name: "toCountry", label: "To country", required: true },
          { name: "fromCurrency", label: "From currency", required: true },
          { name: "toCurrency", label: "To currency", required: true },
          { name: "railProviderId", label: "Settlement rail", type: "select", required: true,
            options: (providers ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })) },
          { name: "settlementModel", label: "Settlement model", type: "select",
            options: ["prefunded", "net_settlement", "internal_book"].map((v) => ({ value: v, label: v })) },
          { name: "minAmount", label: "Min amount", type: "number" },
          { name: "maxAmount", label: "Max amount", type: "number" },
          { name: "fxMarkupBps", label: "FX markup (bps)", type: "number" },
          { name: "maxRateAgeSeconds", label: "Max rate age (s)", type: "number" },
          { name: "liquidityLimit", label: "Destination liquidity cap", type: "number" },
        ]}
        onSubmit={(v) => action.mutateAsync({
          url: "/admin/network/corridors", success: "Corridor created (draft)",
          body: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined)),
        })}
      />
      <FormDialog
        open={!!rateFor} onOpenChange={(o) => !o && setRateFor(null)}
        title={`Executable rate ${rateFor?.fromCurrency} → ${rateFor?.toCurrency}`}
        description="Enter the provider's executable rate (units of destination currency per 1 source unit)."
        fields={[
          { name: "rate", label: "Rate", type: "number", required: true },
          { name: "source", label: "Source", placeholder: "provider name / manual" },
        ]}
        onSubmit={(v) => action.mutateAsync({ url: `/admin/network/corridors/${rateFor!.id}/rate`, body: v, success: "Rate recorded" })}
      />
      <FormDialog
        open={!!statusFor} onOpenChange={(o) => !o && setStatusFor(null)} title="Change corridor status"
        description="Activation is checked against both countries, the rail, destination wallets and a fresh rate."
        fields={[
          { name: "status", label: "Status", type: "select", required: true, options: ["draft", "pilot", "active", "suspended"].map((v) => ({ value: v, label: v })) },
          { name: "reason", label: "Reason", type: "textarea", required: true },
        ]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("corridor.set_status", { id: statusFor!.id, status: v.status }, v.reason)}
      />
    </Page>
  )
}
