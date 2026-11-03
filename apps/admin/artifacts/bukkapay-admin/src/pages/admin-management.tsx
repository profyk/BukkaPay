import { useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle, Loader2, UserCog, Plus, Pencil, Trash2,
  ShieldCheck, Shield, Power, PowerOff, KeyRound,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useAdmins, useAdminActions, type AdminUser } from "@/hooks/use-admins"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"
import { usePermissions } from "@/lib/permissions"

const ROLE_CONFIG = {
  super_admin: { label: "Super Admin", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30" },
  admin:       { label: "Admin",       icon: Shield,      color: "text-blue-600",   bg: "bg-blue-100 dark:bg-blue-900/30"   },
}

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.admin
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  )
}

type FormState = { name: string; email: string; password: string; role: "admin" | "super_admin" }

const BLANK: FormState = { name: "", email: "", password: "", role: "admin" }

export default function AdminManagementPage() {
  const { data: admins, isLoading, isError, error } = useAdmins()
  const { createAdmin, updateAdmin, deleteAdmin } = useAdminActions()
  const { toast } = useToast()
  const perms = usePermissions()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [editForm, setEditForm] = useState<Partial<FormState> & { isActive?: boolean }>({})
  const [showNewPw, setShowNewPw] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!perms.isSuperAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
          <ShieldCheck className="w-14 h-14 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Super Admin Required</h2>
          <p className="text-muted-foreground max-w-sm">
            Only users with the Super Admin role can access admin management.
          </p>
        </div>
      </AppLayout>
    )
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    try {
      await createAdmin.mutateAsync(form)
      toast({ title: "Admin created", description: `${form.name} (${form.role}) has been added.` })
      setCreateOpen(false)
      setForm(BLANK)
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      const payload: any = {}
      if (editForm.name)    payload.name    = editForm.name
      if (editForm.email)   payload.email   = editForm.email
      if (editForm.role)    payload.role    = editForm.role
      if (editForm.password) payload.password = editForm.password
      if (editForm.isActive !== undefined) payload.isActive = editForm.isActive
      await updateAdmin.mutateAsync({ id: editTarget.id, ...payload })
      toast({ title: "Admin updated" })
      setEditTarget(null)
      setEditForm({})
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (admin: AdminUser) => {
    try {
      await updateAdmin.mutateAsync({ id: admin.id, isActive: !admin.isActive })
      toast({ title: admin.isActive ? "Admin suspended" : "Admin reactivated", description: admin.email })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    }
  }

  const handleDelete = async (admin: AdminUser) => {
    try {
      await deleteAdmin.mutateAsync(admin.id)
      toast({ title: "Admin deleted", description: admin.email })
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    }
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display">Admin Management</h1>
            <p className="text-muted-foreground mt-1">Create and manage admin accounts and their roles.</p>
          </div>
          <Button onClick={() => { setForm(BLANK); setCreateOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" />New Admin
          </Button>
        </div>

        {/* Role description cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              role: "super_admin",
              icon: ShieldCheck,
              color: "text-violet-600",
              bg: "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800",
              perms: ["Create & delete admins", "Delete users & transactions", "Adjust wallet balances", "Manage platform pricing", "Send broadcast notifications"],
            },
            {
              role: "admin",
              icon: Shield,
              color: "text-blue-600",
              bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800",
              perms: ["Freeze & verify users", "View transactions", "Review KYC submissions", "Send user notifications", "Manage payment links"],
            },
          ].map(({ role, icon: Icon, color, bg, perms }) => (
            <div key={role} className={`rounded-2xl border p-5 ${bg}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <span className={`font-semibold text-sm ${color}`}>{ROLE_CONFIG[role as keyof typeof ROLE_CONFIG].label}</span>
              </div>
              <ul className="space-y-1.5">
                {perms.map((p) => (
                  <li key={p} className="text-xs text-foreground/70 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${role === "super_admin" ? "bg-violet-500" : "bg-blue-500"}`} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <h3 className="font-bold">Failed to load admins</h3>
            <p className="text-sm opacity-80">{(error as any)?.response?.data?.message ?? (error as any)?.message}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Login</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!admins?.length && (
                    <tr><td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">No admins found.</td></tr>
                  )}
                  {admins?.map((admin) => (
                    <tr key={admin.id} className={`hover:bg-muted/30 transition-colors ${!admin.isActive ? "opacity-60" : ""}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <UserCog className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{admin.name}</p>
                            <p className="text-xs text-muted-foreground">{admin.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><RoleBadge role={admin.role} /></td>
                      <td className="px-6 py-4">
                        {admin.isActive
                          ? <Badge variant="success">Active</Badge>
                          : <Badge variant="destructive">Suspended</Badge>}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(admin.lastLoginAt) || "Never"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(admin.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            title={admin.isActive ? "Suspend" : "Reactivate"}
                            onClick={() => handleToggleActive(admin)}
                          >
                            {admin.isActive
                              ? <PowerOff className="w-4 h-4 text-amber-500" />
                              : <Power className="w-4 h-4 text-emerald-500" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            title="Edit admin"
                            onClick={() => { setEditTarget(admin); setEditForm({}); setShowNewPw(false) }}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete admin">
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {admin.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes <strong>{admin.email}</strong> from the admin panel. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(admin)}>
                                  Delete Admin
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Create admin dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Admin</DialogTitle>
            <DialogDescription>Add a new administrator to the BukkaPay platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Full Name</label>
              <Input placeholder="Jane Smith" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Email Address</label>
              <Input type="email" placeholder="jane@bukkapay.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Password</label>
              <Input type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Role</label>
              <Select value={form.role} onValueChange={(v: any) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" />Admin</span>
                  </SelectItem>
                  <SelectItem value="super_admin">
                    <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-500" />Super Admin</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.role === "super_admin"
                  ? "Super Admins have full platform access including pricing and admin management."
                  : "Admins can manage users, transactions, and KYC but cannot access restricted areas."}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || !form.email || !form.password || saving} onClick={handleCreate}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit admin dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Admin</DialogTitle>
            <DialogDescription>Update {editTarget?.name}'s details. Leave a field blank to keep it unchanged.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Full Name</label>
              <Input placeholder={editTarget?.name} value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Email Address</label>
              <Input type="email" placeholder={editTarget?.email} value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-2">
                New Password
                <Button variant="ghost" size="sm" className="h-auto py-0.5 px-2 text-xs" onClick={() => setShowNewPw((v) => !v)}>
                  <KeyRound className="w-3 h-3 mr-1" />{showNewPw ? "Hide" : "Change"}
                </Button>
              </label>
              {showNewPw && (
                <Input type="password" placeholder="New password…" value={editForm.password ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Role</label>
              <Select value={editForm.role ?? editTarget?.role} onValueChange={(v: any) => setEditForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin"><span className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" />Admin</span></SelectItem>
                  <SelectItem value="super_admin"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-500" />Super Admin</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleEdit}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
