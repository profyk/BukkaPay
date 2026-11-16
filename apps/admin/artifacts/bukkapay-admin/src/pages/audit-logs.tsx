import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DataTable, Page, when } from "@/components/network/kit"
import { useAuditLogs, type AuditLog } from "@/hooks/use-audit-logs"

function tone(action: string): "success" | "destructive" | "warning" | "secondary" {
  const a = action.toLowerCase()
  if (a.includes("executed") || a.includes("approve")) return "success"
  if (a.includes("delete") || a.includes("reject") || a.includes("fail")) return "destructive"
  if (a.includes("freeze") || a.includes("block") || a.includes("requested")) return "warning"
  return "secondary"
}

export default function AuditLogsPage() {
  const [filter, setFilter] = useState("")
  const { data, isLoading, error } = useAuditLogs(filter || undefined)

  return (
    <Page
      title="Audit log"
      subtitle="Every privileged action, written in the same database transaction as the action itself, with the route, parameters and request body (secrets redacted). Entries can't be edited."
      actions={<Input className="w-72" placeholder="Filter by action (e.g. approval, kyb, wallets)" value={filter} onChange={(e) => setFilter(e.target.value)} />}
    >
      <DataTable<AuditLog>
        rows={data} loading={isLoading} error={error} rowKey={(l) => l.id} empty="No audit entries yet."
        columns={[
          { header: "When", cell: (l) => <span className="text-xs whitespace-nowrap">{when(l.createdAt)}</span> },
          { header: "Actor", cell: (l) => <div><p className="font-medium">{l.actorEmail ?? (l.actorType === "master_key" ? "Master key" : l.actorType)}</p><p className="text-xs text-muted-foreground">{l.actorType}</p></div> },
          { header: "Action", cell: (l) => <Badge variant={tone(l.action) as any} className="font-mono text-xs">{l.action}</Badge> },
          { header: "Target", cell: (l) => l.targetId ? <span className="font-mono text-xs">{l.targetType}: {l.targetId.slice(0, 12)}</span> : "—" },
          { header: "Details", cell: (l) => <pre className="text-xs whitespace-pre-wrap max-w-md max-h-32 overflow-auto">{JSON.stringify(l.details?.body ?? l.details, null, 1)}</pre> },
          { header: "IP", cell: (l) => <span className="font-mono text-xs">{l.ip ?? "—"}</span> },
        ]}
      />
    </Page>
  )
}
