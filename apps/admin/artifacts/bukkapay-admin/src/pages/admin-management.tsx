import { useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle, Loader2, UserCog, Pencil, Trash2, ShieldCheck, Shield, Power, PowerOff,
  Mail, Copy, RefreshCw, XCircle, Send, Crown, Lock,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import {
  useAdmins, useInvites, useAdminActions, ASSIGNABLE_ROLES, ROLE_LABEL, OWNER_EMAIL,
  type AdminUser, type AdminInvite, type InviteLink,
} from "@/hooks/use-admins"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"
import { usePermissions } from "@/lib/permissions"

const isOwner = (email?: string | null) => (email ?? "").trim().toLowerCase() === OWNER_EMAIL

function RoleBadge({ role }: { role: string }) {
  const sup = role === "super_admin"
  const Icon = sup ? ShieldCheck : Shield
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${sup ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30"}`}>
      <Icon className="w-3.5 h-3.5" />
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

const errText = (e: any) => e?.response?.data?.error ?? e?.message ?? "Something went wrong"

type InviteForm = { name: string; email: string; role: string }
const BLANK: InviteForm = { name: "", email: "", role: "customer_support" }

export default function AdminManagementPage() {
  const { data: admins, isLoading, isError, error } = useAdmins()
  const { data: invites } = useInvites()
  const { inviteAdmin, resendInvite, revokeInvite, updateAdmin, deleteAdmin } = useAdminActions()
  const { toast } = useToast()
  const perms = usePermissions()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(BLANK)
  const [sentLink, setSentLink] = useState<InviteLink | null>(null)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState<{ name?: string; role?: string }>({})
  const [saving, setSaving] = useState(false)

  if (!perms.isSuperAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
          <ShieldCheck className="w-14 h-14 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Super Admin Required</h2>
          <p className="text-muted-foreground max-w-sm">Only the platform owner can manage admins.</p>
        </div>
      </AppLayout>
    )
  }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: "Link copied" }) }
    catch { toast({ title: "Couldn't copy", description: "Select the link and copy it manually.", variant: "destructive" }) }
  }

  const handleInvite = async () => {
    setSaving(true)
    try {
      const res = await inviteAdmin.mutateAsync({ ...form, email: form.email.trim().toLowerCase() })
      setInviteOpen(false)
      setForm(BLANK)
      setSentLink(res)
    } catch (e) {
      toast({ title: "Invitation failed", description: errText(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleResend = async (inv: AdminInvite) => {
    try { setSentLink(await resendInvite.mutateAsync(inv.id)) }
    catch (e) { toast({ title: "Couldn't resend", description: errText(e), variant: "destructive" }) }
  }

  const handleRevoke = async (inv: AdminInvite) => {
    try { await revokeInvite.mutateAsync(inv.id); toast({ title: "Invitation cancelled", description: inv.email }) }
    catch (e) { toast({ title: "Couldn't cancel", description: errText(e), variant: "destructive" }) }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      const payload: any = {}
      if (editForm.name) payload.name = editForm.name
      if (editForm.role && editForm.role !== editTarget.role) payload.role = editForm.role
      if (Object.keys(payload).length) await updateAdmin.mutateAsync({ id: editTarget.id, ...payload })
      toast({ title: "Admin updated" })
      setEditTarget(null)
      setEditForm({})
    } catch (e) {
      toast({ title: "Failed", description: errText(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (admin: AdminUser) => {
    try {
      await updateAdmin.mutateAsync({ id: admin.id, isActive: !admin.isActive })
      toast({ title: admin.isActive ? "Admin suspended" : "Admin reactivated", description: admin.email })
    } catch (e) {
      toast({ title: "Failed", description: errText(e), variant: "destructive" })
    }
  }

  const handleDelete = async (admin: AdminUser) => {
    try { await deleteAdmin.mutateAsync(admin.id); toast({ title: "Admin removed", description: admin.email }) }
    catch (e) { toast({ title: "Failed", description: errText(e), variant: "destructive" }) }
  }

  const openInvites = (invites ?? []).filter((i) => i.status !== "accepted" && i.status !== "revoked")
  const selectedRole = ASSIGNABLE_ROLES.find((r) => r.value === form.role)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display">Admin Management</h1>
            <p className="text-muted-foreground mt-1">Invite admins by email. They set their own password and switch on two-factor sign-in.</p>
          </div>
          <Button onClick={() => { setForm(BLANK); setInviteOpen(true) }}>
            <Mail className="w-4 h-4 mr-2" />Invite admin
          </Button>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-5 flex gap-3">
          <Crown className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-violet-700 dark:text-violet-300">Super Admin is reserved for the platform owner</p>
            <p className="text-foreground/70 mt-1">
              {OWNER_EMAIL} is the only super admin. The role can't be given to anyone else, and the owner can't be
              suspended, demoted or removed — the database itself refuses it.
            </p>
          </div>
        </div>

        {/* Pending invitations */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Invitations</h2>
            <span className="text-xs text-muted-foreground">{openInvites.length} open</span>
          </div>
          {openInvites.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground text-center">No open invitations.</p>
          ) : (
            <ul className="divide-y divide-border">
              {openInvites.map((inv) => (
                <li key={inv.id} className="px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{inv.name} <span className="font-normal text-muted-foreground">· {inv.email}</span></p>
                    <div className="flex items-center gap-2 mt-1">
                      <RoleBadge role={inv.role} />
                      {inv.status === "pending"
                        ? <span className="text-xs text-muted-foreground">Expires {formatDate(inv.expiresAt)}</span>
                        : <Badge variant="destructive">Expired</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => handleResend(inv)} disabled={resendInvite.isPending}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />{inv.status === "pending" ? "Resend" : "Renew"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv)} disabled={revokeInvite.isPending}>
                      <XCircle className="w-3.5 h-3.5 mr-1.5 text-destructive" />Cancel
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Admins */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <h3 className="font-bold">Failed to load admins</h3>
            <p className="text-sm opacity-80">{errText(error)}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    {["Admin", "Role", "Status", "Last login", "Joined", ""].map((h) => (
                      <th key={h} className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!admins?.length && (
                    <tr><td colSpan={6} className="px-6 py-16 text-center text-muted-foreground">No admins yet.</td></tr>
                  )}
                  {admins?.map((admin) => {
                    const owner = isOwner(admin.email)
                    return (
                      <tr key={admin.id} className={`hover:bg-muted/30 transition-colors ${!admin.isActive ? "opacity-60" : ""}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              {owner ? <Crown className="w-4 h-4 text-violet-600" /> : <UserCog className="w-4 h-4 text-primary" />}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{admin.name}{owner && <span className="ml-2 text-xs text-violet-600">Owner</span>}</p>
                              <p className="text-xs text-muted-foreground">{admin.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><RoleBadge role={admin.role} /></td>
                        <td className="px-6 py-4">
                          {admin.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Suspended</Badge>}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(admin.lastLoginAt) || "Never"}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(admin.createdAt)}</td>
                        <td className="px-6 py-4 text-right">
                          {owner ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="w-3.5 h-3.5" />Protected</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title={admin.isActive ? "Suspend" : "Reactivate"} onClick={() => handleToggleActive(admin)}>
                                {admin.isActive ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-emerald-500" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditTarget(admin); setEditForm({}) }}>
                                <Pencil className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Remove"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove {admin.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <strong>{admin.email}</strong> loses access to the admin panel immediately. To bring them back, invite them again.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleDelete(admin)}>Remove admin</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
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

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => !o && setInviteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>We email them a one-time link (valid 7 days). They set their own password and set up an authenticator app before they can sign in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="inv-name">Full name</label>
              <Input id="inv-name" placeholder="Jane Smith" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="inv-email">Email address</label>
              <Input id="inv-email" type="email" placeholder="jane@bukkapay.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedRole && <p className="text-xs text-muted-foreground">{selectedRole.summary}</p>}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button disabled={!form.name.trim() || !emailOk || saving} onClick={handleInvite}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link shown once after invite / resend */}
      <Dialog open={!!sentLink} onOpenChange={(o) => !o && setSentLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sentLink?.emailSent ? "Invitation sent" : "Invitation created — email not sent"}</DialogTitle>
            <DialogDescription>
              {sentLink?.emailSent
                ? `We emailed ${sentLink?.invite.email}. You can also share this link with them directly.`
                : `Email delivery isn't available right now, so send ${sentLink?.invite.email} this link yourself (for example by WhatsApp). It works once and expires in 7 days.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input readOnly value={sentLink?.link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
            <Button variant="outline" onClick={() => sentLink && copy(sentLink.link)}><Copy className="w-4 h-4 mr-1.5" />Copy</Button>
          </div>
          <p className="text-xs text-muted-foreground">This link is shown only now. If it's lost, use Resend to make a new one.</p>
          <DialogFooter><Button onClick={() => setSentLink(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (name and role only; passwords are set by the admin themselves) */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit admin</DialogTitle>
            <DialogDescription>{editTarget?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="ed-name">Full name</label>
              <Input id="ed-name" placeholder={editTarget?.name} value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Role</label>
              <Select value={editForm.role ?? editTarget?.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button disabled={saving} onClick={handleEdit}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
