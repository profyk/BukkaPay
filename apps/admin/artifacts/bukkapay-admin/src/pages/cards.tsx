import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, FormDialog, Page, Stat, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Card = {
  id: string; userId: string; userName: string | null; userEmail: string | null; issuer: string; network: string
  status: string; frozenReason: string | null; currency: string; last4: string | null; expMonth: number | null
  expYear: number | null; overdraftOutstanding: string; createdAt: string
}
type Auth = {
  id: string; status: string; amount: string; fee: string; held: string; captured: string; currency: string
  merchantName: string | null; merchantMcc: string | null; merchantCountry: string | null; channel: string
  declineReason: string | null; createdAt: string
}

const STATUSES = ["", "active", "frozen", "pending_kyc", "cancelled", "failed"]

/** Visa cards issued on customer wallets. PAN/CVV are never stored by
 *  BukkaPay, so they can't be shown here. Admin freezes can't be undone by
 *  the customer. Every action is audited. */
export default function CardsPage() {
  const [status, setStatus] = useState("")
  const [q, setQ] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Card | null>(null)
  const [acting, setActing] = useState<{ card: Card; kind: "freeze" | "unfreeze" | "cancel" } | null>(null)
  const perms = usePermissions()
  const list = useApi<{ total: number; counts: Record<string, number>; cards: Card[] }>(["admin-cards", status, search], "/admin/cards", { status: status || undefined, q: search || undefined })
  const action = useAction([["admin-cards"]])
  const counts = list.data?.counts ?? {}

  return (
    <Page title="Visa cards" subtitle="One virtual Visa card per wallet, issued once the customer's ID is verified. Authorizations are approved in real time against the wallet balance.">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Active" value={counts.active ?? 0} tone="good" />
        <Stat label="Frozen" value={counts.frozen ?? 0} tone={counts.frozen ? "warn" : undefined} />
        <Stat label="Waiting for KYC" value={counts.pending_kyc ?? 0} />
        <Stat label="Cancelled" value={counts.cancelled ?? 0} />
        <Stat label="Failed" value={counts.failed ?? 0} tone={counts.failed ? "bad" : undefined} />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {STATUSES.map((s) => (
          <Button key={s || "all"} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s ? s.replace(/_/g, " ") : "all"}</Button>
        ))}
        <form className="flex gap-2 ml-auto" onSubmit={(e) => { e.preventDefault(); setSearch(q) }}>
          <Input placeholder="Email, name or last 4" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Button size="sm" type="submit">Search</Button>
        </form>
      </div>
      <DataTable
        rows={list.data?.cards} loading={list.isLoading} error={list.error} rowKey={(c) => c.id} empty="No cards."
        columns={[
          { header: "Customer", cell: (c) => <div><p className="font-semibold">{c.userName ?? "—"}</p><p className="text-xs text-muted-foreground">{c.userEmail}</p></div> },
          { header: "Card", cell: (c) => <span className="font-mono">{c.network.toUpperCase()} •••• {c.last4 ?? "····"}{c.expMonth ? ` · ${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}` : ""}</span> },
          { header: "Currency", cell: (c) => c.currency },
          { header: "Status", cell: (c) => <div><StatusBadge value={c.status} />{c.frozenReason && <p className="text-xs text-muted-foreground mt-0.5">by {c.frozenReason}</p>}</div> },
          { header: "Overdraft", cell: (c) => Number(c.overdraftOutstanding) > 0 ? <span className="text-destructive font-semibold">{money(c.overdraftOutstanding, c.currency)}</span> : "—" },
          { header: "Issued", cell: (c) => when(c.createdAt) },
          {
            header: "", className: "text-right whitespace-nowrap", cell: (c) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(c)}>Activity</Button>
                {perms.can("wallets.restrict") && c.status === "active" && <Button size="sm" variant="outline" onClick={() => setActing({ card: c, kind: "freeze" })}>Freeze</Button>}
                {perms.can("wallets.restrict") && c.status === "frozen" && <Button size="sm" variant="outline" onClick={() => setActing({ card: c, kind: "unfreeze" })}>Unfreeze</Button>}
                {perms.can("wallets.restrict") && (c.status === "active" || c.status === "frozen") && <Button size="sm" variant="outline" onClick={() => setActing({ card: c, kind: "cancel" })}>Cancel</Button>}
              </div>
            ),
          },
        ]}
      />

      {selected && <CardActivity card={selected} onClose={() => setSelected(null)} />}

      <FormDialog
        open={!!acting} onOpenChange={(o) => !o && setActing(null)}
        title={acting ? `${acting.kind[0].toUpperCase() + acting.kind.slice(1)} card •••• ${acting.card.last4}` : ""}
        description={acting?.kind === "cancel" ? "The card number stops working permanently. The customer can get a new card from the app." : undefined}
        fields={[{ name: "reason", label: "Reason (kept in the audit log)", type: "textarea", required: true }]}
        submitLabel={acting?.kind === "cancel" ? "Cancel card" : "Confirm"}
        onSubmit={(v) => action.mutateAsync({ url: `/admin/cards/${acting!.card.id}/${acting!.kind}`, body: { reason: v.reason }, success: "Card updated" })}
      />
    </Page>
  )
}

function CardActivity({ card, onClose }: { card: Card; onClose: () => void }) {
  const auths = useApi<Auth[]>(["admin-card-auths", card.id], `/admin/cards/${card.id}/authorizations`)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Authorizations · {card.userName} •••• {card.last4}</p>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <DataTable
        rows={auths.data} loading={auths.isLoading} error={auths.error} rowKey={(a) => a.id} empty="No card activity."
        columns={[
          { header: "When", cell: (a) => when(a.createdAt) },
          { header: "Merchant", cell: (a) => <div><p>{a.merchantName ?? "—"}</p><p className="text-xs text-muted-foreground">MCC {a.merchantMcc ?? "—"} · {a.merchantCountry ?? "—"} · {a.channel.replace(/_/g, " ")}</p></div> },
          { header: "Amount", cell: (a) => money(a.amount, a.currency) },
          { header: "Fee", cell: (a) => money(a.fee, a.currency) },
          { header: "Held", cell: (a) => money(a.held, a.currency) },
          { header: "Captured", cell: (a) => money(a.captured, a.currency) },
          { header: "Status", cell: (a) => <div><StatusBadge value={a.status} />{a.declineReason && <p className="text-xs text-muted-foreground">{a.declineReason.replace(/_/g, " ")}</p>}</div> },
        ]}
      />
    </div>
  )
}
