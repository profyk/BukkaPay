import { useState } from "react"
import { ShieldCheck, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, money, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Row = {
  currency: string; liabilities: string; reserves: string; surplus: string; coverage: string | null
  covered: boolean; reservesAsOf: string | null; custodians: number
}
type Custodian = { id: string; name: string; countryCode: string }

const STALE_HOURS = 36

/** Proof of reserve: every customer, merchant and escrow balance must be
 *  backed 1:1 by money held at a licensed custodian, per currency. */
export default function SafeguardingPage() {
  const perms = usePermissions()
  const report = useApi<Row[]>(["reserves"], "/admin/treasury/reserves")
  const custodians = useApi<Custodian[]>(["custodians"], "/admin/network/custodians")
  const action = useAction([["reserves"]])
  const [open, setOpen] = useState(false)
  const rows = report.data ?? []
  const short = rows.filter((r) => !r.covered && Number(r.liabilities) > 0)
  const stale = rows.filter((r) => !r.reservesAsOf || (Date.now() - new Date(r.reservesAsOf).getTime()) / 3.6e6 > STALE_HOURS)

  return (
    <Page title="Safeguarding & proof of reserve"
      subtitle="What BukkaPay owes customers, merchants and escrow, against what licensed custodians report holding — per currency, never added together. Owed comes from the ledger; held comes from custodian statements or APIs."
      actions={perms.can("reconciliation.run") ? <Button onClick={() => setOpen(true)}>Record custodian balance</Button> : undefined}>
      <div className={`rounded-2xl border p-5 flex gap-3 ${short.length ? "border-destructive/30 bg-destructive/5" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
        {short.length ? <ShieldAlert className="w-6 h-6 text-destructive shrink-0" /> : <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />}
        <div className="text-sm">
          <p className="font-semibold">{short.length ? `Shortfall in ${short.map((r) => r.currency).join(", ")}` : rows.length ? "Every currency is covered 1:1" : "No balances yet"}</p>
          <p className="text-muted-foreground mt-1">
            {short.length ? "Top up the safeguarding account or rebalance from another pool, then record the new custodian balance." :
              "Keep custodian balances current: figures older than 36 hours are flagged below."}
          </p>
        </div>
      </div>
      <Section title="By currency">
        <DataTable rows={rows} loading={report.isLoading} error={report.error} rowKey={(r) => r.currency} empty="No liabilities or custodian balances recorded yet."
          columns={[
            { header: "Currency", cell: (r) => <span className="font-semibold">{r.currency}</span> },
            { header: "Owed (ledger)", className: "text-right tabular-nums", cell: (r) => money(r.liabilities, r.currency) },
            { header: "Held (custodians)", className: "text-right tabular-nums", cell: (r) => money(r.reserves, r.currency) },
            { header: "Surplus / shortfall", className: "text-right tabular-nums", cell: (r) => (
              <span className={Number(r.surplus) < 0 ? "text-destructive font-semibold" : "text-emerald-600"}>{money(r.surplus, r.currency)}</span>) },
            { header: "Coverage", className: "text-right", cell: (r) => r.coverage ? `${(Number(r.coverage) * 100).toFixed(2)}%` : "—" },
            { header: "Custodian figure", cell: (r) => (
              <span className={stale.includes(r) ? "text-amber-600" : ""}>{r.reservesAsOf ? when(r.reservesAsOf) : "none recorded"}{r.custodians ? ` · ${r.custodians} custodian${r.custodians > 1 ? "s" : ""}` : ""}</span>) },
          ]} />
      </Section>
      <FormDialog open={open} onOpenChange={setOpen} title="Record custodian balance"
        description="Enter the closing balance from the custodian's statement or API for one currency."
        fields={[
          { name: "custodianId", label: "Custodian", type: "select", required: true, options: (custodians.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.countryCode})` })) },
          { name: "currency", label: "Currency", type: "select", required: true, options: ["ZAR", "BWP", "USD"].map((c) => ({ value: c, label: c })) },
          { name: "balance", label: "Balance", required: true, placeholder: "1250000.00" },
          { name: "asOf", label: "As of (YYYY-MM-DD HH:MM, UTC)", required: true, placeholder: "2026-11-22 23:59" },
          { name: "source", label: "Source", type: "select", options: [{ value: "statement", label: "Bank statement" }, { value: "api", label: "Custodian API" }, { value: "manual", label: "Manual" }] },
          { name: "reference", label: "Statement reference (optional)" },
        ]}
        submitLabel="Save balance" busy={action.isPending}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/treasury/custodian-balances", success: "Custodian balance recorded", body: {
          ...v, source: v.source || "statement", asOf: new Date(String(v.asOf).replace(" ", "T") + ":00Z").toISOString(),
        } })} />
    </Page>
  )
}
