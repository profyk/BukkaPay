import { useMemo, useState } from "react"
import { Mail, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, Page, Section, Stat, StatusBadge, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Enquiry = {
  id: string; kind: string; name: string; email: string; organisation: string | null
  countryCode: string | null; message: string; status: "new" | "in_progress" | "closed"; createdAt: string
}

const NEXT: Record<Enquiry["status"], { to: Enquiry["status"]; label: string } | null> = {
  new: { to: "in_progress", label: "Start" },
  in_progress: { to: "closed", label: "Close" },
  closed: { to: "in_progress", label: "Reopen" },
}

/** Leads and questions sent through the website's contact and partner forms. */
export default function EnquiriesPage() {
  const list = useApi<Enquiry[]>(["admin-enquiries"], "/admin/enquiries")
  const action = useAction([["admin-enquiries"]])
  const perms = usePermissions()
  const [status, setStatus] = useState<string>("open")
  const [q, setQ] = useState("")

  const rows = useMemo(() => (list.data ?? []).filter((e) =>
    (status === "all" || (status === "open" ? e.status !== "closed" : e.status === status)) &&
    (!q || `${e.name} ${e.email} ${e.organisation ?? ""} ${e.message}`.toLowerCase().includes(q.toLowerCase())),
  ), [list.data, status, q])

  const count = (s: string) => (list.data ?? []).filter((e) => e.status === s).length

  return (
    <Page title="Website enquiries" subtitle="Questions, partnership and business leads from bukkapay.com. Reply by email, then move each one along.">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="New" value={count("new")} tone={count("new") ? "warn" : undefined} />
        <Stat label="In progress" value={count("in_progress")} />
        <Stat label="Closed" value={count("closed")} tone="good" />
      </div>
      <Section title="Inbox" actions={
        <div className="flex flex-wrap gap-2">
          {["open", "new", "in_progress", "closed", "all"].map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s.replace("_", " ")}
            </Button>
          ))}
          <Input className="w-56" placeholder="Search name, email, message" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      }>
        <DataTable
          rows={rows} loading={list.isLoading} error={list.error} rowKey={(e) => e.id}
          empty="No enquiries here."
          columns={[
            { header: "Received", cell: (e) => when(e.createdAt) },
            {
              header: "From", cell: (e) => (
                <div>
                  <p className="font-semibold">{e.name}</p>
                  <a className="text-xs text-primary inline-flex items-center gap-1" href={`mailto:${e.email}?subject=${encodeURIComponent("Re: your BukkaPay enquiry")}`}>
                    <Mail className="w-3 h-3" />{e.email}
                  </a>
                  {e.organisation && <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{e.organisation}{e.countryCode ? ` · ${e.countryCode}` : ""}</p>}
                </div>
              ),
            },
            { header: "Type", cell: (e) => <span className="capitalize">{e.kind.replace(/_/g, " ")}</span> },
            { header: "Message", cell: (e) => <p className="max-w-md whitespace-pre-wrap text-sm">{e.message}</p> },
            { header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
            {
              header: "", className: "text-right", cell: (e) => {
                const next = NEXT[e.status]
                return perms.can("support.manage") && next ? (
                  <Button size="sm" variant="outline" disabled={action.isPending}
                    onClick={() => action.mutate({ method: "patch", url: `/admin/enquiries/${e.id}`, body: { status: next.to }, success: `Enquiry ${next.to.replace("_", " ")}` })}>
                    {next.label}
                  </Button>
                ) : null
              },
            },
          ]}
        />
      </Section>
    </Page>
  )
}
