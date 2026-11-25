import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Section, Stat, StatusBadge, money, useAction, useApi } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Pair = { id: string; from: string; to: string; rate: string; spreadPct: string; minAmount: string; maxAmount: string; active: boolean }
type Bal = { currency: string; balance: string }
type Feed = { enabled: boolean; bufferBps: number; maxMovePct: number; staleMinutes: number; source: string
  last: { at: string; ok: boolean; updated?: number; held?: { pair: string; from: string; to: string }[]; missing?: string[]; error?: string } | null }
type Desk = { pairs: Pair[]; positions: Bal[]; revenue: Bal[]; feed?: Feed }

const CCY = ["ZAR", "BWP", "USD"].map((c) => ({ value: c, label: c }))

/** Swap rates and spreads used for wallet-to-wallet conversion, cross-currency
 *  trade payments and QR payments, plus the FX pool they move. */
export default function FxDeskPage() {
  const perms = usePermissions()
  const desk = useApi<Desk>(["fx-desk"], "/admin/fx/desk")
  const action = useAction([["fx-desk"]])
  const [editing, setEditing] = useState<Pair | null>(null)
  const [creating, setCreating] = useState(false)
  const can = perms.can("fx.manage")
  const d = desk.data

  return (
    <Page title="FX desk"
      subtitle="Rates and spreads for converting between ZAR, BWP and USD wallets. Customers always see the rate and spread before they confirm; changes apply to new quotes immediately and are recorded in the audit log."
      actions={can ? <Button onClick={() => setCreating(true)}>Add currency pair</Button> : undefined}>
      {d?.feed && (
        <Section title="Live market rates" actions={can && d.feed.enabled
          ? <Button size="sm" variant="outline" onClick={() => action.mutate({ url: "/admin/fx/feed/refresh", success: "Rates refreshed" })}>Refresh now</Button>
          : undefined}>
          <div className="bg-card border border-border rounded-2xl p-4 text-sm space-y-1">
            {!d.feed.enabled ? <p>The live feed is <b>off</b>: rates are set by hand below. Turn it on in Revenue &amp; Pricing → FX.</p> : <>
              <p>
                <StatusBadge value={d.feed.last?.ok ? "live" : d.feed.last ? "failed" : "pending"} />{" "}
                Every 30 seconds each pair is set to the market mid minus a {d.feed.bufferBps / 100}% buffer; your spread is charged on top.
                If the feed stops, swaps pause after {d.feed.staleMinutes} minutes instead of trading on old prices.
              </p>
              {d.feed.last && <p className="text-muted-foreground">Last refresh {new Date(d.feed.last.at).toLocaleString()}
                {d.feed.last.ok ? ` · ${d.feed.last.updated} pairs updated` : ` · ${d.feed.last.error}`}</p>}
              {!!d.feed.last?.held?.length && <p className="text-amber-700">Held by the circuit breaker (moved more than {d.feed.maxMovePct}% at once, review and set by hand): {d.feed.last.held.map((h) => `${h.pair} ${h.from} → ${h.to}`).join(", ")}</p>}
              {!!d.feed.last?.missing?.length && <p className="text-muted-foreground">Not in the feed: {d.feed.last.missing.join(", ")}</p>}
              <p className="text-xs text-muted-foreground">Source: {d.feed.source}</p>
            </>}
          </div>
        </Section>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="FX pool position">
          <p className="mb-3 text-sm text-muted-foreground">What BukkaPay has taken in (+) or paid out (−) in each currency through conversions. A growing negative position needs rebalancing with a treasury partner.</p>
          <div className="flex flex-wrap gap-3">
            {(d?.positions ?? []).map((p) => <Stat key={p.currency} label={p.currency} value={money(p.balance, p.currency)} tone={Number(p.balance) < 0 ? "warn" : undefined} />)}
            {!d?.positions?.length && <p className="text-sm text-muted-foreground">No conversions yet.</p>}
          </div>
        </Section>
        <Section title="FX revenue (spread earned)">
          <div className="flex flex-wrap gap-3">
            {(d?.revenue ?? []).map((p) => <Stat key={p.currency} label={p.currency} value={money(p.balance, p.currency)} tone="good" />)}
            {!d?.revenue?.length && <p className="text-sm text-muted-foreground">No FX revenue yet.</p>}
          </div>
        </Section>
      </div>
      <Section title="Currency pairs">
        <DataTable rows={d?.pairs} loading={desk.isLoading} error={desk.error} rowKey={(p) => p.id} empty="No currency pairs configured."
          columns={[
            { header: "Pair", cell: (p) => <span className="font-semibold">{p.from} → {p.to}</span> },
            { header: "Rate", className: "tabular-nums", cell: (p) => <span>1 {p.from} = {Number(p.rate).toFixed(6)} {p.to}</span> },
            { header: "Spread", className: "tabular-nums", cell: (p) => `${Number(p.spreadPct).toFixed(2)}%` },
            { header: "Limits", cell: (p) => `${money(p.minAmount, p.from)} – ${money(p.maxAmount, p.from)}` },
            { header: "Status", cell: (p) => <StatusBadge value={p.active ? "active" : "inactive"} /> },
            { header: "", className: "text-right", cell: (p) => can ? <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button> : null },
          ]} />
      </Section>

      <FormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing ? `Edit ${editing.from} → ${editing.to}` : ""}
        description="Moves of more than 10% in one step must be confirmed, to stop a typo repricing every conversion."
        initial={editing ? { rate: editing.rate, spreadPct: editing.spreadPct, minAmount: editing.minAmount, maxAmount: editing.maxAmount, active: editing.active } : undefined}
        fields={[
          { name: "rate", label: `Rate (1 ${editing?.from} = ? ${editing?.to})`, required: true },
          { name: "spreadPct", label: "Spread % (0–5)", required: true },
          { name: "minAmount", label: "Minimum" },
          { name: "maxAmount", label: "Maximum" },
          { name: "active", label: "Active", type: "checkbox" },
          { name: "confirmLargeMove", label: "I confirm a move of more than 10%", type: "checkbox" },
          { name: "reason", label: "Reason (for the audit log)", required: true },
        ]}
        submitLabel="Save" busy={action.isPending}
        onSubmit={(v) => action.mutateAsync({ method: "patch", url: `/admin/fx/pairs/${editing!.id}`, body: v, success: "Rate updated" })} />

      <FormDialog open={creating} onOpenChange={setCreating} title="Add currency pair"
        fields={[
          { name: "fromCurrency", label: "From", type: "select", required: true, options: CCY },
          { name: "toCurrency", label: "To", type: "select", required: true, options: CCY },
          { name: "rate", label: "Rate (1 from = ? to)", required: true },
          { name: "spreadPct", label: "Spread % (0–5)", required: true },
          { name: "reason", label: "Reason (for the audit log)", required: true },
        ]}
        submitLabel="Add pair" busy={action.isPending}
        onSubmit={(v) => action.mutateAsync({ url: "/admin/fx/pairs", body: v, success: "Currency pair added" })} />
    </Page>
  )
}
