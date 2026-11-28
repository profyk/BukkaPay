"use client"

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react"

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200",
    secondary: "bg-white border border-line text-ink hover:bg-surface dark:bg-white/5 dark:text-white dark:border-white/10",
    ghost: "text-ink-soft hover:bg-surface dark:text-white/70 dark:hover:bg-white/5",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant]
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-ink dark:text-white">{label}</span>
      {children}
      {error
        ? <span role="alert" className="block text-xs font-medium text-red-600 dark:text-red-400">{error}</span>
        : hint && <span className="block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

const inputCls = "w-full h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-white/5 dark:border-white/10 dark:text-white"

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />
}

/** Password / PIN field with a show-hide toggle. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${inputCls} pr-11 ${props.className ?? ""}`} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"}
              className="absolute inset-y-0 right-3 flex items-center text-ink-muted hover:text-ink dark:text-white/50 dark:hover:text-white">
        {show
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white p-5 dark:bg-white/[0.03] dark:border-white/10 ${className}`}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const TONES: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", settled: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", partial: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", processing: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", rejected: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", cancelled: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/70",
  expired: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/70", refund: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", not_submitted: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/70",
}

export function Badge({ value }: { value?: string | null }) {
  if (!value) return null
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TONES[value] ?? "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/80"}`}>{value.replace(/_/g, " ")}</span>
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </Card>
  )
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "bg-brand-50 text-brand-900 border-brand-100 dark:bg-brand-500/10 dark:text-brand-100 dark:border-brand-500/20", error: "bg-red-50 text-red-800 border-red-100 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20",
    success: "bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20", warn: "bg-amber-50 text-amber-900 border-amber-100 dark:bg-amber-500/10 dark:text-amber-100 dark:border-amber-500/20",
  }[tone]
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-ink-muted">{children}</div>
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white dark:bg-white/[0.03] dark:border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface dark:bg-white/5">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold text-ink-muted">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line dark:divide-white/10">{children}</tbody>
      </table>
    </div>
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-[#15151f]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink dark:text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
