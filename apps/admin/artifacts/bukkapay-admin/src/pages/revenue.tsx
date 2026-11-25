import { useMemo, useState } from "react"
import { Calculator, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DataTable, Page, Section, Stat, StatusBadge, errorMessage, money, useAction, useApi,
} from "@/components/network/kit"
import { api } from "@/lib/api"

type Stream = { stream: string; currency: string; amount: string }
type FeeRow = { id: string; userId: string; period: string; currency: string; amount: string; status: string
                reason?: string; attempts: number; chargedAt?: string }
type FeeSummary = { status: string; reason?: string; currency: string; count: number; amount: string }
type Settings = Record<string, Record<string, number | boolean>>

const PRODUCTS = [
  "account_monthly", "cash_out", "p2p", "cross_border", "merchant_payment", "payment_link", "funding", "withdrawal",
  "payout", "card_issuance", "card_maintenance", "card_foreign_transaction", "card_atm_withdrawal",
  "contribution_payout", "trade_escrow",
]

const LABELS: Record<string, string> = {
  enabled: "Monthly fee switched on", free_months: "Free months for new customers",
  waive_inactive: "Waive months with no activity", min_kyc_level: "Charge only from KYC level",
  last_retry_day: "Waive unpaid fees after day", charge_day: "First charge day of the month",
  cash_in_commission_bps: "Agent cash-in commission (basis points, 100 = 1%)",
  cash_out_agent_share_pct: "Agent share of the cash-out fee (%)", code_ttl_minutes: "Cash-out code valid for (minutes)",
  max_code_attempts: "Wrong codes before an agent is locked out",
  min_spread_bps: "Minimum FX spread on every swap (basis points, 50 = 0.5%)",
  max_rate_age_hours: "Pause swaps when a rate is older than (hours)",
  reverse_window_hours: "Cap converting back at the rate paid within (hours)",
  max_swaps_per_day: "Currency swaps per customer per day",
}

export default function RevenuePage() {
  const [days, setDays] = useState(30)
  const report = useApi<{ since: string; streams: Stream[] }>(["revenue", days], "/admin/revenue", { days })
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [feeStatus, setFeeStatus] = useState("")
  const fees = useApi<{ period: string; summary: FeeSummary[]; items: FeeRow[] }>(
    ["account-fees", period, feeStatus], "/admin/account-fees", { period, ...(feeStatus ? { status: feeStatus } : {}) })

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const s of report.data?.streams ?? []) t[s.currency] = (t[s.currency] ?? 0) + Number(s.amount)
    return Object.entries(t)
  }, [report.data])
  const feeCount = (s: string) => (fees.data?.summary ?? []).filter((x) => x.status === s).reduce((n, x) => n + x.count, 0)

  return (
    <Page
      title="Revenue & pricing"
      subtitle="What BukkaPay earned, from the ledger. Prices themselves are fee rules (Fees & Limits); this page sets the policy around them and runs what-if checks."
    >
      <Section title="Net revenue" actions={
        <div className="flex gap-2">
          {[7, 30, 90, 365].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>{d} days</Button>
          ))}
        </div>
      }>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {totals.length ? totals.map(([ccy, amt]) => <Stat key={ccy} label={`Total ${ccy}`} value={money(amt, ccy)} tone={amt >= 0 ? "good" : "bad"} />)
            : <Stat label="Total" value="—" />}
        </div>
        <DataTable
          rows={report.data?.streams} loading={report.isLoading} error={report.error}
          rowKey={(s) => `${s.stream}-${s.currency}`} empty="No revenue booked in this period."
          columns={[
            { header: "Stream", cell: (s) => s.stream },
            { header: "Currency", cell: (s) => s.currency },
            { header: "Amount", className: "text-right", cell: (s) => (
              <span className={`tabular-nums font-medium ${Number(s.amount) < 0 ? "text-destructive" : ""}`}>{money(s.amount, s.currency)}</span>
            ) },
          ]}
        />
      </Section>

      <Section title="Monthly account fees" actions={
        <div className="flex gap-2 items-center">
          <Input type="month" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={feeStatus} onChange={(e) => setFeeStatus(e.target.value)}>
            <option value="">All</option><option value="charged">Charged</option><option value="due">Due (retrying)</option><option value="waived">Waived</option>
          </select>
        </div>
      }>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Charged" value={feeCount("charged")} tone="good" />
          <Stat label="Due (retrying daily)" value={feeCount("due")} tone="warn" />
          <Stat label="Waived" value={feeCount("waived")} />
        </div>
        <DataTable
          rows={fees.data?.summary} loading={fees.isLoading} error={fees.error}
          rowKey={(s) => `${s.status}-${s.reason}-${s.currency}`} empty="No fee decisions for this month yet."
          columns={[
            { header: "Outcome", cell: (s) => <StatusBadge value={s.status} /> },
            { header: "Reason", cell: (s) => s.reason?.replace(/_/g, " ") ?? "—" },
            { header: "Customers", cell: (s) => s.count },
            { header: "Amount", className: "text-right", cell: (s) => money(s.amount, s.currency) },
          ]}
        />
        <DataTable
          rows={fees.data?.items} rowKey={(r) => r.id} empty="—"
          columns={[
            { header: "Customer", cell: (r) => <span className="font-mono text-xs">{r.userId}</span> },
            { header: "Amount", cell: (r) => money(r.amount, r.currency) },
            { header: "Outcome", cell: (r) => <StatusBadge value={r.status} /> },
            { header: "Reason", cell: (r) => r.reason?.replace(/_/g, " ") ?? "—" },
            { header: "Attempts", cell: (r) => r.attempts },
          ]}
        />
      </Section>

      <PricingSettings />
      <Simulator />
    </Page>
  )
}

