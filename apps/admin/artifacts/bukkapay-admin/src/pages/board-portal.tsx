import { useState } from "react"
import { Copy, ExternalLink, FileText, LineChart, Plus, Send, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, Stat, StatusBadge, useAction, useApi, when } from "@/components/network/kit"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/api"

type Member = { id: string; email: string; name: string; organisation?: string; title?: string; status: string; lastLoginAt?: string; inviteExpiresAt?: string }
type Fin = Record<string, any> & { id: string; month: string; currency: string }
type Upd = { id: string; title: string; period?: string; body: string; publishedAt?: string; createdAt?: string }

const BOARD_URL = "https://board.bukkapay.com"
const TABS = [["members", "Board members", Users], ["accounts", "Management accounts", LineChart], ["updates", "Investor updates", FileText],
              ["access", "Access log", ExternalLink]] as const
const COSTS: [string, string][] = [["staffCosts", "Staff costs"], ["technologyCosts", "Technology"], ["marketingCosts", "Marketing"],
  ["complianceLegalCosts", "Compliance & legal"], ["officeAdminCosts", "Office & admin"], ["otherCosts", "Other costs"]]

/** Owner only (enforced by the API): who can see the board portal, the monthly
 *  numbers the ledger can't know, and the letters investors read. */
export default function BoardPortalPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("members")
  const members = useApi<{ members: Member[]; access: { member: string; action: string; ip?: string; at: string }[] }>(["board-members"], "/admin/board/members")
  const fins = useApi<Fin[]>(["board-fin"], "/admin/board/financials")
  const ups = useApi<Upd[]>(["board-updates"], "/admin/board/updates")
  const action = useAction([["board-members"], ["board-fin"], ["board-updates"]])
  const [invite, setInvite] = useState(false)
  const [link, setLink] = useState<{ link: string; emailSent: boolean } | null>(null)
  const [fin, setFin] = useState<Fin | "new" | null>(null)
  const [upd, setUpd] = useState<Upd | "new" | null>(null)
  const ms = members.data?.members ?? []
  const forbidden = (members.error as any)?.response?.status === 403

  const showLink = (r: any) => setLink({ link: r.data.link, emailSent: r.data.emailSent })
  // Signs the owner in to the board portal with a single-use, 60-second pass.
  const openPortal = async () => {
    const w = window.open("about:blank", "_blank")  // opened now so pop-up blockers allow it
    try {
      const { data } = await api.post("/admin/board/owner-pass")
      if (w) { w.opener = null; w.location.href = data.url } else window.location.href = data.url
    } catch (e: any) {
      w?.close()
      toast({ title: "Couldn't open the board portal", description: e?.response?.data?.error ?? "Try again.", variant: "destructive" })
    }
  }
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01"

  return (
    <Page title="Board & Investors"
      subtitle={`The board portal at ${BOARD_URL.replace("https://", "")} shows invited board members and investors the company's numbers: growth, revenue, profit and loss, cash and runway. Only you can invite people, and they only ever see company totals, never a customer.`}
      actions={<Button onClick={openPortal}><ExternalLink className="w-4 h-4 mr-1.5" />Open board portal</Button>}>
      {forbidden ? <p className="text-sm text-muted-foreground">Only the owner manages the board portal.</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Active board members" value={ms.filter((m) => m.status === "active").length} />
            <Stat label="Invitations waiting" value={ms.filter((m) => m.status === "invited").length} />
            <Stat label="Months of accounts entered" value={fins.data?.length ?? "…"} tone={(fins.data?.length ?? 0) === 0 ? "warn" : undefined} />
            <Stat label="Updates published" value={(ups.data ?? []).filter((u) => u.publishedAt).length} />
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map(([v, l, Icon]) => <Button key={v} size="sm" variant={tab === v ? "default" : "outline"} onClick={() => setTab(v)}><Icon className="w-4 h-4 mr-1.5" />{l}</Button>)}
            <div className="ml-auto flex gap-2">
              {tab === "members" && <Button size="sm" onClick={() => setInvite(true)}><UserPlus className="w-4 h-4 mr-1.5" />Invite</Button>}
              {tab === "accounts" && <Button size="sm" onClick={() => setFin("new")}><Plus className="w-4 h-4 mr-1.5" />Enter a month</Button>}
              {tab === "updates" && <Button size="sm" onClick={() => setUpd("new")}><Plus className="w-4 h-4 mr-1.5" />Write an update</Button>}
            </div>
          </div>

          {link && (
            <div className="rounded-xl border border-border bg-card p-3 text-sm flex flex-wrap items-center gap-2">
              <span>{link.emailSent ? "Invitation emailed. You can also share this link:" : "The email couldn't be sent. Share this link yourself (it works once, for 7 days):"}</span>
              <code className="px-2 py-1 rounded bg-muted break-all">{link.link}</code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link.link); toast({ title: "Link copied" }) }}><Copy className="w-4 h-4" /></Button>
            </div>
          )}

          {tab === "members" && (
            <DataTable rows={ms} rowKey={(m) => m.id} loading={members.isLoading} empty="No board members yet. Invite your first investor."
              columns={[
                { header: "Person", cell: (m) => <div><p className="font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.email}</p></div> },
                { header: "Organisation", cell: (m) => <div><p>{m.organisation ?? "—"}</p><p className="text-xs text-muted-foreground">{m.title ?? ""}</p></div> },
                { header: "Status", cell: (m) => <StatusBadge value={m.status} /> },
                { header: "Last sign-in", cell: (m) => when(m.lastLoginAt) },
                { header: "", className: "text-right", cell: (m) => (
                  <div className="flex justify-end gap-2">
                    {m.status !== "active" && m.status !== "owner" && <Button size="sm" variant="outline" onClick={async () => showLink(await action.mutateAsync({ url: `/admin/board/members/${m.id}/resend`, success: "New invitation sent" }))}><Send className="w-4 h-4 mr-1" />{m.status === "revoked" ? "Re-invite" : "Resend"}</Button>}
                    {m.status !== "revoked" && m.status !== "owner" && <Button size="sm" variant="outline" className="text-destructive" onClick={() => action.mutateAsync({ url: `/admin/board/members/${m.id}/revoke`, success: "Access removed" })}>Remove access</Button>}
                  </div>) },
              ]} />
          )}

          {tab === "accounts" && (
            <>
              <p className="text-sm text-muted-foreground">Enter each month's costs, cash and funding. Revenue and direct costs come from the ledger automatically; the board portal then shows profit and loss, burn and runway. Use one currency for every month.</p>
              <DataTable rows={fins.data ?? []} rowKey={(f) => f.id} loading={fins.isLoading} empty="No months entered yet."
                columns={[
                  { header: "Month", cell: (f) => new Date(f.month + "T00:00:00Z").toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) },
                  { header: "Operating costs", cell: (f) => `${f.currency} ${COSTS.reduce((a, [k]) => a + Number(f[k] ?? 0), 0).toLocaleString()}` },
                  { header: "Cash", cell: (f) => f.cashBalance != null ? `${f.currency} ${Number(f.cashBalance).toLocaleString()}` : "—" },
                  { header: "Funding raised", cell: (f) => Number(f.fundingRaised) ? `${f.currency} ${Number(f.fundingRaised).toLocaleString()}` : "—" },
                  { header: "Headcount", cell: (f) => f.headcount ?? "—" },
                  { header: "", className: "text-right", cell: (f) => <Button size="sm" variant="outline" onClick={() => setFin(f)}>Edit</Button> },
                ]} />
            </>
          )}

          {tab === "updates" && (
            <DataTable rows={ups.data ?? []} rowKey={(u) => u.id} loading={ups.isLoading} empty="No updates yet."
              columns={[
                { header: "Title", cell: (u) => <div><p className="font-medium">{u.title}</p><p className="text-xs text-muted-foreground">{u.period ?? ""}</p></div> },
                { header: "Status", cell: (u) => <StatusBadge value={u.publishedAt ? "published" : "draft"} /> },
                { header: "Published", cell: (u) => when(u.publishedAt) },
                { header: "", className: "text-right", cell: (u) => (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setUpd(u)}>Edit</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => action.mutateAsync({ method: "delete", url: `/admin/board/updates/${u.id}`, success: "Update deleted" })}>Delete</Button>
                  </div>) },
              ]} />
          )}

          {tab === "access" && (
            <DataTable rows={members.data?.access ?? []} rowKey={(a) => a.at + a.member + a.action} empty="Nobody has signed in yet."
              columns={[{ header: "When", cell: (a) => when(a.at) }, { header: "Who", cell: (a) => a.member },
                        { header: "What", cell: (a) => a.action.replace(/_/g, " ") }, { header: "IP", cell: (a) => a.ip ?? "—" }]} />
          )}
        </>
      )}

      <FormDialog open={invite} onOpenChange={setInvite} title="Invite to the board portal"
        description="They'll get an email to set a password. Every sign-in also needs a code sent to their email."
        fields={[{ name: "name", label: "Full name", required: true }, { name: "email", label: "Email", required: true },
                 { name: "organisation", label: "Fund or organisation" }, { name: "title", label: "Role (e.g. Board member, Seed investor)" }]}
        submitLabel="Send invitation"
        onSubmit={async (v) => showLink(await action.mutateAsync({ url: "/admin/board/members", success: "Invitation created", body: v }))} />

      <FormDialog key={fin === "new" ? "new" : fin?.id ?? "none"} open={!!fin} onOpenChange={(o) => !o && setFin(null)}
        title={fin === "new" ? "Enter a month" : "Edit month"}
        initial={fin === "new" ? { month: thisMonth, currency: fins.data?.[0]?.currency ?? "USD" } : fin ? { ...fin } : {}}
        fields={[{ name: "month", label: "Month (YYYY-MM-01)", required: true }, { name: "currency", label: "Currency (e.g. USD, ZAR)", required: true },
                 ...COSTS.map(([n, l]) => ({ name: n, label: l, type: "number" as const })),
                 { name: "otherIncome", label: "Other income (interest, grants)", type: "number" },
                 { name: "cashBalance", label: "Cash in the bank at month end", type: "number" },
                 { name: "fundingRaised", label: "Funding received this month", type: "number" },
                 { name: "headcount", label: "Headcount at month end", type: "number" },
                 { name: "notes", label: "Notes for the board", type: "textarea" }]}
        onSubmit={(v) => {
          const body: Record<string, any> = { month: v.month, currency: String(v.currency || "USD").toUpperCase(), notes: v.notes || null }
          for (const [n] of COSTS) body[n] = v[n] || "0"
          body.otherIncome = v.otherIncome || "0"; body.fundingRaised = v.fundingRaised || "0"
          body.cashBalance = v.cashBalance === "" || v.cashBalance == null ? null : v.cashBalance
          body.headcount = v.headcount === "" || v.headcount == null ? null : Number(v.headcount)
          return action.mutateAsync({ method: "put", url: "/admin/board/financials", success: "Month saved", body })
        }} />

      <FormDialog key={upd === "new" ? "new-u" : upd?.id ?? "none-u"} open={!!upd} onOpenChange={(o) => !o && setUpd(null)}
        title={upd === "new" ? "Write an investor update" : "Edit update"}
        initial={upd && upd !== "new" ? { title: upd.title, period: upd.period ?? "", body: upd.body, publish: !!upd.publishedAt } : {}}
        fields={[{ name: "title", label: "Title", required: true }, { name: "period", label: "Period (e.g. November 2026)" },
                 { name: "body", label: "Update", type: "textarea", required: true, help: "Highlights, lowlights, key numbers, what you need from investors." },
                 { name: "publish", label: "Publish to the board portal", type: "checkbox" }]}
        onSubmit={(v) => upd === "new"
          ? action.mutateAsync({ url: "/admin/board/updates", success: v.publish ? "Update published" : "Draft saved", body: { ...v, publish: !!v.publish } })
          : action.mutateAsync({ method: "patch", url: `/admin/board/updates/${(upd as Upd).id}`, success: "Update saved", body: { ...v, publish: !!v.publish } })} />
    </Page>
  )
}
