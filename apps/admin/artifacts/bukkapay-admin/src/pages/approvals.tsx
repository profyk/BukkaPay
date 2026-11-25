import { useState } from "react"
import { Check, X, Scale, Search, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataTable, Page, StatusBadge, errorMessage, money, useAction, useApi, useRequestApproval, when } from "@/components/network/kit"
import { useAdminMe } from "@/lib/permissions"
import { api } from "@/lib/api"

type Approval = {
  id: string; action: string; payload: Record<string, any>; reason: string; status: string
  requestedBy?: string; decidedBy?: string; decisionNote?: string; result?: Record<string, any>
  createdAt: string; decidedAt?: string
}

export default function ApprovalsPage() {
  const [status, setStatus] = useState("pending")
  const { data, isLoading, error } = useApi<Approval[]>(["approvals"], "/admin/approvals", status === "all" ? undefined : { status })
  const decide = useAction([["approvals"]])
  const { data: me } = useAdminMe()
  const [adjusting, setAdjusting] = useState(false)

  return (
    <Page
      title="Approvals"
      subtitle="Maker-checker for high-risk actions. The requester can't approve their own request. Money adjustments are made by wallet ID only, always name where the money comes from, and need the owner above the limits."
      actions={<Button variant="outline" onClick={() => setAdjusting(true)}><Scale className="w-4 h-4 mr-2" />Request money adjustment</Button>}
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
          { header: "Details", cell: (a) => a.action === "ledger.adjustment" ? <AdjustmentSummary p={a.payload} />
            : <pre className="text-xs whitespace-pre-wrap max-w-xs">{JSON.stringify(a.payload, null, 1)}</pre> },
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
      {adjusting && <AdjustmentDialog onClose={() => setAdjusting(false)} />}
    </Page>
  )
}

function AdjustmentSummary({ p }: { p: Record<string, any> }) {
  const c = p.controls ?? {}
  return (
    <div className="text-xs space-y-1 max-w-xs">
      <p className="font-semibold text-sm">{p.holder_name ?? "—"}</p>
      <p className="font-mono">{p.wallet_id} · {p.currency}</p>
      <p><span className="capitalize">{p.direction}</span> {c.amount ?? p.amount ? money(c.amount ?? p.amount, p.currency) : ""} · {String(p.source ?? "").replace(/_/g, " ")}</p>
      {p.evidence_reference && <p>Bank ref: <span className="font-mono">{p.evidence_reference}</span></p>}
      {p.journal_reference && <p>Reverses: <span className="font-mono">{p.journal_reference}</span></p>}
      {c.company_cost_usd && Number(c.company_cost_usd) > 0 && <p>Company cost ≈ USD {c.company_cost_usd}</p>}
      {c.requires_owner && (
        <p className="text-amber-700 flex gap-1"><ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />Owner sign-off: {(c.why ?? []).join("; ")}</p>
      )}
    </div>
  )
}

type Lookup = { walletId: string; name: string; country?: string; frozen: boolean; kycLevel: number
                wallets: { currency: string; balance: string }[]; sources: Record<string, string> }

const DIRECTIONS: Record<string, string[]> = {
  bank_deposit: ["credit"], goodwill: ["credit"], reversal: ["credit", "debit"], recovery: ["debit"],
}

function AdjustmentDialog({ onClose }: { onClose: () => void }) {
  const requestApproval = useRequestApproval([["approvals"]])
  const [walletId, setWalletId] = useState("")
  const [found, setFound] = useState<Lookup | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [f, setF] = useState({ currency: "", source: "", direction: "", amount: "", evidence: "", journal: "", reason: "", confirm: "" })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const [busy, setBusy] = useState(false)

  const lookup = async () => {
    setFound(null); setLookupError(null)
    try {
      const { data } = await api.get("/admin/wallet-lookup", { params: { walletId: walletId.trim() } })
      setFound(data); set("currency", data.wallets[0]?.currency ?? "")
    } catch (e) { setLookupError(errorMessage(e)) }
  }
  const directions = DIRECTIONS[f.source] ?? []
  const ready = found && f.currency && f.source && directions.includes(f.direction) && f.reason.trim().length >= 5
    && (f.source === "reversal" ? f.journal.trim() : Number(f.amount) > 0)
    && (f.source !== "bank_deposit" || f.evidence.trim().length >= 4)
    && f.confirm.trim().toUpperCase() === found.walletId.toUpperCase()

  const submit = async () => {
    if (!found) return
    setBusy(true)
    try {
      await requestApproval("ledger.adjustment", {
        wallet_id: found.walletId, currency: f.currency, source: f.source, direction: f.direction,
        ...(f.source === "reversal" ? { journal_reference: f.journal.trim() } : { amount: f.amount }),
        ...(f.source === "bank_deposit" ? { evidence_reference: f.evidence.trim() } : {}),
        reason: f.reason,
      }, f.reason)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request a money adjustment</DialogTitle>
          <DialogDescription>
            By the customer's wallet ID number only. Balances are never edited: an approved adjustment posts one balanced entry
            from the source you choose. Another admin must approve it, and the owner above the limits.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-semibold">Customer's wallet ID number *</span>
            <div className="flex gap-2">
              <Input value={walletId} onChange={(e) => { setWalletId(e.target.value); setFound(null) }} placeholder="From the customer's profile" />
              <Button variant="outline" onClick={lookup} disabled={walletId.trim().length < 3}><Search className="w-4 h-4 mr-1" />Look up</Button>
            </div>
            {lookupError && <span className="text-xs text-destructive">{lookupError}</span>}
          </label>
          {found && (
            <>
              <div className="rounded-xl border border-border p-3 text-sm">
                <p className="font-semibold">{found.name}</p>
                <p className="text-xs text-muted-foreground">{found.walletId} · {found.country ?? "—"} · KYC {found.kycLevel}{found.frozen ? " · FROZEN" : ""}</p>
                <p className="text-xs mt-1">{found.wallets.map((w) => money(w.balance, w.currency)).join(" · ") || "No wallets"}</p>
              </div>
              <Select label="Wallet currency *" value={f.currency} onChange={(v) => set("currency", v)}
                options={found.wallets.map((w) => [w.currency, w.currency])} />
              <Select label="Where the money comes from *" value={f.source} onChange={(v) => { set("source", v); set("direction", (DIRECTIONS[v] ?? [])[0] ?? "") }}
                options={Object.entries(found.sources)} />
              {directions.length > 1 && (
                <Select label="Direction *" value={f.direction} onChange={(v) => set("direction", v)}
                  options={directions.map((d) => [d, d === "credit" ? "Credit (add to wallet)" : "Debit (take from wallet)"])} />
              )}
              {f.source === "reversal"
                ? <Text label="Journal reference of the transaction to reverse *" value={f.journal} onChange={(v) => set("journal", v)} />
                : f.source && <Text label={`Amount (${f.currency}) *`} value={f.amount} onChange={(v) => set("amount", v)} />}
              {f.source === "bank_deposit" && <Text label="Bank statement reference *" value={f.evidence} onChange={(v) => set("evidence", v)} />}
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Reason and evidence *</span>
                <textarea className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.reason} onChange={(e) => set("reason", e.target.value)} />
              </label>
              <Text label="Type the wallet ID again to confirm *" value={f.confirm} onChange={(v) => set("confirm", v)} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready || busy} onClick={submit}>Request approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