function PricingSettings() {
  const { data, isLoading } = useApi<Settings>(["pricing-settings"], "/admin/pricing/settings")
  const action = useAction([["pricing-settings"]])
  const [draft, setDraft] = useState<Settings>({})
  const value = (group: string, k: string) => draft[group]?.[k] ?? data?.[group]?.[k]
  const set = (group: string, k: string, v: number | boolean) => setDraft((d) => ({ ...d, [group]: { ...d[group], [k]: v } }))

  return (
    <Section title="Pricing policy">
      {isLoading || !data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="grid md:grid-cols-2 gap-4">
          {Object.entries(data).map(([group, fields]) => (
            <div key={group} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <p className="font-semibold">{group === "account_fee" ? "Monthly account fee" : group === "agents" ? "Cash agents" : group}</p>
              {Object.keys(fields).map((k) => {
                const v = value(group, k)
                return (
                  <label key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span>{LABELS[k] ?? k}</span>
                    {typeof v === "boolean"
                      ? <input type="checkbox" className="h-4 w-4" checked={v} onChange={(e) => set(group, k, e.target.checked)} />
                      : <Input type="number" className="w-28" value={String(v ?? "")} onChange={(e) => set(group, k, Number(e.target.value))} />}
                  </label>
                )
              })}
              <Button size="sm" disabled={!draft[group] || action.isPending} onClick={async () => {
                await action.mutateAsync({ method: "patch", url: `/admin/pricing/settings/${group}`, body: draft[group], success: "Pricing policy saved" })
                setDraft((d) => { const { [group]: _, ...rest } = d; return rest })
              }}><Save className="w-4 h-4 mr-2" />Save</Button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">The monthly fee amount is the <b>account_monthly</b> fee rule per country/currency/account type, and the cash-out fee is the <b>cash_out</b> rule (Fees & Limits). No rule means no charge.</p>
    </Section>
  )
}

function Simulator() {
  const [form, setForm] = useState({ product: "cash_out", amount: "100", currency: "ZAR", country: "ZA", customerType: "" })
  const [result, setResult] = useState<{ fee: string; ruleId?: string | null; breakdown: Record<string, unknown> } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const run = async () => {
    setErr(null)
    try {
      const { data } = await api.post("/admin/pricing/simulate", { ...form, customerType: form.customerType || null })
      setResult(data)
    } catch (e) { setResult(null); setErr(errorMessage(e)) }
  }
  return (
    <Section title="Fee simulator">
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <label className="text-sm space-y-1 md:col-span-2"><span className="font-semibold">Product</span>
            <select className="w-full h-10 rounded-md border border-input bg-background px-2" value={form.product} onChange={(e) => set("product", e.target.value)}>
              {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm space-y-1"><span className="font-semibold">Amount</span><Input value={form.amount} onChange={(e) => set("amount", e.target.value)} /></label>
          <label className="text-sm space-y-1"><span className="font-semibold">Currency</span><Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></label>
          <label className="text-sm space-y-1"><span className="font-semibold">Country</span><Input value={form.country} onChange={(e) => set("country", e.target.value.toUpperCase())} /></label>
          <label className="text-sm space-y-1"><span className="font-semibold">Account</span>
            <select className="w-full h-10 rounded-md border border-input bg-background px-2" value={form.customerType} onChange={(e) => set("customerType", e.target.value)}>
              <option value="">Any</option><option value="personal">Personal</option><option value="business">Business</option>
            </select>
          </label>
        </div>
        <Button onClick={run}><Calculator className="w-4 h-4 mr-2" />Calculate</Button>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {result && (
          <div className="text-sm">
            <p className="text-lg font-semibold">Fee: {money(result.fee, form.currency)}</p>
            <p className="text-muted-foreground">{result.ruleId ? `Rule ${result.ruleId}` : "No matching rule: no fee is charged."}</p>
          </div>
        )}
      </div>
    </Section>
  )
}
