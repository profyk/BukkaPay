import { useState } from "react"
import { motion } from "framer-motion"
import { Loader2, AlertCircle, Save, Globe2, ShieldCheck, ArrowRight } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useCorridors, useUpdateCorridor, type Corridor } from "@/hooks/use-corridors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permissions"

const CURRENCY_LABEL: Record<string, string> = {
  USD: "US Dollar",
  ZAR: "South African Rand",
  BWP: "Botswana Pula",
}

interface Draft {
  exchangeRate: string
  feePercentage: string
  feeFixed: string
  minAmount: string
  maxAmount: string
  isActive: boolean
}

function toDraft(c: Corridor): Draft {
  return {
    exchangeRate: c.exchangeRate,
    feePercentage: c.feePercentage,
    feeFixed: c.feeFixed,
    minAmount: c.minAmount,
    maxAmount: c.maxAmount,
    isActive: c.isActive,
  }
}

function CorridorCard({ corridor }: { corridor: Corridor }) {
  const updateCorridor = useUpdateCorridor()
  const { toast } = useToast()
  const [draft, setDraft] = useState<Draft>(toDraft(corridor))
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(corridor))

  const set = (key: keyof Draft, value: string | boolean) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const sampleAmount = 1000
  const rate = parseFloat(draft.exchangeRate) || 0
  const feePct = parseFloat(draft.feePercentage) || 0
  const feeFixed = parseFloat(draft.feeFixed) || 0
  const fee = sampleAmount * (feePct / 100) + feeFixed
  const received = (sampleAmount - fee) * rate

  const handleSave = async () => {
    for (const [key, value] of Object.entries(draft)) {
      if (key === "isActive") continue
      const n = parseFloat(value as string)
      if (isNaN(n) || n < 0) {
        toast({ title: "Invalid value", description: `${key} must be a positive number.`, variant: "destructive" })
        return
      }
    }
    setSaving(true)
    try {
      await updateCorridor.mutateAsync({ id: corridor.id, ...draft })
      toast({ title: "Corridor updated", description: `${corridor.fromCurrency} → ${corridor.toCurrency} pricing saved.` })
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-background border border-border flex items-center gap-1.5">
            <span className="text-sm font-bold text-foreground">{corridor.fromCurrency}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{corridor.toCurrency}</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {CURRENCY_LABEL[corridor.fromCurrency]} → {CURRENCY_LABEL[corridor.toCurrency]}
            </p>
            <p className="text-xs text-muted-foreground">Cross-border transfer pricing for this corridor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{draft.isActive ? "Active" : "Disabled"}</span>
            <Switch checked={draft.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </div>
          <Button size="sm" variant={dirty ? "default" : "outline"} disabled={saving || !dirty} onClick={handleSave} className="min-w-[90px]">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save</>}
          </Button>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Exchange Rate</label>
          <Input type="number" min="0" step="0.000001" value={draft.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} />
          <p className="text-xs text-muted-foreground">1 {corridor.fromCurrency} = this many {corridor.toCurrency}</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Fee Rate</label>
          <div className="relative flex items-center">
            <Input type="number" min="0" step="0.01" value={draft.feePercentage} onChange={(e) => set("feePercentage", e.target.value)} className="pr-16" />
            <span className="absolute right-3 text-xs text-muted-foreground">% of amount</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Flat Fee</label>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-sm font-semibold text-muted-foreground">{corridor.fromCurrency}</span>
            <Input type="number" min="0" step="0.01" value={draft.feeFixed} onChange={(e) => set("feeFixed", e.target.value)} className="pl-14" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Min Amount</label>
            <Input type="number" min="0" step="0.01" value={draft.minAmount} onChange={(e) => set("minAmount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Max Amount</label>
            <Input type="number" min="0" step="0.01" value={draft.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="mx-6 mb-6 bg-muted/40 border border-border rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Live preview — sending {corridor.fromCurrency} {sampleAmount.toLocaleString()}
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="font-bold text-foreground">{corridor.fromCurrency} {sampleAmount.toFixed(2)}</p>
          </div>
          <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-3">
            <p className="text-xs text-destructive/70">Fee</p>
            <p className="font-bold text-destructive">−{corridor.fromCurrency} {fee.toFixed(2)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">Recipient gets</p>
            <p className="font-bold text-emerald-700 dark:text-emerald-400">{corridor.toCurrency} {received.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CorridorsPage() {
  const { data: corridors, isLoading, isError, error } = useCorridors()
  const perms = usePermissions()

  if (!perms.isSuperAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
          <ShieldCheck className="w-14 h-14 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Super Admin Required</h2>
          <p className="text-muted-foreground max-w-sm">Cross-border corridor pricing is restricted to Super Admins only.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Globe2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-display">Cross-Border Corridors</h1>
            <p className="text-muted-foreground mt-1">
              Set the exchange rate and fee BukkaPay applies whenever money moves between USD, ZAR, and BWP wallets —
              this is what powers "Send Abroad" pricing for every African country, since every country a user sends
              to settles into one of these three currencies.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <p className="font-semibold">Failed to load corridors</p>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          corridors?.map((c) => <CorridorCard key={c.id} corridor={c} />)
        )}
      </motion.div>
    </AppLayout>
  )
}
