import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Loader2, Store, Search, X, ChevronLeft, ChevronRight } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useMerchants } from "@/hooks/use-merchants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils"

export default function MerchantsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  const { data, isLoading, isError, error } = useMerchants(page)
  const merchants = data?.merchants ?? []
  const pagination = data?.pagination

  const filtered = useMemo(() => {
    if (!search.trim()) return merchants
    const q = search.toLowerCase()
    return merchants.filter((m) =>
      m.business_name.toLowerCase().includes(q) ||
      m.user_email.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    )
  }, [merchants, search])

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-display">Merchants</h1>
          <p className="text-muted-foreground mt-1">{pagination ? `${pagination.total.toLocaleString()} registered merchants` : "Platform merchant accounts"}</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, email or category…" className="pl-9 pr-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" /><h3 className="font-bold">Failed to load merchants</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <Store className="w-10 h-10 mb-3" />No merchants found.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Owner</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">{m.business_name || "—"}</td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium">{m.user_name}</p>
                        <p className="text-xs text-muted-foreground">{m.user_email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground capitalize">{m.category || "—"}</td>
                      <td className="px-6 py-4">
                        <Badge variant={m.status === "active" ? "success" : "secondary"}>{m.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(m.created_at)}</td>
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
