import { motion } from "framer-motion"
import { AlertCircle, Loader2, ScrollText, User, ArrowRightLeft, FileCheck, Settings } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useAuditLogs, type AuditLog } from "@/hooks/use-audit-logs"
import { Badge } from "@/components/ui/badge"

function targetIcon(type: string) {
  switch (type) {
    case "user":        return <User className="w-3.5 h-3.5" />
    case "transaction": return <ArrowRightLeft className="w-3.5 h-3.5" />
    case "kyc":         return <FileCheck className="w-3.5 h-3.5" />
    default:            return <Settings className="w-3.5 h-3.5" />
  }
}

function actionColor(action: string): "success" | "destructive" | "warning" | "secondary" {
  const a = action.toLowerCase()
  if (a.includes("approv") || a.includes("activ"))  return "success"
  if (a.includes("delet") || a.includes("reject") || a.includes("flag")) return "destructive"
  if (a.includes("freez") || a.includes("suspend")) return "warning"
  return "secondary"
}

export default function AuditLogsPage() {
  const { data: logs, isLoading, isError, error } = useAuditLogs()

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div>
          <h1 className="text-3xl font-display">Audit Log</h1>
          <p className="text-muted-foreground mt-1">Complete trail of all admin actions on the platform.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h3 className="font-bold">Failed to load audit logs</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !logs?.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <ScrollText className="w-10 h-10 mb-3" />
            No audit log entries yet.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Timestamp</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Admin</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Action</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Target</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Details</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log: AuditLog) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">{log.admin_email}</td>
                      <td className="px-6 py-4">
                        <Badge variant={actionColor(log.action)} className="capitalize text-xs">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
                          {targetIcon(log.target_type)}
                          {log.target_type}
                          {log.target_id && (
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded ml-1">
                              {log.target_id.substring(0, 8)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {log.details ?? "—"}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {log.ip_address ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
