import { useState } from "react"
import { Input } from "@/components/ui/input"
import { DataTable, Page, Section, money, useApi, when } from "@/components/network/kit"

type Summary = { family: string; currency: string; balance: string; accounts: number }
type Line = { lineNo: number; accountCode: string; currency: string; debit: string; credit: string }
type Entry = { id: string; reference: string; kind: string; description: string; postedAt: string; lines: Line[] }

const FAMILY_LABELS: Record<string, string> = {
  wallet: "Customer wallets (owed to customers)", merchant: "Merchant payables", campaign: "Contribution escrow",
  revenue: "Fee revenue", escrow: "Claim-link escrow", payouts: "Payouts pending", clearing: "Provider clearing",
  transit: "Cross-border in transit", fx: "FX positions", suspense: "Pre-ledger opening balances (to reconcile)",
  adjustments: "Approved adjustments", payable: "Owed to partners",
}

export default function LedgerPage() {
  const summary = useApi<Summary[]>(["ledger-summary"], "/admin/ledger/summary")
  const [reference, setReference] = useState("")
  const entries = useApi<Entry[]>(["ledger-entries"], "/admin/ledger/entries", reference ? { reference } : { limit: 50 })

  return (
    <Page
      title="Ledger"
      subtitle="The double-entry record behind every balance. Each journal balances within each currency, posted entries are immutable (corrections are reversals), and balances can only change through postings. Currencies are never added together."
    >
      <Section title="Balances by account family">
        <DataTable
          rows={summary.data} loading={summary.isLoading} error={summary.error} rowKey={(s) => `${s.family}-${s.currency}`}
          columns={[
            { header: "Family", cell: (s) => <div><p className="font-semibold">{s.family}</p><p className="text-xs text-muted-foreground">{FAMILY_LABELS[s.family] ?? ""}</p></div> },
            { header: "Currency", cell: (s) => s.currency },
            { header: "Balance", className: "text-right tabular-nums", cell: (s) => money(s.balance, s.currency) },
            { header: "Accounts", className: "text-right", cell: (s) => s.accounts },
          ]}
        />
      </Section>
      <Section title="Journal" actions={
        <Input className="w-64" placeholder="Find by reference (JRN-…)" value={reference} onChange={(e) => setReference(e.target.value.trim())} />
      }>
        <DataTable
          rows={entries.data} loading={entries.isLoading} error={entries.error} rowKey={(e) => e.id}
          columns={[
            { header: "Posted", cell: (e) => when(e.postedAt) },
            { header: "Reference", cell: (e) => <span className="font-mono text-xs">{e.reference}</span> },
            { header: "Kind", cell: (e) => e.kind.replace(/_/g, " ") },
            { header: "Description", cell: (e) => <p className="max-w-xs">{e.description}</p> },
            {
              header: "Lines", cell: (e) => (
                <table className="text-xs">
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.lineNo}>
                        <td className="pr-3 font-mono">{l.accountCode}</td>
                        <td className="pr-3 tabular-nums text-right">{Number(l.debit) ? `Dr ${money(l.debit, l.currency)}` : ""}</td>
                        <td className="tabular-nums text-right">{Number(l.credit) ? `Cr ${money(l.credit, l.currency)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
            },
          ]}
        />
      </Section>
    </Page>
  )
}
