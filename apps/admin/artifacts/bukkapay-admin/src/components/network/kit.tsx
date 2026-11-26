import { useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Loader2, Inbox } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { api } from "@/lib/api"

/* ─── data hooks ─────────────────────────────────────────────────────────── */

export function useApi<T = any>(key: unknown[], url: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [...key, params],
    queryFn: async () => (await api.get(url, { params })).data as T,
  })
}

export function errorMessage(e: any): string {
  return e?.response?.data?.error ?? e?.response?.data?.detail?.[0]?.msg ?? e?.message ?? "Request failed"
}

/** POST/PATCH helper that toasts the outcome and refreshes the given queries. */
export function useAction(invalidate: unknown[][] = []) {
  const qc = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (args: { method?: "post" | "put" | "patch" | "delete"; url: string; body?: any; success?: string }) => {
      const res = await api.request({ method: args.method ?? "post", url: args.url, data: args.body })
      return { data: res.data, success: args.success }
    },
    onSuccess: ({ success }) => {
      if (success) toast({ title: success })
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    },
    onError: (e: any) => toast({ title: "Not done", description: errorMessage(e), variant: "destructive" }),
  })
}

/* ─── layout ─────────────────────────────────────────────────────────────── */

export function Page({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode
}) {
  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </motion.div>
    </AppLayout>
  )
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "bad" | "good" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "good"
    ? "text-emerald-600" : "text-foreground"
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

/* ─── table ──────────────────────────────────────────────────────────────── */

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string }

export function DataTable<T>({ rows, columns, loading, error, empty = "Nothing here yet.", rowKey }: {
  rows?: T[]; columns: Column<T>[]; loading?: boolean; error?: unknown; empty?: string
  rowKey: (row: T) => string
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="text-sm">{errorMessage(error)}</p>
      </div>
    )
  }
  if (!rows?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 bg-card rounded-2xl border border-border text-muted-foreground">
        <Inbox className="w-8 h-8 mb-2" />
        <p className="text-sm">{empty}</p>
      </div>
    )
  }
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {columns.map((c) => (
                <th key={c.header} className={`px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-muted/30">
                {columns.map((c) => (
                  <td key={c.header} className={`px-4 py-3 align-top ${c.className ?? ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── status badges ──────────────────────────────────────────────────────── */

const TONES: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  live: "success", active: "success", approved: "success", executed: "success", credited: "success",
  completed: "success", matched: "success", processed: "success", resolved: "success", paid: "success",
  pilot: "warning", pending: "warning", instructed: "warning", sender_debited: "warning", review: "warning",
  submitted: "warning", investigating: "warning", sandbox: "warning", onboarding: "warning", open: "warning",
  suspended: "destructive", failed: "destructive", rejected: "destructive", reversed: "destructive",
  blocked: "destructive", integrity_error: "destructive", amount_mismatch: "destructive", escalated: "destructive",
  unmatched_ledger: "destructive", unmatched_provider: "destructive", duplicate: "destructive", high: "destructive",
}

export function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return <Badge variant={(TONES[value] ?? "secondary") as any}>{value.replace(/_/g, " ")}</Badge>
}

export function Bool({ value, yes = "Yes", no = "No" }: { value?: boolean; yes?: string; no?: string }) {
  return value
    ? <span className="text-emerald-600 font-medium">{yes}</span>
    : <span className="text-muted-foreground">{no}</span>
}

export function when(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString()
}

export function money(amount?: string | number | null, currency?: string | null) {
  if (amount === null || amount === undefined) return "—"
  return `${currency ?? ""} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim()
}

/* ─── form dialog ────────────────────────────────────────────────────────── */

export type Field = {
  name: string; label: string; type?: "text" | "number" | "select" | "textarea" | "checkbox"
  options?: { value: string; label: string }[]; placeholder?: string; required?: boolean; help?: string
}

export function FormDialog({ open, onOpenChange, title, description, fields, initial, submitLabel = "Save", onSubmit, busy }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; fields: Field[]
  initial?: Record<string, any>; submitLabel?: string; busy?: boolean
  onSubmit: (values: Record<string, any>) => unknown
}) {
  const [values, setValues] = useState<Record<string, any>>(initial ?? {})
  const set = (k: string, v: any) => setValues((prev) => ({ ...prev, [k]: v }))
  const missing = fields.some((f) => f.required && (values[f.name] === undefined || values[f.name] === ""))
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setValues(initial ?? {}); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {fields.map((f) => (
            <label key={f.name} className="block space-y-1">
              <span className="text-sm font-semibold">{f.label}{f.required && " *"}</span>
              {f.type === "select" ? (
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  value={values[f.name] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.type === "checkbox" ? (
                <input type="checkbox" className="h-4 w-4" checked={!!values[f.name]}
                       onChange={(e) => set(f.name, e.target.checked)} />
              ) : (
                <Input type={f.type === "number" ? "number" : "text"} step="any" value={values[f.name] ?? ""}
                       placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
              )}
              {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || missing} onClick={async () => { await onSubmit(values); onOpenChange(false) }}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Files a maker-checker approval request and explains what happens next. */
export function useRequestApproval(invalidate: unknown[][] = []) {
  const action = useAction([["approvals"], ...invalidate])
  return (actionName: string, payload: Record<string, any>, reason: string) =>
    action.mutateAsync({
      url: "/admin/approvals", body: { action: actionName, payload, reason },
      success: "Approval requested — a second admin must approve it before it takes effect",
    })
}
