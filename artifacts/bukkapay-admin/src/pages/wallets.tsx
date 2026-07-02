import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle, Loader2, Wallet, ShieldBan, CheckCircle2,
  Pencil, ChevronLeft, ChevronRight, Search, X,
  Flag, OctagonX, Unlock, MoreHorizontal,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useWallets, useWalletActions } from "@/hooks/use-wallets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permissions"
import { formatCurrency, formatDate } from "@/lib/utils"

function WalletStatusBadge({ status, flagged }: { status: string; flagged: boolean }) {
  const base = "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
  if (flagged && status === "active")
    return <span className={`${base} bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400`}><Flag className="w-3 h-3" />Flagged</span>
  if (status === "blocked")
    return <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`}><OctagonX className="w-3 h-3" />Blocked</span>
  if (status === "frozen")
    return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}><ShieldBan className="w-3 h-3" />Frozen</span>
  return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400`}><CheckCircle2 className="w-3 h-3" />Active</span>
}

export default function WalletsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [balanceDialog, setBalanceDialog] = useState<{ id: string; current: number; email: string } | null>(null)
  const [newBalance, setNewBalance] = useState("")

  const { data, isLoading, isError, error } = useWallets(page)
  const { freezeWallet, blockWallet, unblockWallet, flagWallet, unflagWallet, adjustBalance } = useWalletActions()
  const { toast } = useToast()
  const perms = usePermissions()

  const wallets = data?.wallets ?? []
  const pagination = data?.pagination
  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0)

  const filtered = useMemo(() => {
    let list = wallets
    if (statusFilter === "flagged") list = list.filter((w) => w.flagged)
    else if (statusFilter !== "all") list = list.filter((w) => w.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((w) => w.user_email.toLowerCase().includes(q) || w.user_name.toLowerCase().includes(q))
    }
    return list
  }, [wallets, search, statusFilter])

  const run = async (id: string, label: string, fn: () => Promise<any>) => {
    setProcessingId(id)
    try { await fn(); toast({ title: label }) }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setProcessingId(null) }
  }

  const handleAdjust = async () => {
    if (!balanceDialog) return
    const val = parseFloat(newBalance)
    if (isNaN(val) || val < 0) { toast({ title: "Invalid amount", variant: "destructive" }); return }
    await run(balanceDialog.id, "Balance updated", () => adjustBalance.mutateAsync({ id: balanceDialog.id, balance: val }))
    setBalanceDialog(null); setNewBalance("")
  }

  const summaryRow = [
    { label: "Total Wallets", value: pagination?.total.toLocaleString() ?? "—" },
    { label: "Flagged",       value: wallets.filter((w) => w.flagged).length },
    { label: "Frozen",        value: wallets.filter((w) => w.status === "frozen").length },
    { label: "Blocked",       value: wallets.filter((w) => w.status === "blocked").length },
  ]

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">Wallets</h1>
            <p className="text-muted-foreground mt-1">Manage wallet status, balances, and security flags.</p>
          </div>
          {!isLoading && wallets.length > 0 && (
            <div className="bg-primary/8 border border-primary/15 rounded-xl px-5 py-3 text-right">
              <p className="text-xs text-primary font-semibold uppercase tracking-wide">Page Balance</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(totalBalance)}</p>
            </div>
          )}
        </div>

        {/* Summary pills */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryRow.map(({ label, value }) => (
              <div key={label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-lg font-bold mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by user email or name…" className="pl-9 pr-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All wallets</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="flagged">Flagged (suspicious)</SelectItem>
              <SelectItem value="frozen">Frozen (temp.)</SelectItem>
              <SelectItem value="blocked">Blocked (permanent)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64 bg-card rounded-2xl border border-border"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" /><h3 className="font-bold">Failed to load wallets</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center h-64 bg-card rounded-2xl border border-border text-muted-foreground">
            <Wallet className="w-10 h-10 mb-3" />No wallets found.
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    {["User", "Currency", "Balance", "Status", "Last Activity", "Actions"].map((h) => (
                      <th key={h} className={`px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h === "Actions" ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((w) => {
                    const isProcessing = processingId === w.id
                    const rowBg = w.status === "blocked" ? "bg-red-50/30 dark:bg-red-950/10" : w.status === "frozen" ? "bg-amber-50/30 dark:bg-amber-950/10" : w.flagged ? "bg-orange-50/30 dark:bg-orange-950/10" : ""
                    return (
                      <tr key={w.id} className={`hover:bg-muted/30 transition-colors ${rowBg}`}>
                        <td className="px-6 py-4">
                          <p className="font-medium">{w.user_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{w.user_email}</p>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-muted-foreground">{w.currency}</td>
                        <td className="px-6 py-4 font-bold">{formatCurrency(w.balance, w.currency)}</td>
                        <td className="px-6 py-4"><WalletStatusBadge status={w.status} flagged={w.flagged} /></td>
                        <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(w.last_transaction_at) || "Never"}</td>
                        <td className="px-6 py-4 text-right">
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Balance (super_admin only) */}
                              {perms.canAdjustBalances && (
                                <Button variant="outline" size="sm" onClick={() => { setBalanceDialog({ id: w.id, current: w.balance, email: w.user_email }); setNewBalance(String(w.balance)) }}>
                                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Balance
                                </Button>
                              )}
                              {/* More actions dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuLabel>Wallet Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />

                                  {/* Flag / Unflag */}
                                  {w.flagged ? (
                                    <DropdownMenuItem onClick={() => run(w.id, "Wallet unflagged", () => unflagWallet.mutateAsync(w.id))}>
                                      <Flag className="w-4 h-4 mr-2 text-muted-foreground" />Remove Flag
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem className="text-orange-600 focus:text-orange-600 focus:bg-orange-50" onClick={() => run(w.id, "Wallet flagged as suspicious", () => flagWallet.mutateAsync(w.id))}>
                                      <Flag className="w-4 h-4 mr-2" />Flag as Suspicious
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />

                                  {/* Freeze / Unfreeze */}
                                  {w.status === "frozen" ? (
                                    <DropdownMenuItem className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50" onClick={() => run(w.id, "Wallet unfrozen", () => freezeWallet.mutateAsync({ id: w.id, frozen: false }))}>
                                      <CheckCircle2 className="w-4 h-4 mr-2" />Unfreeze Wallet
                                    </DropdownMenuItem>
                                  ) : w.status !== "blocked" && (
                                    <DropdownMenuItem className="text-amber-600 focus:text-amber-600 focus:bg-amber-50" onClick={() => run(w.id, "Wallet frozen", () => freezeWallet.mutateAsync({ id: w.id, frozen: true }))}>
                                      <ShieldBan className="w-4 h-4 mr-2" />Freeze (Temporary)
                                    </DropdownMenuItem>
                                  )}

                                  {/* Block / Unblock (super_admin only) */}
                                  {perms.canBlockWallets && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {w.status === "blocked" ? (
                                        <DropdownMenuItem className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50" onClick={() => run(w.id, "Wallet unblocked", () => unblockWallet.mutateAsync(w.id))}>
                                          <Unlock className="w-4 h-4 mr-2" />Unblock Wallet
                                        </DropdownMenuItem>
                                      ) : (
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                              <OctagonX className="w-4 h-4 mr-2" />Block Permanently
                                            </DropdownMenuItem>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Permanently block this wallet?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {w.user_email}'s wallet will be blocked. This is more severe than a freeze — use only for fraud or policy violations.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => run(w.id, "Wallet blocked permanently", () => blockWallet.mutateAsync(w.id))}>
                                                Block Wallet
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      )}
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.pages} · {pagination.total} wallets</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Adjust Balance dialog */}
      <Dialog open={!!balanceDialog} onOpenChange={(o) => !o && setBalanceDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Wallet Balance</DialogTitle>
            <DialogDescription>{balanceDialog?.email} · Current: {balanceDialog ? formatCurrency(balanceDialog.current) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 mt-2">
            <label className="text-sm font-semibold">New Balance (ZAR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">R</span>
              <Input type="number" min="0" step="0.01" className="pl-7" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setBalanceDialog(null)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!newBalance || processingId === balanceDialog?.id}>
              {processingId === balanceDialog?.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              Update Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
