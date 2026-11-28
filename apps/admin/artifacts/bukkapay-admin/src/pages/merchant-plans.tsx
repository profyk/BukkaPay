import { useMemo, useState } from "react"
import { Plus, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DataTable, Page, Section, Stat, StatusBadge, money, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

/* Admin → Merchant plans. Draft plans, set prices per currency and billing
   cycle, publish, retire, choose the default (free) plan, and watch
   subscribers, MRR and charges. Every rule is enforced by the API
   (backend/app/api/admin/plans.py); this page explains them up front. */

type Prices = Record<string, { monthly?: string; yearly?: string }>
type Limits = Record<string, number | boolean | string | null>
type Plan = {
  code: string; name: string; tagline: string | null; description: string | null; status: "draft" | "published" | "retired"
  sortOrder: number; highlighted: boolean; isDefault: boolean; trialDays: number; features: string[]
  limits: Limits; prices: Prices; updatedBy: string | null; updatedAt: string | null
  subscribers: number; mrr: Record<string, string>
}
type Listing = { plans: Plan[]; limitLabels: Record<string, string>; pastDue: number }
type Charge = { id: string; businessName: string; planCode: string; kind: string; currency: string; amount: string; credit: string; status: string; reason: string | null; createdAt: string }

const KEY = ["merchant-plans"]
const isFree = (p: { prices: Record<string, { monthly?: string; yearly?: string }> }) =>
  Object.keys(p.prices).length > 0 && Object.values(p.prices).every((v) => Object.values(v).every((x) => Number(x) === 0))
const CURRENCIES = ["ZAR", "BWP", "USD"]
const COUNT = ["staff_seats", "checkout_links", "qr_codes"]
const BOOLS = ["api_access", "advanced_insights", "custom_branding", "multi_currency", "priority_support"]

export default function MerchantPlansPage() {
  const canManage = usePermissions().can("fees.manage")
  const list = useApi<Listing>(KEY, "/admin/merchant-plans")
  const charges = useApi<Charge[]>(["merchant-plan-charges"], "/admin/merchant-plans/charges")
  const action = useAction([KEY])
  const [editing, setEditing] = useState<Plan | "new" | null>(null)

  const plans = list.data?.plans ?? []
  const totals = useMemo(() => {
    const mrr: Record<string, number> = {}
    let subs = 0
    for (const p of plans) {
      subs += p.subscribers
      for (const [c, v] of Object.entries(p.mrr ?? {})) mrr[c] = (mrr[c] ?? 0) + Number(v)
    }
    return { subs, mrr: Object.entries(mrr) }
  }, [plans])

  const run = (url: string, success: string, method: "post" | "delete" = "post") => action.mutate({ url, method, success })

  return (
    <Page
      title="Merchant plans"
      subtitle="Plans businesses choose in their dashboard (Plan & billing). Draft, price per currency, then publish. Fees are taken from each business's balance; unpaid renewals retry daily for a week, then fall back to the default free plan."
      actions={canManage ? <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4 mr-1" />New plan</Button> : undefined}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Businesses on a plan" value={totals.subs} />
        {totals.mrr.length ? totals.mrr.map(([c, v]) => <Stat key={c} label={`Monthly recurring (${c})`} value={money(v, c)} tone="good" />)
          : <Stat label="Monthly recurring" value="—" />}
        <Stat label="Renewals past due" value={list.data?.pastDue ?? 0} tone={(list.data?.pastDue ?? 0) > 0 ? "warn" : undefined} />
      </div>

      {plans.some((p) => p.status === "draft") && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:bg-amber-500/10 dark:border-amber-500/30">
          <p className="font-semibold">Draft plans are ready for pricing</p>
          <p className="mt-1 text-muted-foreground">Open each plan, set its monthly and yearly prices per currency (leave a cycle empty to not offer it), check the limits, then publish. Nothing changes for any business until a plan is published; limits apply only to published plans.</p>
        </div>
      )}

      <Section title="Catalogue">
        {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {plans.map((p) => (
              <div key={p.code} className={`rounded-2xl border bg-card p-4 flex flex-col ${p.highlighted ? "border-primary" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-lg">{p.name}</p>
                  {p.isDefault && <span title="Default plan" className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold"><Star className="w-3 h-3" />Default</span>}
                  <span className="ml-auto"><StatusBadge value={p.status} /></span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                <p className="text-sm text-muted-foreground mt-1 min-h-[2.5rem]">{p.tagline}</p>
                <div className="mt-3 space-y-1 text-sm">
                  {Object.keys(p.prices).length === 0 ? <p className="text-amber-600 font-medium">No prices yet</p>
                    : Object.entries(p.prices).map(([c, v]) => (
                      <p key={c} className="tabular-nums">{v.monthly !== undefined ? `${money(v.monthly, c)} /mo` : `${c} — /mo`} · {v.yearly !== undefined ? `${money(v.yearly, c)} /yr` : "— /yr"}</p>
                    ))}
                </div>
                <p className="mt-3 text-sm"><span className="font-semibold">{p.subscribers}</span> on this plan
                  {Object.entries(p.mrr ?? {}).map(([c, v]) => <span key={c} className="text-muted-foreground"> · {money(v, c)} MRR</span>)}</p>
                <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-border">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>{canManage ? "Edit" : "View"}</Button>
                  {canManage && p.status !== "published" && p.status !== "retired" && <Button size="sm" onClick={() => run(`/admin/merchant-plans/${p.code}/publish`, `${p.name} published`)}>Publish</Button>}
                  {canManage && p.status === "published" && !p.isDefault && <Button size="sm" variant="outline" onClick={() => run(`/admin/merchant-plans/${p.code}/retire`, `${p.name} retired`)}>Retire</Button>}
                  {canManage && p.status === "published" && p.subscribers === 0 && !p.isDefault && <Button size="sm" variant="ghost" onClick={() => run(`/admin/merchant-plans/${p.code}/unpublish`, `${p.name} back to draft`)}>Unpublish</Button>}
                  {canManage && !p.isDefault && p.status !== "retired" && isFree(p) && <Button size="sm" variant="ghost" onClick={() => run(`/admin/merchant-plans/${p.code}/default`, `${p.name} is now the default`)}>Make default</Button>}
                  {canManage && p.status === "draft" && !p.isDefault && p.subscribers === 0 && (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => run(`/admin/merchant-plans/${p.code}`, `${p.name} deleted`, "delete")}><Trash2 className="w-4 h-4" /></Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent plan charges">
        <DataTable
          rows={charges.data} loading={charges.isLoading} error={charges.error} rowKey={(c) => c.id} empty="No plan charges yet."
          columns={[
            { header: "When", cell: (c) => when(c.createdAt) },
            { header: "Business", cell: (c) => c.businessName },
            { header: "Plan", cell: (c) => c.planCode },
            { header: "Type", cell: (c) => <span className="capitalize">{c.kind}</span> },
            { header: "Amount", className: "text-right", cell: (c) => <span className="tabular-nums">{money(c.amount, c.currency)}</span> },
            { header: "Credit", className: "text-right", cell: (c) => Number(c.credit) > 0 ? money(c.credit, c.currency) : "—" },
            { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          ]}
        />
      </Section>

      <PlanEditor
        plan={editing} labels={list.data?.limitLabels ?? {}} readOnly={!canManage}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </Page>
  )
}

function PlanEditor({ plan, labels, readOnly, onClose, onSaved }: {
  plan: Plan | "new" | null; labels: Record<string, string>; readOnly: boolean; onClose: () => void; onSaved: () => void
}) {
  const isNew = plan === "new"
  const p = plan && plan !== "new" ? plan : null
  const action = useAction([KEY])
  const [form, setForm] = useState<any>(null)
  const [key, setKey] = useState<string | null>(null)
  const openKey = plan ? (isNew ? "new" : p!.code) : null
  if (openKey !== key) {
    setKey(openKey)
    setForm(plan ? {
      code: p?.code ?? "", name: p?.name ?? "", tagline: p?.tagline ?? "", description: p?.description ?? "",
      sortOrder: p?.sortOrder ?? 50, highlighted: p?.highlighted ?? false, trialDays: p?.trialDays ?? 0,
      features: (p?.features ?? []).join("\n"),
      limits: { ...(p?.limits ?? {}) },
      prices: Object.fromEntries([...new Set([...CURRENCIES, ...Object.keys(p?.prices ?? {})])].map((c) => [c, {
        monthly: p?.prices?.[c]?.monthly ?? "", yearly: p?.prices?.[c]?.yearly ?? "" }])),
      newCurrency: "",
    } : null)
  }
  // Closed, or the plan changed this render (the form catches up next render).
  if (!plan || !form || openKey !== key) return null

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const setPrice = (c: string, cycle: "monthly" | "yearly", v: string) => setForm((f: any) => ({ ...f, prices: { ...f.prices, [c]: { ...f.prices[c], [cycle]: v } } }))
  const setLimit = (k: string, v: any) => setForm((f: any) => ({ ...f, limits: { ...f.limits, [k]: v } }))

  const save = () => {
    const body = {
      ...(isNew ? { code: form.code.trim().toLowerCase() } : {}),
      name: form.name, tagline: form.tagline || null, description: form.description || null,
      sortOrder: Number(form.sortOrder) || 0, highlighted: form.highlighted, trialDays: Number(form.trialDays) || 0,
      features: String(form.features).split("\n").map((s: string) => s.trim()).filter(Boolean),
      limits: Object.fromEntries(Object.entries(form.limits).map(([k, v]) => [k, COUNT.includes(k) ? (v === "" || v === null ? null : Number(v)) : v])),
      prices: Object.fromEntries(Object.entries(form.prices as Prices).map(([c, v]) => [c, {
        ...(v.monthly !== "" && v.monthly !== undefined ? { monthly: v.monthly } : {}),
        ...(v.yearly !== "" && v.yearly !== undefined ? { yearly: v.yearly } : {}) }]).filter(([, v]) => Object.keys(v as object).length)),
    }
    action.mutate({ method: isNew ? "post" : "patch", url: isNew ? "/admin/merchant-plans" : `/admin/merchant-plans/${p!.code}`, body,
                    success: isNew ? "Plan drafted" : "Plan saved" }, { onSuccess: onSaved })
  }

  return (
    <Sheet open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isNew ? "New plan" : `${p!.name}`}</SheetTitle>
          <SheetDescription>
            {p?.status === "published" ? "Published: price changes apply to new choices and the next renewal of current subscribers." : "Draft: nothing is visible to businesses until you publish."}
            {p?.updatedBy && <> Last changed {when(p.updatedAt)}.</>}
          </SheetDescription>
        </SheetHeader>
        <fieldset disabled={readOnly} className="mt-6 space-y-5">
          {isNew && <L label="Code" hint="Lowercase, used in reports, can't be changed later (e.g. growth)."><Input value={form.code} onChange={(e) => set("code", e.target.value)} /></L>}
          <div className="grid grid-cols-2 gap-3">
            <L label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></L>
            <L label="Order on the page"><Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></L>
          </div>
          <L label="Tagline"><Input maxLength={160} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} /></L>
          <L label="Description"><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} /></L>

          <div>
            <p className="text-sm font-semibold">Prices</p>
            <p className="text-xs text-muted-foreground mb-2">Leave a cell empty to not offer that cycle in that currency. 0 means free.</p>
            <div className="rounded-xl border border-border divide-y divide-border">
              <div className="grid grid-cols-[70px_1fr_1fr] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground"><span>Currency</span><span>Monthly</span><span>Yearly</span></div>
              {Object.keys(form.prices).map((c) => {
                const m = Number(form.prices[c].monthly), y = Number(form.prices[c].yearly)
                const saving = m > 0 && y > 0 ? Math.round((1 - y / (m * 12)) * 100) : null
                return (
                  <div key={c} className="grid grid-cols-[70px_1fr_1fr] gap-2 px-3 py-2 items-center">
                    <span className="font-mono text-sm">{c}</span>
                    <Input inputMode="decimal" placeholder="—" value={form.prices[c].monthly} onChange={(e) => setPrice(c, "monthly", e.target.value)} />
                    <div>
                      <Input inputMode="decimal" placeholder="—" value={form.prices[c].yearly} onChange={(e) => setPrice(c, "yearly", e.target.value)} />
                      {saving !== null && <p className={`text-[11px] mt-0.5 ${saving > 0 ? "text-emerald-600" : "text-amber-600"}`}>{saving > 0 ? `${saving}% cheaper than monthly` : "Not cheaper than monthly"}</p>}
                    </div>
                  </div>
                )
              })}
              <div className="flex gap-2 px-3 py-2">
                <Input className="w-24" maxLength={3} placeholder="KES" value={form.newCurrency} onChange={(e) => set("newCurrency", e.target.value.toUpperCase())} />
                <Button size="sm" variant="outline" type="button" disabled={!/^[A-Z]{3}$/.test(form.newCurrency) || form.prices[form.newCurrency]}
                  onClick={() => setForm((f: any) => ({ ...f, prices: { ...f.prices, [f.newCurrency]: { monthly: "", yearly: "" } }, newCurrency: "" }))}>Add currency</Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <L label="Free trial (days)" hint="First time only; charged at the end."><Input type="number" min={0} max={365} value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} /></L>
            <label className="flex items-center gap-3 mt-6 text-sm"><Switch checked={form.highlighted} onCheckedChange={(v) => set("highlighted", v)} />Mark as "Most popular"</label>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Limits</p>
            <div className="grid grid-cols-3 gap-3">
              {COUNT.map((k) => (
                <L key={k} label={labels[k] ?? k} hint="Empty = unlimited">
                  <Input type="number" min={0} value={form.limits[k] ?? ""} onChange={(e) => setLimit(k, e.target.value)} />
                </L>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <L label={labels.settlement ?? "Payout schedule"}>
                <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={String(form.limits.settlement ?? "weekly")} onChange={(e) => setLimit("settlement", e.target.value)}>
                  <option value="weekly">Weekly</option><option value="daily">Daily</option><option value="instant">Instant</option>
                </select>
              </L>
              <L label="Fee discount (basis points)" hint="100 = 1% off transaction fees."><Input type="number" min={0} max={500} value={Number(form.limits.fee_discount_bps ?? 0)} onChange={(e) => setLimit("fee_discount_bps", Number(e.target.value))} /></L>
            </div>
            <div className="mt-3 space-y-2">
              {BOOLS.map((k) => (
                <label key={k} className="flex items-center gap-3 text-sm"><Switch checked={!!form.limits[k]} onCheckedChange={(v) => setLimit(k, v)} />{labels[k] ?? k}</label>
              ))}
            </div>
          </div>

          <L label="Features shown to businesses" hint="One per line, up to 20."><Textarea rows={6} value={form.features} onChange={(e) => set("features", e.target.value)} /></L>
        </fieldset>
        {!readOnly && (
          <div className="mt-6 flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={action.isPending || !form.name.trim() || (isNew && !form.code.trim())}>{action.isPending ? "Saving…" : isNew ? "Save draft" : "Save"}</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}
