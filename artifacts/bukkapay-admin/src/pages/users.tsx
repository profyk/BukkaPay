import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertCircle, CheckCircle2, ShieldBan, Trash2, Loader2,
  MoreHorizontal, Search, X, BadgeCheck, Bell, ChevronLeft,
  ChevronRight, User, CreditCard, ArrowRightLeft,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useUsers, useUserDetail, useUserActions, type User as UserType } from "@/hooks/use-users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatDate } from "@/lib/utils"

function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case "active":  return <Badge variant="success">Active</Badge>
    case "frozen":  return <Badge variant="warning">Frozen</Badge>
    case "deleted": return <Badge variant="destructive">Deleted</Badge>
    default:        return <Badge variant="secondary">{status}</Badge>
  }
}

function UserDetailSheet({
  userId,
  open,
  onClose,
  onFreeze,
  onActivate,
  onVerify,
  onDelete,
}: {
  userId: string | null
  open: boolean
  onClose: () => void
  onFreeze: (id: string) => void
  onActivate: (id: string) => void
  onVerify: (id: string, verified: boolean) => void
  onDelete: (id: string) => void
}) {
  const { data, isLoading } = useUserDetail(userId)
  const { notifyUser } = useUserActions()
  const { toast } = useToast()
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [notifyForm, setNotifyForm] = useState({ type: "info", title: "", message: "" })
  const [notifying, setNotifying] = useState(false)

  const user = data?.user
  const cards = data?.cards ?? []
  const recentTxns = data?.recentTransactions ?? []
  const totalBalance = parseFloat(data?.totalBalance ?? "0")

  const handleNotify = async () => {
    if (!userId || !notifyForm.title || !notifyForm.message) return
    setNotifying(true)
    try {
      await notifyUser.mutateAsync({ id: userId, ...notifyForm })
      toast({ title: "Notification sent", description: `Message delivered to ${user?.email}` })
      setNotifyOpen(false)
      setNotifyForm({ type: "info", title: "", message: "" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setNotifying(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>User Profile</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !user ? (
            <div className="text-center text-muted-foreground py-12">Could not load user data.</div>
          ) : (
            <div className="space-y-6">
              {/* Profile card */}
              <div className="bg-muted/40 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{user.name || user.username || "—"}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    <StatusBadge status={user.frozen ? "frozen" : "active"} />
                    {user.verified
                      ? <Badge variant="success" className="text-xs"><BadgeCheck className="w-3 h-3 mr-1" />Verified</Badge>
                      : <Badge variant="secondary" className="text-xs">Unverified</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div><span className="text-muted-foreground">Username</span><p className="font-medium">@{user.username || "—"}</p></div>
                  <div><span className="text-muted-foreground">Wallet ID</span><p className="font-mono font-medium text-xs">{user.walletId || "—"}</p></div>
                  <div><span className="text-muted-foreground">Phone</span><p className="font-medium">{user.phone || "—"}</p></div>
                  <div><span className="text-muted-foreground">Joined</span><p className="font-medium">{formatDate(user.createdAt)}</p></div>
                </div>
              </div>

              {/* Balance summary */}
              <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">Total Balance ({cards.length} card{cards.length !== 1 ? "s" : ""})</span>
                </div>
                <span className="text-xl font-bold text-primary">{formatCurrency(totalBalance)}</span>
              </div>

              {/* Wallet cards */}
              {cards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Wallet Cards</h3>
                  <div className="space-y-2">
                    {cards.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">{c.cardType || "Card"} {c.cardNumber ? `•••• ${c.cardNumber.slice(-4)}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{c.currency ?? "ZAR"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(parseFloat(c.balance ?? "0"))}</p>
                          {c.frozen && <Badge variant="warning" className="text-xs">Frozen</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent transactions */}
              {recentTxns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Transactions</h3>
                  <div className="space-y-1.5">
                    {recentTxns.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between px-4 py-2.5 bg-card border border-border rounded-xl">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm capitalize">{t.type || "transfer"}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{formatCurrency(parseFloat(t.amount ?? "0"))}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(t.createdAt, false)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-border pt-5 space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {user.frozen ? (
                    <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => { onActivate(user.id); onClose() }}>
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Unfreeze
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => { onFreeze(user.id); onClose() }}>
                      <ShieldBan className="w-4 h-4 mr-1.5" /> Freeze
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onVerify(user.id, !user.verified)} className={user.verified ? "text-muted-foreground" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"}>
                    <BadgeCheck className="w-4 h-4 mr-1.5" /> {user.verified ? "Unverify" : "Verify KYC"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setNotifyOpen(true)}>
                    <Bell className="w-4 h-4 mr-1.5" /> Notify
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/5">
                        <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the user and all associated data. This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { onDelete(user.id); onClose() }}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Notify dialog */}
      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Notification</DialogTitle>
            <DialogDescription>Send an in-app notification to {user?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={notifyForm.type} onValueChange={(v) => setNotifyForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input placeholder="Notification title" value={notifyForm.title} onChange={(e) => setNotifyForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <Textarea placeholder="Notification body..." rows={3} value={notifyForm.message} onChange={(e) => setNotifyForm((f) => ({ ...f, message: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setNotifyOpen(false)}>Cancel</Button>
            <Button disabled={!notifyForm.title || !notifyForm.message || notifying} onClick={handleNotify}>
              {notifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useUsers(page)
  const { freezeUser, activateUser, deleteUser, verifyUser } = useUserActions()
  const { toast } = useToast()

  const users = data?.users ?? []
  const pagination = data?.pagination

  const filtered = useMemo(() => {
    let list = users
    if (statusFilter !== "all") list = list.filter((u) => u.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.walletId.toLowerCase().includes(q)
      )
    }
    return list
  }, [users, search, statusFilter])

  const run = async (label: string, fn: () => Promise<any>) => {
    try {
      await fn()
      toast({ title: "Done", description: `${label} successful.` })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    }
  }

  const handleFreeze = (id: string) => { setProcessingId(id); run("Freeze", () => freezeUser.mutateAsync(id)).finally(() => setProcessingId(null)) }
  const handleActivate = (id: string) => { setProcessingId(id); run("Unfreeze", () => activateUser.mutateAsync(id)).finally(() => setProcessingId(null)) }
  const handleDelete = (id: string) => { setProcessingId(id); run("Delete", () => deleteUser.mutateAsync(id)).finally(() => setProcessingId(null)) }
  const handleVerify = (id: string, verified: boolean) => { setProcessingId(id); run(verified ? "Verify" : "Unverify", () => verifyUser.mutateAsync({ id, verified })).finally(() => setProcessingId(null)) }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">Users</h1>
            <p className="text-muted-foreground mt-1">
              {pagination ? `${pagination.total.toLocaleString()} registered users` : "Manage all BukkaPay users"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, username or wallet ID…"
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
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="frozen">Frozen</SelectItem>
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
            <h3 className="font-bold">Failed to load users</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Username</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">KYC</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
                      <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <AnimatePresence>
                      {filtered.length === 0 && (
                        <tr><td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">No users found.</td></tr>
                      )}
                      {filtered.map((user) => {
                        const isProcessing = processingId === user.id
                        return (
                          <motion.tr
                            key={user.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`transition-colors hover:bg-muted/30 cursor-pointer ${user.status === "frozen" ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-medium text-foreground">{user.name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground">@{user.username || "—"}</td>
                            <td className="px-6 py-4"><StatusBadge status={user.status} /></td>
                            <td className="px-6 py-4">
                              {user.verified
                                ? <Badge variant="success" className="text-xs gap-1"><BadgeCheck className="w-3 h-3" />Verified</Badge>
                                : <Badge variant="secondary" className="text-xs">Pending</Badge>}
                            </td>
                            <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(user.createdAt)}</td>
                            <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary inline" />
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setSelectedUserId(user.id)}>
                                      <User className="w-4 h-4 mr-2" /> View Profile
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {user.status !== "active" && (
                                      <DropdownMenuItem onClick={() => handleActivate(user.id)} className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50">
                                        <CheckCircle2 className="w-4 h-4 mr-2" /> Unfreeze
                                      </DropdownMenuItem>
                                    )}
                                    {user.status === "active" && (
                                      <DropdownMenuItem onClick={() => handleFreeze(user.id)} className="text-amber-600 focus:text-amber-600 focus:bg-amber-50">
                                        <ShieldBan className="w-4 h-4 mr-2" /> Freeze
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => handleVerify(user.id, !user.verified)}>
                                      <BadgeCheck className="w-4 h-4 mr-2" /> {user.verified ? "Unverify" : "Verify KYC"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                                        </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete {user.email}?</AlertDialogTitle>
                                          <AlertDialogDescription>This is permanent and cannot be undone.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(user.id)}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          </motion.tr>
                        )
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination && pagination.pages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.pages} · {pagination.total} total
                  </p>
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
          </>
        )}
      </motion.div>

      <UserDetailSheet
        userId={selectedUserId}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onFreeze={handleFreeze}
        onActivate={handleActivate}
        onVerify={handleVerify}
        onDelete={handleDelete}
      />
    </AppLayout>
  )
}
