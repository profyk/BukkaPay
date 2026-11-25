import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  DataTable, FormDialog, Page, Stat, StatusBadge, money, useAction, useApi, when,
} from "@/components/network/kit"

type Agent = {
  id: string; merchantId: string; status: string; displayName: string; address: string; city?: string
  country: string; currency: string; phone?: string; openingHours?: string; dailyLimit: string
  approvedAt?: string; createdAt: string
}

type AgentTx = {
  id: string; reference: string; kind: string; status: string; currency: string; amount: string; fee: string
  commission: string; createdAt: string; completedAt?: string
}

export default function AgentsPage() {
  const [status, setStatus] = useState<string>("")
  const { data, isLoading, error } = useApi<Agent[]>(["agents", status], "/admin/agents", status ? { status } : undefined)
  const all = useApi<Agent[]>(["agents", "all"], "/admin/agents")
  const action = useAction([["agents"]])
  const [limitFor, setLimitFor] = useState<Agent | null>(null)
  const [txFor, setTxFor] = useState<Agent | null>(null)
  const count = (s: string) => (all.data ?? []).filter((a) => a.status === s).length
  const setAgentStatus = (a: Agent, s: string, label: string) =>
    action.mutate({ method: "patch", url: `/admin/agents/${a.id}`, body: { status: s }, success: label })

  return (
    <Page
      title="Cash agents"
      subtitle="Verified businesses where customers deposit cash (cash-in from the agent's float) and collect cash with a one-time code (cash-out). Only KYB-approved businesses can be activated."
    >
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Waiting for approval" value={count("pending")} tone="warn" />
        <Stat label="Active" value={count("active")} tone="good" />
        <Stat label="Suspended" value={count("suspended")} tone="bad" />
      </div>
      <div className="flex gap-2">
        {[["", "All"], ["pending", "Pending"], ["active", "Active"], ["suspended", "Suspended"]].map(([v, l]) => (
          <Button key={v} size="sm" variant={status === v ? "default" : "outline"} onClick={() => setStatus(v)}>{l}</Button>
        ))}
      </div>
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(a) => a.id} empty="No agents yet. Businesses apply from their merchant dashboard."
        columns={[
          { header: "Agent", cell: (a) => <div><p className="font-semibold">{a.displayName}</p><p className="text-xs text-muted-foreground">{a.address}{a.city ? `, ${a.city}` : ""}</p></div> },
          { header: "Country", cell: (a) => `${a.country} · ${a.currency}` },
          { header: "Contact", cell: (a) => <div className="text-xs"><p>{a.phone ?? "—"}</p><p className="text-muted-foreground">{a.openingHours ?? ""}</p></div> },
          { header: "Daily limit", cell: (a) => money(a.dailyLimit, a.currency) },
          { header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
          { header: "Applied", cell: (a) => when(a.createdAt) },
          { header: "", className: "text-right whitespace-nowrap", cell: (a) => (
            <div className="flex gap-2 justify-end">
              {a.status !== "active" && <Button size="sm" onClick={() => setAgentStatus(a, "active", "Agent activated")}>Approve</Button>}
              {a.status === "active" && <Button size="sm" variant="outline" onClick={() => setAgentStatus(a, "suspended", "Agent suspended")}>Suspend</Button>}
              <Button size="sm" variant="outline" onClick={() => setLimitFor(a)}>Limit</Button>
              <Button size="sm" variant="outline" onClick={() => setTxFor(a)}>Transactions</Button>
            </div>
          ) },
        ]}
      />
      <FormDialog
        open={!!limitFor} onOpenChange={(o) => !o && setLimitFor(null)} title={`Daily limit — ${limitFor?.displayName ?? ""}`}
        description="Total cash-in plus cash-out this agent can handle in 24 hours."
        initial={{ dailyLimit: limitFor?.dailyLimit }}
        fields={[{ name: "dailyLimit", label: `Limit (${limitFor?.currency ?? ""})`, required: true }]}
        onSubmit={(v) => action.mutateAsync({ method: "patch", url: `/admin/agents/${limitFor!.id}`, body: { dailyLimit: String(v.dailyLimit) }, success: "Limit updated" })}
      />
      {txFor && <AgentTransactions agent={txFor} onClose={() => setTxFor(null)} />}
    </Page>
  )
}

function AgentTransactions({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { data, isLoading, error } = useApi<AgentTx[]>(["agent-tx", agent.id], `/admin/agents/${agent.id}/transactions`)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent.displayName}: transactions</DialogTitle>
          <DialogDescription>Cash-ins pay the agent a commission; cash-outs give the agent a share of the customer's fee.</DialogDescription>
        </DialogHeader>
        <DataTable
          rows={data} loading={isLoading} error={error} rowKey={(t) => t.id} empty="No transactions yet."
          columns={[
            { header: "Reference", cell: (t) => <span className="font-mono text-xs">{t.reference}</span> },
            { header: "Type", cell: (t) => t.kind === "cash_in" ? "Cash in" : "Cash out" },
            { header: "Amount", cell: (t) => money(t.amount, t.currency) },
            { header: "Customer fee", cell: (t) => money(t.fee, t.currency) },
            { header: "Agent earned", cell: (t) => money(t.commission, t.currency) },
            { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
            { header: "When", cell: (t) => when(t.completedAt ?? t.createdAt) },
          ]}
        />
      </DialogContent>
    </Dialog>
  )
}
