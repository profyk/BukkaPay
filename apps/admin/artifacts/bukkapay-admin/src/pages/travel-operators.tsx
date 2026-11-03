import { useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Loader2, Bus, Plane, Plus, Pencil, Power, PowerOff, Route as RouteIcon } from "lucide-react"
import { Link } from "wouter"
import { AppLayout } from "@/components/layout/AppLayout"
import { useTravelOperators, useCreateOperator, useUpdateOperator, type TravelOperator } from "@/hooks/use-travel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

type FormState = { name: string; mode: "bus" | "flight"; logoUrl: string }
const BLANK: FormState = { name: "", mode: "bus", logoUrl: "" }

function ModeBadge({ mode }: { mode: string }) {
  return mode === "bus" ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      <Bus className="w-3.5 h-3.5" />Bus
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
      <Plane className="w-3.5 h-3.5" />Flight
    </span>
  )
}

export default function TravelOperatorsPage() {
  const { data: operators, isLoading, isError, error } = useTravelOperators()
  const createOperator = useCreateOperator()
  const updateOperator = useUpdateOperator()
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TravelOperator | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [editForm, setEditForm] = useState<Partial<FormState>>({})
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createOperator.mutateAsync({ name: form.name, mode: form.mode, logoUrl: form.logoUrl || undefined })
      toast({ title: "Operator created", description: `${form.name} (${form.mode}) is ready for routes.` })
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
      await updateOperator.mutateAsync({ id: editTarget.id, ...editForm })
      toast({ title: "Operator updated" })
      setEditTarget(null)
      setEditForm({})
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.error ?? e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (op: TravelOperator) => {
    try {
      await updateOperator.mutateAsync({ id: op.id, isActive: !op.isActive })
      toast({ title: op.isActive ? "Operator deactivated" : "Operator activated", description: op.name })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    }
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display">Travel Operators</h1>
            <p className="text-muted-foreground mt-1">Bus and flight operators available for booking in the app.</p>
          </div>
          <Button onClick={() => { setForm(BLANK); setCreateOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" />New Operator
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <h3 className="font-bold">Failed to load operators</h3>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Operator</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mode</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Added</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!operators?.length && (
                    <tr><td colSpan={5} className="px-6 py-16 text-center text-muted-foreground">No operators yet — add one to start creating routes.</td></tr>
                  )}
                  {operators?.map((op) => (
                    <tr key={op.id} className={`hover:bg-muted/30 transition-colors ${!op.isActive ? "opacity-60" : ""}`}>
                      <td className="px-6 py-4 font-semibold text-foreground">{op.name}</td>
                      <td className="px-6 py-4"><ModeBadge mode={op.mode} /></td>
                      <td className="px-6 py-4">
                        {op.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">{formatDate(op.createdAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href="/travel-routes">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Manage routes">
                              <RouteIcon className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit"
                            onClick={() => { setEditTarget(op); setEditForm({}) }}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title={op.isActive ? "Deactivate" : "Activate"}
                            onClick={() => handleToggleActive(op)}>
                            {op.isActive ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-emerald-500" />}
                          </Button>
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

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Travel Operator</DialogTitle>
            <DialogDescription>Bus companies and airlines whose routes users can book.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Name</label>
              <Input placeholder="Intercape" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Mode</label>
              <Select value={form.mode} onValueChange={(v: any) => setForm((f) => ({ ...f, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bus"><span className="flex items-center gap-2"><Bus className="w-4 h-4" />Bus</span></SelectItem>
                  <SelectItem value="flight"><span className="flex items-center gap-2"><Plane className="w-4 h-4" />Flight</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Logo URL (optional)</label>
              <Input placeholder="https://…" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name.trim() || saving} onClick={handleCreate}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Operator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Operator</DialogTitle>
            <DialogDescription>Update {editTarget?.name}'s details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Name</label>
              <Input placeholder={editTarget?.name} value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Logo URL</label>
              <Input placeholder={editTarget?.logoUrl ?? "https://…"} value={editForm.logoUrl ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, logoUrl: e.target.value }))} />
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
