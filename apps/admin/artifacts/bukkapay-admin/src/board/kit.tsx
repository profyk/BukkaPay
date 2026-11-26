import { useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ResponsiveContainer } from "recharts"
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Info, Loader2, X } from "lucide-react"
import { boardApi, errorText } from "./api"

// Validated categorical order (see boardroom.css): emerald, blue, gold, magenta.
// SVG presentation attributes can't use CSS var(), so chart colours are read
// from the live theme at render time (pages remount when the theme changes).
export function cssVar(name: string) {
  return typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
export const C = {
  get s1() { return cssVar("--s1") || "#0b8f63" }, get s2() { return cssVar("--s2") || "#257de0" },
  get s3() { return cssVar("--s3") || "#b97c08" }, get s4() { return cssVar("--s4") || "#e24d8b" },
  get good() { return cssVar("--good") || "#0b8f63" }, get bad() { return cssVar("--bad") || "#c2410c" },
  get grid() { return `hsl(${cssVar("--border")})` }, get ink() { return `hsl(${cssVar("--muted-foreground")})` },
  get muted() { return `hsl(${cssVar("--muted")})` },
}
// For HTML (not SVG) styles, CSS variables work directly.
export const S1 = "var(--s1)", S2 = "var(--s2)", S3 = "var(--s3)", S4 = "var(--s4)"
export const GOOD = "var(--good)", BAD = "var(--bad)"
export const axis = { get tick() { return { fill: C.ink, fontSize: 12 } }, axisLine: false, tickLine: false }

// ─── formatting (money arrives as decimal strings; Number() only for display) ─
export const monthLabel = (m: string) => new Date(m.slice(0, 10) + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })
export const dateLabel = (d?: string | null) => d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"
export const dateTime = (d?: string | null) => d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
export function num(v?: number | string | null, dp = 1) {
  if (v == null || v === "") return "—"
  const n = typeof v === "string" ? Number(v) : v
  if (!Number.isFinite(n)) return String(v)
  return new Intl.NumberFormat(undefined, { notation: Math.abs(n) >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: Math.abs(n) >= 1_000_000 ? dp : 2 }).format(n)
}
export const money = (v?: number | string | null, ccy?: string) => v == null || v === "" ? "—" : `${ccy ? ccy + " " : ""}${num(v)}`
export const pct = (v?: number | string | null) => v == null ? "—" : `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)}%`
export const label = (s?: string | null) => (s ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
export const toN = (v: any) => v == null || v === "" ? null : Number(v)

// ─── layout ─────────────────────────────────────────────────────────────────
export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "Fraunces, Georgia, serif" }}>{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 br-noprint">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ title, note, actions, children, className = "" }: { title?: string; note?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-card border border-border rounded-2xl p-4 sm:p-5 break-inside-avoid min-w-0 ${className}`}>
      {(title || actions) && (
        <div className="flex items-start gap-2 mb-3">
          <div className="mr-auto min-w-0">
            {title && <h2 className="font-semibold">{title}</h2>}
            {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Kpi({ label: l, value, sub, tone, hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad"; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 min-w-0 relative overflow-hidden" title={hint}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--s1)] via-[var(--br-gold)] to-transparent opacity-70" />
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className="text-xl sm:text-2xl font-semibold mt-1 tabular-nums break-words">{value}</p>
      {sub != null && <p className={`text-xs mt-1 ${tone === "good" ? "text-[var(--good)]" : tone === "bad" ? "text-[var(--bad)]" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  )
}

export const toneOf = (v?: number | string | null) => v == null ? undefined : Number(v) >= 0 ? "good" as const : "bad" as const

export function Grid({ cols = "md:grid-cols-2", children }: { cols?: string; children: ReactNode }) {
  return <div className={`grid gap-4 ${cols}`}>{children}</div>
}

export function Chart({ children, height = 240 }: { children: ReactNode; height?: number }) {
  return <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer></div>
}

export function Tip({ active, payload, label: l, fmt, labelFmt = monthLabel }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium mb-1">{labelFmt ? labelFmt(String(l)) : l}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey + p.name} className="flex items-center gap-2 text-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />{p.name}: <span className="tabular-nums">{fmt ? fmt(p.value) : num(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function Table<T>({ rows, cols, empty = "Nothing to show yet.", reverse = false }: { rows: T[]; cols: [string, (r: T) => ReactNode, string?][]; empty?: string; reverse?: boolean }) {
  if (!rows.length) return <Empty text={empty} />
  const list = reverse ? [...rows].reverse() : rows
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">{cols.map(([h, , a]) => <th key={h} className={`font-medium text-muted-foreground py-2 px-1 pr-4 whitespace-nowrap ${a === "r" ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>{list.map((r, i) => <tr key={i} className="border-b border-border/60 align-top">{cols.map(([h, f, a]) => <td key={h} className={`py-2 px-1 pr-4 ${a === "r" ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{f(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function Empty({ text, icon = true }: { text: ReactNode; icon?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
      {icon && <CircleDashed className="w-4 h-4 mt-0.5 shrink-0" />}<div>{text}</div>
    </div>
  )
}

export function Notes({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground space-y-1">
      {items.map((t) => <p key={t} className="flex gap-2"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t}</p>)}
    </div>
  )
}

export function Banner({ tone = "warn", children }: { tone?: "warn" | "info" | "bad"; children: ReactNode }) {
  const cls = tone === "bad" ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-800 dark:text-red-100"
    : tone === "info" ? "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-100"
    : "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100"
  return <div className={`text-sm rounded-xl border p-3 ${cls}`}>{children}</div>
}

const STATUS: Record<string, [string, typeof CheckCircle2]> = {
  on_track: ["text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10", CheckCircle2],
  completed: ["text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10", CheckCircle2],
  needs_attention: ["text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-500/10", AlertTriangle],
  behind_target: ["text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-500/10", AlertTriangle],
  no_data: ["text-muted-foreground bg-muted", CircleSlash],
}
const GOODS = ["active", "live", "operational", "published", "reconciled", "passed", "completed", "signed", "credited", "approved", "received", "held", "present", "open"]
const WARNS = ["pilot", "in_development", "draft", "pending", "under_review", "invited", "in_progress", "in_discussion", "proposed", "sandbox", "scheduled", "mitigating", "management", "committed", "partially_received", "apologies"]
const BADS = ["unreconciled", "suspended", "revoked", "failed", "not_passed", "no_quorum", "delayed", "cancelled", "withdrawn", "high", "behind_target", "disabled", "expired", "absent", "rejected"]

export function Status({ value, text }: { value?: string | null; text?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  if (STATUS[value]) {
    const [cls, Icon] = STATUS[value]
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}><Icon className="w-3 h-3" />{text ?? label(value)}</span>
  }
  const cls = GOODS.includes(value) ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10"
    : WARNS.includes(value) ? "text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-500/10"
    : BADS.includes(value) ? "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-500/10" : "text-muted-foreground bg-muted"
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{text ?? label(value)}</span>
}

export function PerCurrency({ rows, field = "amount" }: { rows?: any[]; field?: string }) {
  if (!rows?.length) return <span className="text-muted-foreground">—</span>
  return <span className="inline-flex flex-col tabular-nums">{rows.map((r) => <span key={r.currency}>{r.currency} {num(r[field])}</span>)}</span>
}

// ─── reporting period ───────────────────────────────────────────────────────
export type PeriodState = { kind: string; start?: string; end?: string }
export function usePeriod(initial = "month") {
  const [p, setP] = useState<PeriodState>({ kind: initial })
  const params: Record<string, string> = { kind: p.kind }
  if (p.start) params.start = p.start
  if (p.kind === "custom" && p.end) params.end = p.end
  const ready = p.kind !== "custom" || (!!p.start && !!p.end)
  return { p, setP, params, ready }
}

export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (p: PeriodState) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Reporting period" value={value.kind} onChange={(e) => onChange({ kind: e.target.value })}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm">
        {[["day", "Today"], ["week", "This week"], ["month", "This month"], ["quarter", "This quarter"], ["year", "This year"], ["custom", "Custom…"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {value.kind !== "custom" && (
        <input type="date" aria-label="Period containing" value={value.start ?? ""} onChange={(e) => onChange({ ...value, start: e.target.value || undefined })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm" title="Show the period containing this date" />
      )}
      {value.kind === "custom" && (
        <>
          <input type="date" aria-label="From" value={value.start ?? ""} onChange={(e) => onChange({ ...value, start: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          <span className="text-muted-foreground text-sm">to</span>
          <input type="date" aria-label="To" value={value.end ?? ""} onChange={(e) => onChange({ ...value, end: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
        </>
      )}
    </div>
  )
}

export function PeriodLine({ period, previous }: { period?: any; previous?: any }) {
  if (!period) return null
  return <span>{period.label}{previous ? ` · compared with ${previous.label}` : ""}</span>
}

// ─── forms ──────────────────────────────────────────────────────────────────
const ctl = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40"
export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{l}</span>{children}{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</label>
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${ctl} ${p.className ?? ""}`} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${ctl} ${p.className ?? ""}`} />
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} {...p} className={`${ctl} ${p.className ?? ""}`} />

export function Btn({ children, onClick, kind = "primary", busy, disabled, type = "button", small }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "outline" | "danger"; busy?: boolean; disabled?: boolean; type?: "button" | "submit"; small?: boolean }) {
  const k = kind === "primary" ? "bg-primary text-primary-foreground hover:opacity-90"
    : kind === "danger" ? "bg-red-600 text-white hover:bg-red-700"
    : kind === "outline" ? "border border-border hover:bg-muted" : "hover:bg-muted"
  return (
    <button type={type} onClick={onClick} disabled={busy || disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium disabled:opacity-50 ${small ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm"} ${k}`}>
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}{children}
    </button>
  )
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-4"><h2 className="font-semibold mr-auto">{title}</h2><button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button></div>
        {children}
      </div>
    </div>
  )
}

/** POST/PUT/PATCH with cache refresh and a visible error. */
export function useAction(method: "post" | "put" | "patch" | "delete", invalidate: string[] = []) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: any }) => (await boardApi.request({ method, url: path, data: body })).data,
    onSuccess: () => { setError(null); invalidate.forEach((k) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(k) })) },
    onError: (e) => setError(errorText(e)),
  })
  return { run: (path: string, body?: any) => m.mutateAsync({ path, body }), busy: m.isPending, error, setError }
}

export function ErrorLine({ text }: { text?: string | null }) {
  return text ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{text}</p> : null
}

export function Loading({ q }: { q: { isLoading: boolean; error: unknown } }) {
  if (q.isLoading) return <p className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading…</p>
  if (q.error) return <Banner tone="bad">{errorText(q.error)}</Banner>
  return null
}

export function Legend({ items }: { items: [string, string][] }) {
  return <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">{items.map(([n, c]) => <span key={n} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{n}</span>)}</div>
}
