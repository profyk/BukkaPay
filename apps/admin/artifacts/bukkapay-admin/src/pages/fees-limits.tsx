import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bool, DataTable, FormDialog, Page, Section, money, useAction, useApi, when } from "@/components/network/kit"

type Fee = {
  id: string; product: string; countryCode?: string; currency?: string; method?: string; merchantCategory?: string
  percentage: string; fixed: string; cap?: string; minAmount?: string; maxAmount?: string; priority: number
  active: boolean; effectiveFrom?: string; effectiveTo?: string; createdAt: string
}
type Limit = {
  id: string; product: string; countryCode?: string; currency?: string; kycLevel: number
  perTransactionMin?: string; perTransactionMax?: string; dailyMax?: string; monthlyMax?: string; active: boolean
}

const PRODUCTS = ["p2p", "cross_border", "merchant_payment", "payment_link", "funding", "withdrawal",
  "card_issuance", "card_maintenance", "contribution_payout"]
const scope = (r: { countryCode?: string; currency?: string }) =>
  [r.countryCode, r.currency].filter(Boolean).join(" · ") || "All"

export default function FeesLimitsPage() {
  const fees = useApi<Fee[]>(["fees"], "/admin/network/fees")
  const limits = useApi<Limit[]>(["limits"], "/admin/network/limits")
  const action = useAction([["fees"], ["limits"]])
  const [newFee, setNewFee] = useState(false)
  const [newLimit, setNewLimit] = useState(false)

  return (
    <Page
      title="Fees & limits"
      subtitle="Fee rules are versioned: to change a fee, add a new rule and retire the old one. The exact rule and amount are stored on every transaction, so history never changes. The most specific active rule wins."
    >
      <Section title="Fee rules" actions={<Button size="sm" onClick={() => setNewFee(true)}><Plus className="w-4 h-4 mr-1" />New rule</Button>}>
        <DataTable
          rows={fees.data} loading={fees.isLoading} error={fees.error} rowKey={(f) => f.id}
          columns={[
            { header: "Product", cell: (f) => <span className="font-medium">{f.product.replace(/_/g, " ")}</span> },
            { header: "Scope", cell: (f) => scope(f) + (f.method ? ` · ${f.method}` : "") },
            { header: "Fee", cell: (f) => `${Number(f.percentage)}% + ${money(f.fixed)}${f.cap ? ` (cap ${money(f.cap)})` : ""}` },
            { header: "Applies to", cell: (f) => f.minAmount || f.maxAmount ? `${money(f.minAmount ?? 0)} – ${f.maxAmount ? money(f.maxAmount) : "∞"}` : "Any amount" },
            { header: "Priority", cell: (f) => f.priority },
            { header: "Active", cell: (f) => <Bool value={f.active} /> },
            { header: "Effective", cell: (f) => `${when(f.effectiveFrom ?? f.createdAt)}${f.effectiveTo ? ` → ${when(f.effectiveTo)}` : ""}` },
            { header: "", className: "text-right", cell: (f) => f.active
                ? <Button size="sm" variant="outline" onClick={() => action.mutate({ url: `/admin/network/fees/${f.id}/retire`, success: "Rule retired" })}>Retire</Button>
                : null },
          ]}
        />
      </Section>
      <Section title="Transaction limits (by KYC level)" actions={<Button size="sm" onClick={() => setNewLimit(true)}><Plus className="w-4 h-4 mr-1" />New limit</Button>}>
        <DataTable
          rows={limits.data} loading={limits.isLoading} error={limits.error} rowKey={(l) => l.id}
          columns={[
            { header: "Product", cell: (l) => l.product.replace(/_/g, " ") },
            { header: "Scope", cell: scope },
            { header: "KYC level", cell: (l) => l.kycLevel },
            { header: "Per transaction", cell: (l) => l.perTransactionMax === "0.00" ? <span className="text-destructive">Not allowed</span> : `${money(l.perTransactionMin ?? 0)} – ${l.perTransactionMax ? money(l.perTransactionMax) : "∞"}` },
            { header: "Daily", cell: (l) => l.dailyMax && l.dailyMax !== "0.00" ? money(l.dailyMax) : "—" },
            { header: "30 days", cell: (l) => l.monthlyMax && l.monthlyMax !== "0.00" ? money(l.monthlyMax) : "—" },
            { header: "Active", cell: (l) => <Bool value={l.active} /> },
            { header: "", className: "text-right", cell: (l) => l.active
                ? <Button size="sm" variant="outline" onClick={() => action.mutate({ url: `/admin/network/limits/${l.id}/retire`, success: "Limit retired" })}>Retire</Button>
                : null },
          ]}
        />
      </Section>
      <FormDialog
        open={newFee} onOpenChange={setNewFee} title="New fee rule"
        fields={[
          { name: "product", label: "Product", type: "select", required: true, options: PRODUCTS.map((p) => ({ value: p, label: p })) },
          { name: "countryCode", label: "Country (blank = all)" },
          { name: "currency", label: "Currency (blank = all)", help: "Fixed amounts should be scoped to a currency." },
          { name: "method", label: "Payment method (blank = all)" },
          { name: "percentage", label: "Percentage", type: "number", required: true },
          { name: "fixed", label: "Fixed amount", type: "number", required: true },
          { name: "cap", label: "Cap", type: "number" },
          { name: "minAmount", label: "Applies from amount", type: "number" },
          { name: "maxAmount", label: "Applies up to amount", type: "number" },
          { name: "priority", label: "Priority", type: "number" },
        ]}
        onSubmit={(v) => action.mutateAsync({
          url: "/admin/network/fees", success: "Fee rule added",
          body: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined)),
        })}
      />
      <FormDialog
        open={newLimit} onOpenChange={setNewLimit} title="New limit"
        fields={[
          { name: "product", label: "Product", type: "select", required: true, options: ["p2p", "cross_border", "withdrawal", "funding"].map((p) => ({ value: p, label: p })) },
          { name: "countryCode", label: "Country" },
          { name: "currency", label: "Currency" },
          { name: "kycLevel", label: "KYC level (0, 1, 2)", type: "number", required: true },
          { name: "perTransactionMin", label: "Min per transaction", type: "number" },
          { name: "perTransactionMax", label: "Max per transaction (0 = not allowed)", type: "number" },
          { name: "dailyMax", label: "Daily max", type: "number" },
          { name: "monthlyMax", label: "30-day max", type: "number" },
        ]}
        onSubmit={(v) => action.mutateAsync({
          url: "/admin/network/limits", success: "Limit added",
          body: { ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== undefined)), kycLevel: Number(v.kycLevel) },
        })}
      />
    </Page>
  )
}
