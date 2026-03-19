import { motion } from "framer-motion"
import { AlertCircle, Loader2, Wallet } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useWallets } from "@/hooks/use-wallets"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"

function statusBadge(status: string) {
  switch (status) {
    case "active":    return <Badge variant="success">Active</Badge>
    case "frozen":    return <Badge variant="warning">Frozen</Badge>
    case "suspended": return <Badge variant="destructive">Suspended</Badge>
    default:          return <Badge variant="secondary">{status}</Badge>
  }
}

export default function WalletsPage() {
  const { data: wallets, isLoading, isError, error } = useWallets()

  const totalBalance = wallets?.reduce((sum, w) => sum + w.balance, 0) ?? 0

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">Wallets</h1>
            <p className="text-muted-foreground mt-1">Platform-wide wallet balances and status.</p>
          </div>
          {!isLoading && !isError && wallets && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-3 text-right">
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">Total Platform Balance</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(totalBalance)}</p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h3 className="font-bold">Failed to load wallets</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !wallets?.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <Wallet className="w-10 h-10 mb-3" />
            No wallets found.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">User Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Currency</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Balance</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Last Activity</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {wallets.map((w) => (
                    <tr
                      key={w.id}
                      className={`hover:bg-muted/30 transition-colors ${w.status !== "active" ? "bg-destructive/5" : ""}`}
                    >
                      <td className="px-6 py-4 font-medium text-foreground">{w.user_email}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground font-semibold">{w.currency}</td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-foreground">{formatCurrency(w.balance)}</span>
                      </td>
                      <td className="px-6 py-4">{statusBadge(w.status)}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {w.last_transaction_at
                          ? new Date(w.last_transaction_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                          : "Never"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(w.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
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
