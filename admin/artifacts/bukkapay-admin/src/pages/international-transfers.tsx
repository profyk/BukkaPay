import { useState } from "react"
import { motion } from "framer-motion"
import { Loader2, AlertCircle, Globe2, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"
import { useInternationalTransfers } from "@/hooks/use-international-transfers"
import { formatDate } from "@/lib/utils"

export default function InternationalTransfersPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = useInternationalTransfers(page)

  const transfers = data?.transfers ?? []
  const pagination = data?.pagination

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-display">International Transfers</h1>
          <p className="text-muted-foreground mt-1">Every cross-currency send, with the exchange rate and fee locked in at the time it happened.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" /><h3 className="font-bold">Failed to load transfers</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !transfers.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <Globe2 className="w-10 h-10 mb-3" />No cross-border transfers yet.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    {["Sender", "Recipient", "Corridor", "Zone", "Purpose", "Sent", "Rate", "Fee", "Received", "Date"].map((h) => (
                      <th key={h} className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium">{t.sender.name}</p>
                        <p className="text-xs text-muted-foreground">{t.sender.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{t.recipient.name}</p>
                        <p className="text-xs text-muted-foreground">{t.recipient.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          {t.fromCurrency}<ArrowRight className="w-3 h-3 text-muted-foreground" />{t.toCurrency}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted font-medium capitalize">
                          {t.destinationZone || "—"}
                        </span>
                        {t.destinationCountryCode && (
                          <span className="ml-1.5 text-muted-foreground">{t.destinationCountryCode}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <p className="font-medium capitalize">{(t.purposeCategory || "—").replace(/_/g, " ")}</p>
                        {t.purposeSubcategory && <p className="text-muted-foreground">{t.purposeSubcategory}</p>}
                      </td>
                      <td className="px-6 py-4 font-semibold">{t.fromCurrency} {t.sourceAmount}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{t.exchangeRateApplied}</td>
                      <td className="px-6 py-4 text-sm text-destructive">{t.fromCurrency} {t.feeAmount}</td>
                      <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">{t.toCurrency} {t.destinationAmount}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages} · {pagination.total} transfers</p>
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
