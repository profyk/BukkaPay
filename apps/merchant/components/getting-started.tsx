"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useData } from "@/lib/hooks"
import { Card } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type PlanView = { subscription: unknown | null; usage: Record<string, number> }
type Detail = { bankName: string | null }

/** Owner's setup checklist on the Overview. Disappears once everything is
 *  done, or when dismissed (remembered on this device). */
export function GettingStarted({ id, payments }: { id: string; payments: number }) {
  const merchant = useMerchant()
  const owner = merchant?.role === "owner"
  const key = `bukkapay_setup_dismissed_${id}`
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1") } catch { setHidden(false) } }, [key])
  const plan = useData<PlanView>(owner ? `/merchants/${id}/plan` : null)
  const detail = useData<Detail>(owner ? `/merchants/${id}` : null)
  if (!owner || hidden || !plan.data || !detail.data) return null

  const kyb = merchant?.kybStatus
  const steps = [
    { done: kyb === "approved", label: kyb === "pending" ? "Verification under review" : "Verify your business", href: "/verification",
      hint: kyb === "pending" ? "Usually 1–2 business days." : "Required before you can accept payments." },
    { done: !!detail.data.bankName, label: "Add your payout bank account", href: "/settlements", hint: "Where your sales are paid out." },
    { done: (plan.data.usage.qr_codes ?? 0) > 0, label: "Print your QR code", href: "/qr", hint: "Customers scan to pay at the till." },
    { done: !!plan.data.subscription, label: "Choose a plan", href: "/plan", hint: "Start free; upgrade when you grow." },
    { done: (plan.data.usage.staff_seats ?? 0) > 0, label: "Invite your team", href: "/staff", hint: "Cashiers take payments; you keep control." },
    { done: payments > 0, label: "Take your first payment", href: "/qr", hint: "Try it with a BukkaPay customer." },
  ]
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Get set up</p>
          <p className="text-sm text-ink-muted">{done} of {steps.length} done</p>
        </div>
        <button className="text-xs text-ink-muted hover:text-ink" onClick={() => { try { localStorage.setItem(key, "1") } catch { /* ignore */ } setHidden(true) }}>Hide</button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-surface dark:bg-white/10" aria-hidden>
        <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={`/m/${id}${s.href}`} className={`flex gap-3 rounded-xl border p-3 transition hover:border-brand-500 ${s.done ? "border-line opacity-70 dark:border-white/10" : "border-line dark:border-white/10"}`}>
              <span aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 text-[11px] font-bold flex items-center justify-center ${s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line dark:border-white/20"}`}>{s.done ? "✓" : ""}</span>
              <span>
                <span className={`block text-sm font-semibold ${s.done ? "line-through" : ""}`}>{s.label}</span>
                <span className="block text-xs text-ink-muted">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}
