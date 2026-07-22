import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Loader2, Link2, Search, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { usePaymentLinks, usePaymentLinkActions } from "@/hooks/use-payment-links"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, formatDate } from "@/lib/utils"

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":   return <Badge variant="secondary">Pending</Badge>
    case "partial":   return <Badge variant="warning">Partial</Badge>
    case "paid":      return <Badge variant="success">Paid</Badge>
    case "expired":   return <Badge variant="outline">Expired</Badge>
    case "cancelled": return <Badge variant="destructive">Cancelled</Badge>
    default:          return <Badge variant="outline">{status}</Badge>
  }
}

export default function PaymentLinksPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = usePaymentLinks(page)
  const { updateStatus, deletePaymentLink } = usePaymentLinkActions()
  const { toast } = useToast()

  const links = data?.paymentLinks ?? []
  const pagination = data?.pagination

  const filtered = useMemo(() => {
    let list = links
    if (statusFilter !== "all") list = list.filter((l) => l.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((l) => l.user.email.toLowerCase().includes(q) || (l.description ?? "").toLowerCase().includes(q))
    }
    return list
  }, [links, search, statusFilter])

  const handleStatusChange = async (id: string, status: string) => {
    setProcessingId(id)
    try {
      await updateStatus.mutateAsync({ id, status })
      toast({ title: "Status updated", description: `Link marked as ${status}` })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setProcessingId(id)
    try {
      await deletePaymentLink.mutateAsync(id)
      toast({ title: "Payment link deleted" })
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
          <h1 className="text-3xl font-display">Payment Links</h1>
          <p className="text-muted-foreground mt-1">{pagination ? `${pagination.total.toLocaleString()} payment links` : "Manage all payment links"}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by user or description…" className="pl-9 pr-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" /><h3 className="font-bold">Failed to load payment links</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <Link2 className="w-10 h-10 mb-3" />No payment links found.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created By</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((link) => (
                    <tr key={link.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium">{link.user.name || link.user.username}</p>
                        <p className="text-xs text-muted-foreground">{link.user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">{link.description || "—"}</td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(link.amount, link.currency)}</td>
                      <td className="px-6 py-4"><StatusBadge status={link.status} /></td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(link.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {processingId === link.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
                          ) : (
                            <>
                              {(link.status === "pending" || link.status === "partial") && (
                                <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                                  onClick={() => handleStatusChange(link.id, "cancelled")}>
                                  Cancel
                                </Button>
                              )}
                              {link.status === "cancelled" && (
                                <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  onClick={() => handleStatusChange(link.id, "pending")}>
                                  Reactivate
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this payment link?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {formatCurrency(link.amount, link.currency)} link by {link.user.email} will be permanently removed.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(link.id)}>Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
