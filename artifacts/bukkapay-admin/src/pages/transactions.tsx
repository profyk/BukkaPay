import { useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Flag, Loader2 } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useTransactions, useTransactionActions } from "@/hooks/use-transactions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"

export default function TransactionsPage() {
  const { data: transactions, isLoading, isError, error } = useTransactions()
  const { flagTransaction } = useTransactionActions()
  const { toast } = useToast()

  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleFlag = async (id: string) => {
    try {
      setProcessingId(id)
      await flagTransaction.mutateAsync(id)
      toast({
        title: "Transaction Flagged",
        description: "The transaction has been successfully flagged for review.",
      })
    } catch (err: any) {
      toast({
        title: "Action Failed",
        description: err.message || "Failed to flag transaction.",
        variant: "destructive"
      })
    } finally {
      setProcessingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'completed': return <Badge variant="success">Completed</Badge>
      case 'pending': return <Badge variant="secondary">Pending</Badge>
      case 'failed': return <Badge variant="destructive">Failed</Badge>
      case 'flagged': return <Badge variant="warning">Flagged</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <AppLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">Transactions</h1>
            <p className="text-muted-foreground mt-1">Monitor all platform transactions and flag suspicious activity.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border shadow-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
            <AlertCircle className="w-10 h-10 mb-2" />
            <h3 className="text-lg font-bold">Failed to load transactions</h3>
            <p className="text-sm opacity-80">{error?.message || "Please check your connection and try again."}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">ID</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">User Email</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Amount</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground">Status</th>
                    <th className="px-6 py-4 text-sm font-semibold text-muted-foreground text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                  {transactions?.map((tx) => {
                    const isFlagged = tx.status.toLowerCase() === 'flagged';
                    const isProcessing = processingId === tx.id;

                    return (
                      <tr 
                        key={tx.id} 
                        className={`transition-colors hover:bg-muted/30 ${isFlagged ? 'bg-warning/10' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{tx.id.substring(0,8)}...</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">{tx.user_email}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold">{formatCurrency(tx.amount)}</span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(tx.status)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant={isFlagged ? "secondary" : "outline"} 
                            size="sm"
                            disabled={isFlagged || isProcessing}
                            onClick={() => handleFlag(tx.id)}
                            className={!isFlagged ? "hover:border-warning hover:text-warning" : ""}
                          >
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Flag className="w-4 h-4 mr-2" />
                            )}
                            {isFlagged ? "Flagged" : "Flag"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>
    </AppLayout>
  )
}
