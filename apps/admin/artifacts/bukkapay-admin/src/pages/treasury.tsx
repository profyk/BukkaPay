import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, Page, Section, Stat, money, useApi, when } from "@/components/network/kit"

type Balance = { currency: string; balance: string }
type Account = { id: string; code: string; name: string; type: string; currency: string; balance: string }
type Line = { id: string; reference: string; kind: string; description: string; debit: string; credit: string; currency: string; createdAt: string }

const FAMILIES = [
  { prefix: "", label: "System accounts" },
  { prefix: "payable:", label: "Owed to partners" },
  { prefix: "revenue:", label: "Revenue" },
  { prefix: "clearing:", label: "Provider clearing" },
  { prefix: "payouts:", label: "Payouts pending" },
  { prefix: "escrow:", label: "Escrow" },
  { prefix: "merchant:", label: "Merchants" },
  { prefix: "wallet:", label: "Customer wallets" },
]

/** BukkaPay's own money: platform wallet balances and every ledger account. */
export default function TreasuryPage() {
  const wallet = useApi<{ balances: Balance[] }>(["platform-wallet"], "/admin/platform-wallet")
  const [prefix, setPrefix] = useState("")
  const [filter, setFilter] = useState("")
  const [open, setOpen] = useState<Account | null>(null)
  const accounts = useApi<Account[]>(["ledger-accounts", prefix], "/admin/ledger/accounts", prefix ? { prefix } : undefined)
  const lines = useApi<{ account: Account; lines: Line[] }>(["ledger-lines", open?.id], open ? `/admin/ledger/accounts/${open.id}/lines` : "/admin/ledger/summary")

  if (open) {
    return (
      <Page title={open.name || open.code} subtitle={`${open.code} · ${open.type} · ${open.currency}`}
        actions={<Button variant="outline" onClick={() => setOpen(null)}><ArrowLeft className="w-4 h-4 mr-2" />All accounts</Button>}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Balance" value={money(open.balance, open.currency)} />
          <Stat label="Type" value={<span className="capitalize">{open.type}</span>} />
          <Stat label="Lines shown" value={lines.data?.lines?.length ?? "…"} />
        </div>
        <Section title="Postings (newest first)">
          <DataTable
            rows={lines.data?.lines} loading={lines.isLoading} error={lines.error} rowKey={(l) => l.id}
            columns={[
              { header: "When", cell: (l) => when(l.createdAt) },
              { header: "Reference", cell: (l) => <span className="font-mono text-xs">{l.reference}</span> },
              { header: "Kind", cell: (l) => l.kind.replace(/_/g, " ") },
              { header: "Description", cell: (l) => <p className="max-w-sm">{l.description}</p> },
              { header: "Debit", className: "text-right tabular-nums", cell: (l) => Number(l.debit) ? money(l.debit, l.currency) : "" },
              { header: "Credit", className: "text-right tabular-nums", cell: (l) => Number(l.credit) ? money(l.credit, l.currency) : "" },
            ]}
          />
        </Section>
      </Page>
    )
  }

  const shown = (accounts.data ?? []).filter((a) => !filter || `${a.code} ${a.name}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Page title="Treasury" subtitle="BukkaPay's own balances and the ledger accounts behind them. Every figure comes from double-entry postings; currencies are never added together.">
      <Section title="Platform wallet">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {wallet.isLoading && <Stat label="Loading" value="…" />}
          {wallet.data?.balances?.length === 0 && <p className="text-sm text-muted-foreground">No platform balances yet.</p>}
          {wallet.data?.balances?.map((b) => <Stat key={b.currency} label={b.currency} value={money(b.balance, b.currency)} />)}
        </div>
      </Section>
      <Section title="Ledger accounts" actions={
        <div className="flex flex-wrap gap-2">
          {FAMILIES.map((f) => (
            <Button key={f.label} size="sm" variant={prefix === f.prefix ? "default" : "outline"} onClick={() => setPrefix(f.prefix)}>{f.label}</Button>
          ))}
          <Input className="w-52" placeholder="Filter by code or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
      }>
        <DataTable
          rows={shown} loading={accounts.isLoading} error={accounts.error} rowKey={(a) => a.id}
          columns={[
            { header: "Account", cell: (a) => <div><p className="font-semibold">{a.name}</p><p className="font-mono text-xs text-muted-foreground">{a.code}</p></div> },
            { header: "Type", cell: (a) => <span className="capitalize">{a.type}</span> },
            { header: "Balance", className: "text-right tabular-nums", cell: (a) => money(a.balance, a.currency) },
            { header: "", className: "text-right", cell: (a) => <Button size="sm" variant="ghost" onClick={() => setOpen(a)}>View postings</Button> },
          ]}
        />
      </Section>
    </Page>
  )
}
