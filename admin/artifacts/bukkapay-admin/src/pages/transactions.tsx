import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, Loader2, Search, X, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useTransactions, useTransactionActions } from "@/hooks/use-transactions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, formatDate } from "@/lib/utils"

const TYPE_COLORS: Record<string, string> = {
  transfer:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  payment:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  deposit:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  withdrawal:"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
}

function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case "completed": return <Badge variant="success">Completed</Badge>
    case "pending":   return <Badge variant="secondary">Pending</Badge>
    case "failed":    return <Badge variant="destructive">Failed</Badge>
    case "flagged":   return <Badge variant="warning">Flagged</Badge>
    default:          return <Badge variant="outline">{status}</Badge>
  }
}

export default function TransactionsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useTransactions(page)
  const { deleteTransaction } = useTransactionActions()
  const { toast } = useToast()

  const transactions = data?.transactions ?? []
  const pagination = data?.pagination

  const filtered = useMemo(() => {
    let list = transactions
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter)
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((t) =>
        t.user_email.toLowerCase().includes(q) ||
        t.user_name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [transactions, search, statusFilter, typeFilter])

  const handleDelete = async (id: string) => {
    setProcessingId(id)
    try {
      await deleteTransaction.mutateAsync(id)
      toast({ title: "Transaction deleted" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-display">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            {pagination ? `${pagination.total.toLocaleString()} total transactions` : "Monitor all platform transactions"}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by user email or name…"
              className="pl-9 pr-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="deposit">Deposit</SelectItem>
              <SelectItem value="withdrawal">Withdrawal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <h3 className="font-bold">Failed to load transactions</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <AnimatePresence>
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">No transactions found.</td></tr>
                    )}
                    {filtered.map((tx) => (
                      <motion.tr
                        key={tx.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`hover:bg-muted/30 transition-colors ${tx.status === "flagged" ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-medium text-foreground">{tx.user_name || tx.user_email}</p>
                          <p className="text-xs text-muted-foreground">{tx.user_email}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${TYPE_COLORS[tx.type] ?? "bg-muted text-muted-foreground"}`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-foreground">{formatCurrency(tx.amount, tx.currency)}</p>
                        </td>
                        <td className="px-6 py-4"><StatusBadge status={tx.status} /></td>
                        <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(tx.created_at, true)}</td>
                        <td className="px-6 py-4 text-right">
                          {processingId === tx.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {formatCurrency(tx.amount, tx.currency)} {tx.type} by {tx.user_email} will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(tx.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages} · {pagination.total} total</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
