"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Modal, Notice, PageHeader, Table } from "@/components/ui"
import { useReloadMerchant } from "@/components/merchant-context"

type Plan = {
  code: string; name: string; tagline: string | null; description: string | null; highlighted: boolean; isDefault: boolean
  trialDays: number; features: string[]; limits: Record<string, number | boolean | string | null>
  currency: string; monthly: string | null; yearly: string | null
}
type Sub = {
  planCode: string; billingCycle: "monthly" | "yearly"; price: string; status: string; periodEnd: string | null
  trialEndsAt: string | null; nextPlanCode: string | null
}
type Charge = { id: string; planCode: string; kind: string; currency: string; amount: string; credit: string; status: string; createdAt: string }
type View = {
  currency: string; balance: string; canChange: boolean; current: Plan | null; subscription: Sub | null; plans: Plan[]
  usage: Record<string, number>; limitLabels: Record<string, string>; charges: Charge[]
}
type Cycle = "monthly" | "yearly"

const COUNTED = ["staff_seats", "checkout_links", "qr_codes"] as const

/** Plan & billing: the business's plan, what it uses against the limits,
 *  every published plan priced in its currency, and charge history. Plans
 *  are paid from the business balance; the API has the final say on every
 *  rule (app/plans/service.py). */
export default function PlanPage() {
  const { id } = useParams<{ id: string }>()
  const reloadMerchant = useReloadMerchant()
  const { data, error, loading, reload } = useData<View>(`/merchants/${id}/plan`)
  const [cycle, setCycle] = useState<Cycle>("monthly")
  const [picked, setPicked] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  if (loading && !data) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return null

  const sub = data.subscription
  const current = data.current
  const ccy = data.currency
  const onTrial = !!sub?.trialEndsAt && new Date(sub.trialEndsAt) > new Date()
  const yearlySaving = (p: Plan) => {
    if (!p.monthly || !p.yearly || Number(p.monthly) === 0) return null
    const pct = Math.round((1 - Number(p.yearly) / (Number(p.monthly) * 12)) * 100)
    return pct > 0 ? pct : null
  }
  const priceOf = (p: Plan) => (cycle === "monthly" ? p.monthly : p.yearly)
  const anyYearly = data.plans.some((p) => p.yearly !== null && Number(p.yearly) > 0)

  const confirm = async () => {
    if (!picked) return
    setBusy(true); setMsg(null)
    try {
      const r = await api<{ result: string; charged?: string; credit?: string }>(`/merchants/${id}/plan`, {
        method: "POST", json: { planCode: picked.code, billingCycle: cycle },
      })
      const text = r.result === "trial" ? `Your ${picked.trialDays}-day ${picked.name} trial has started. No charge today.`
        : r.result === "scheduled" ? `You'll move to ${picked.name} when the current period ends.`
        : r.result === "kept" ? `You're staying on ${picked.name}.`
        : `You're on ${picked.name}.` + (r.charged && Number(r.charged) > 0 ? ` ${money(r.charged, ccy)} was taken from your business balance.` : "")
      setMsg({ tone: "success", text }); setPicked(null); reload(); reloadMerchant()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
    finally { setBusy(false) }
  }
  const cancel = async () => {
    setBusy(true); setMsg(null)
    try {
      await api(`/merchants/${id}/plan/cancel`, { method: "POST" })
      setMsg({ tone: "success", text: "Done. You'll keep your plan until the end of the period you've paid for." }); reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
    finally { setBusy(false) }
  }

  const pickedPrice = picked ? priceOf(picked) : null
  const isUpgrade = picked && pickedPrice !== null && sub
    ? Number(pickedPrice) / (cycle === "yearly" ? 12 : 1) >= Number(sub.price) / (sub.billingCycle === "yearly" ? 12 : 1)
    : true

  return (
    <>
      <PageHeader title="Plan & billing" subtitle={`Plans are paid from your BukkaPay business balance in ${ccy}. No card needed, and you can change or cancel any time.`} />
      {msg && <div className="mb-4" role="status"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <Card className="lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Current plan</p>
          {current ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-display text-2xl font-semibold">{current.name}</p>
                {sub && <Badge value={onTrial ? "trial" : sub.status} />}
              </div>
              <p className="text-sm text-ink-muted">{current.tagline}</p>
              {sub ? (
                <p className="mt-3 text-sm">
                  {Number(sub.price) > 0 ? <>{money(sub.price, ccy)} / {sub.billingCycle === "yearly" ? "year" : "month"} · </> : "Free · "}
                  {onTrial ? `trial ends ${when(sub.trialEndsAt)}` : sub.periodEnd ? `${sub.nextPlanCode ? "ends" : "renews"} ${when(sub.periodEnd)}` : ""}
                </p>
              ) : <p className="mt-3 text-sm">Free, for as long as you like.</p>}
              {sub?.status === "past_due" && (
                <div className="mt-3"><Notice tone="warn">Your renewal couldn't be paid from your balance. We retry daily for a week, then move you to the free plan.</Notice></div>
              )}
              {sub?.nextPlanCode && (
                <div className="mt-3"><Notice>
                  Moving to {data.plans.find((p) => p.code === sub.nextPlanCode)?.name ?? sub.nextPlanCode} when this period ends.{" "}
                  {data.canChange && current && <button className="underline font-semibold" onClick={() => { setCycle(sub.billingCycle); setPicked(current) }}>Stay on {current.name}</button>}
                </Notice></div>
              )}
            </>
          ) : <p className="mt-2 text-sm text-ink-muted">You're on BukkaPay's standard terms. Plans are being finalised and will appear here.</p>}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Business balance</p>
          <p className="mt-1 font-display text-2xl font-semibold">{money(data.balance, ccy)}</p>
          <p className="mt-1 text-xs text-ink-muted">Plan fees are taken from here. Upgrades credit the days you haven't used.</p>
        </Card>
      </div>

      {current && Object.keys(current.limits ?? {}).length > 0 && (
        <Card className="mb-8">
          <p className="font-semibold mb-4">What you're using</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {COUNTED.map((k) => {
              const limit = current.limits?.[k] as number | null | undefined
              const used = data.usage[k] ?? 0
              const pct = typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span>{data.limitLabels[k]}</span>
                    <span className="font-semibold">{used}{typeof limit === "number" ? ` / ${limit}` : " · unlimited"}</span></div>
                  <div className="mt-2 h-2 rounded-full bg-surface dark:bg-white/10" aria-hidden>
                    <div className={`h-2 rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${typeof limit === "number" ? pct : 100}%`, opacity: typeof limit === "number" ? 1 : 0.25 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Plans</h2>
          <p className="text-sm text-ink-muted">Prices in {ccy}. Transaction fees apply on every plan.</p>
        </div>
        {anyYearly && (
          <div role="radiogroup" aria-label="Billing cycle" className="inline-flex rounded-full border border-line p-1 dark:border-white/10">
            {(["monthly", "yearly"] as Cycle[]).map((c) => (
              <button key={c} role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${cycle === c ? "bg-brand-600 text-white" : "text-ink-soft dark:text-white/70"}`}>
                {c === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        )}
      </div>

      {!data.plans.length ? <Empty>Plans are being finalised. You'll be able to choose one here soon.</Empty> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
          {data.plans.map((p) => {
            const price = priceOf(p)
            const isCurrent = current?.code === p.code && (!sub || sub.billingCycle === cycle || Number(sub.price) === 0)
            const saving = cycle === "yearly" ? yearlySaving(p) : null
            return (
              <Card key={p.code} className={`flex flex-col ${p.highlighted ? "border-brand-600 ring-1 ring-brand-600" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-semibold">{p.name}</p>
                  {p.highlighted ? <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">Most popular</span>
                    : isCurrent ? <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">Current</span> : null}
                </div>
                <p className="text-sm text-ink-muted min-h-[2.5rem]">{p.tagline}</p>
                <p className="mt-3">
                  {price === null ? <span className="text-sm text-ink-muted">Not offered {cycle} in {ccy}</span>
                    : Number(price) === 0 ? <span className="font-display text-3xl font-semibold">Free</span>
                    : <><span className="font-display text-3xl font-semibold">{money(price, ccy)}</span><span className="text-sm text-ink-muted"> / {cycle === "monthly" ? "month" : "year"}</span></>}
                </p>
                {saving && <p className="text-xs font-semibold text-emerald-600">Save {saving}% with yearly</p>}
                {p.trialDays > 0 && price !== null && Number(price) > 0 && <p className="text-xs text-ink-muted mt-1">{p.trialDays}-day free trial</p>}
                <ul className="mt-4 space-y-1.5 text-sm flex-1">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-brand-600">✓</span>{f}</li>)}
                </ul>
                <Button className="mt-5 w-full" variant={p.highlighted ? "primary" : "secondary"}
                  disabled={!data.canChange || price === null || (isCurrent && !sub?.nextPlanCode)}
                  onClick={() => { setMsg(null); setPicked(p) }}>
                  {isCurrent ? "Current plan" : price === null ? "Unavailable" : `Choose ${p.name}`}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
      {!data.canChange && <div className="mb-8"><Notice>Only the business owner can change the plan.</Notice></div>}
      {data.canChange && sub && Number(sub.price) > 0 && !sub.nextPlanCode && (
        <p className="mb-10 text-sm text-ink-muted">Want to stop paying? <button className="underline font-semibold" disabled={busy} onClick={cancel}>Cancel at the end of this period</button>, and you'll move to the free plan.</p>
      )}

      <h2 className="font-display text-xl font-semibold mb-3">Billing history</h2>
      {!data.charges.length ? <Empty>No plan charges yet.</Empty> : (
        <Table head={["Date", "Plan", "Type", "Amount", "Credit", "Status"]}>
          {data.charges.map((c) => (
            <tr key={c.id} className="border-t border-line dark:border-white/10">
              <td className="px-4 py-3">{when(c.createdAt)}</td>
              <td className="px-4 py-3">{data.plans.find((p) => p.code === c.planCode)?.name ?? c.planCode}</td>
              <td className="px-4 py-3 capitalize">{c.kind}</td>
              <td className="px-4 py-3">{money(c.amount, c.currency)}</td>
              <td className="px-4 py-3">{Number(c.credit) > 0 ? money(c.credit, c.currency) : "—"}</td>
              <td className="px-4 py-3"><Badge value={c.status} /></td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!picked} title={picked ? `Switch to ${picked.name}` : ""} onClose={() => setPicked(null)}>
        {picked && (
          <div className="space-y-4 text-sm">
            {pickedPrice !== null && Number(pickedPrice) === 0 ? <p>{picked.name} is free.</p>
              : picked.trialDays > 0 && !sub?.trialEndsAt ? <p>Your {picked.trialDays}-day free trial starts now. After it, {money(pickedPrice, ccy)} per {cycle === "monthly" ? "month" : "year"} is taken from your business balance. Cancel any time before then and you pay nothing.</p>
              : isUpgrade ? <p>{money(pickedPrice, ccy)} per {cycle === "monthly" ? "month" : "year"}, taken from your business balance now. Any unused days on your current plan are credited against it, and it renews automatically.</p>
              : <p>You keep {current?.name} until {when(sub?.periodEnd)}, then move to {picked.name} at {money(pickedPrice, ccy)} per {cycle === "monthly" ? "month" : "year"}.</p>}
            <p className="text-ink-muted">Business balance: {money(data.balance, ccy)}</p>
            <Button className="w-full" disabled={busy} onClick={confirm}>{busy ? "Working…" : "Confirm"}</Button>
          </div>
        )}
      </Modal>
    </>
  )
}
