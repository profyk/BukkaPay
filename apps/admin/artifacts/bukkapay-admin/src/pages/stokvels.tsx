import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataTable, Page, Section, Stat, StatusBadge, money, useApi, when } from "@/components/network/kit"

type Group = {
  id: string; title: string; description: string | null; category: string; targetAmount: string | null
  currentAmount: string; currency: string; shareCode: string; isActive: boolean; createdAt: string
}
type Resp = { stokvels: Group[]; pagination: { page: number; pages: number; total: number } }

/** Stokvels and contribution groups customers run on BukkaPay. */
export default function StokvelsPage() {
  const [page, setPage] = useState(1)
  const list = useApi<Resp>(["admin-stokvels", page], "/admin/stokvels", { page, limit: 50 })
  const rows = list.data?.stokvels ?? []
  const active = rows.filter((g) => g.isActive).length

  return (
    <Page title="Stokvels & contributions" subtitle="Savings groups and contribution campaigns. Money collected sits in escrow on the ledger until it's paid out to the organiser.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Groups" value={list.data?.pagination.total ?? "…"} />
        <Stat label="Active on this page" value={active} tone="good" />
        <Stat label="Page" value={`${list.data?.pagination.page ?? page} of ${Math.max(1, list.data?.pagination.pages ?? 1)}`} />
      </div>
      <Section title="Groups" actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={page >= (list.data?.pagination.pages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      }>
        <DataTable
          rows={rows} loading={list.isLoading} error={list.error} rowKey={(g) => g.id}
          columns={[
            { header: "Group", cell: (g) => <div><p className="font-semibold">{g.title}</p>{g.description && <p className="text-xs text-muted-foreground max-w-xs truncate">{g.description}</p>}</div> },
            { header: "Type", cell: (g) => <span className="capitalize">{g.category.replace(/_/g, " ")}</span> },
            {
              header: "Raised", className: "text-right tabular-nums", cell: (g) => (
                <div>
                  <p>{money(g.currentAmount, g.currency)}</p>
                  {g.targetAmount && <p className="text-xs text-muted-foreground">of {money(g.targetAmount, g.currency)} ({Math.min(100, Math.round(Number(g.currentAmount) / Number(g.targetAmount) * 100))}%)</p>}
                </div>
              ),
            },
            { header: "Share code", cell: (g) => <span className="font-mono text-xs">{g.shareCode}</span> },
            { header: "Status", cell: (g) => <StatusBadge value={g.isActive ? "active" : "closed"} /> },
            { header: "Created", cell: (g) => when(g.createdAt) },
          ]}
        />
      </Section>
    </Page>
  )
}
