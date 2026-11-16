import { useState } from "react"
import { Check, X, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, StatusBadge, useAction, useApi, useRequestApproval, when } from "@/components/network/kit"
import { useAdminMe } from "@/lib/permissions"

type Approval = {
  id: string; action: string; payload: Record<string, any>; reason: string; status: string
  requestedBy?: string; decidedBy?: string; decisionNote?: string; result?: Record<string, any>
  createdAt: string; decidedAt?: string
}

export default function ApprovalsPage() {
  const [status, setStatus] = useState("pending")
  const { data, isLoading, error } = useApi<Approval[]>(["approvals"], "/admin/approvals", status === "all" ? undefined : { status })
  const decide = useAction([["approvals"]])
  const requestApproval = useRequestApproval()
  const { data: me } = useAdminMe()
  const [adjusting, setAdjusting] = useState(false)

  return (
    <Page
      title="Approvals"
      subtitle="Maker-checker for high-risk actions: country, corridor, custodian and provider activation, enabling currencies, ledger adjustments, unblocking and unfreezing. The requester can't approve their own request."
      actions={<Button variant="outline" onClick={() => setAdjusting(true)}><Scale className="w-4 h-4 mr-2" />Request ledger adjustment</Button>}
    >
      <div className="flex gap-2">
        {["pending", "executed", "failed", "rejected", "all"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>
        ))}
      </div>
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(a) => a.id} empty="No requests."
        columns={[
          { header: "Requested", cell: (a) => when(a.createdAt) },
          { header: "Action", cell: (a) => <span className="font-mono text-xs">{a.action}</span> },
          { header: "Details", cell: (a) => <pre className="text-xs whitespace-pre-wrap max-w-xs">{JSON.stringify(a.payload, null, 1)}</pre> },
          { header: "Reason", cell: (a) => <p className="max-w-xs">{a.reason}</p> },
          { header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
          { header: "Result", cell: (a) => a.result ? <pre className="text-xs whitespace-pre-wrap max-w-xs">{JSON.stringify(a.result, null, 1)}</pre> : "—" },
          {
            header: "", className: "text-right whitespace-nowrap", cell: (a) => a.status !== "pending" ? null
              : a.requestedBy && a.requestedBy === me?.id
                ? <span className="text-xs text-muted-foreground">Awaiting another admin</span>
                : (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => decide.mutate({ url: `/admin/approvals/${a.id}/decide`, body: { approve: true }, success: "Approved" })}>
                      <Check className="w-4 h-4 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ url: `/admin/approvals/${a.id}/decide`, body: { approve: false }, success: "Rejected" })}>
                      <X className="w-4 h-4 mr-1" />Reject
                    </Button>
                  </div>
                ),
          },
        ]}
      />
      <FormDialog
        open={adjusting} onOpenChange={setAdjusting} title="Request a ledger adjustment"
        description="Balances are never edited. An approved adjustment posts a balanced journal against the adjustments account, with your reason and evidence on record."
        fields={[
          { name: "target", label: "Target", type: "select", required: true, options: [{ value: "wallet", label: "Customer wallet" }, { value: "merchant", label: "Merchant" }] },
          { name: "id", label: "Wallet ID / Merchant ID (UUID)", required: true },
          { name: "direction", label: "Direction", type: "select", required: true, options: [{ value: "credit", label: "Credit (add)" }, { value: "debit", label: "Debit (remove)" }] },
          { name: "amount", label: "Amount", type: "number", required: true },
          { name: "reason", label: "Reason & evidence reference", type: "textarea", required: true },
        ]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("ledger.adjustment", {
          [v.target === "merchant" ? "merchant_id" : "wallet_card_id"]: v.id, direction: v.direction,
          amount: String(v.amount), reason: v.reason,
        }, v.reason)}
      />
    </Page>
  )
}
