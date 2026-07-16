import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2, AlertCircle, Save, ArrowRightLeft, Link2,
  CreditCard, Banknote, Users, Gift, CheckCircle2, ShieldCheck,
} from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { usePricing, useUpdatePricing, type PricingConfig } from "@/hooks/use-pricing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { usePermissions } from "@/lib/permissions"

interface FieldDef { key: string; label: string; suffix?: string; prefix?: string; hint?: string }

const SECTIONS: {
  id: keyof PricingConfig
  label: string
  description: string
  icon: any
  iconColor: string
  fields: FieldDef[]
}[] = [
  {
    id: "transfer",
    label: "Transfers",
    description: "Fees applied to all P2P and wallet-to-wallet transfers",
    icon: ArrowRightLeft,
    iconColor: "text-blue-500",
    fields: [
      { key: "fee_percentage", label: "Fee Rate", suffix: "% of amount", hint: "Percentage charged on each transfer" },
      { key: "fee_fixed", label: "Flat Fee", prefix: "R", hint: "Fixed amount charged regardless of transfer size" },
      { key: "min_amount", label: "Minimum Amount", prefix: "R", hint: "Smallest transfer amount allowed" },
      { key: "max_amount", label: "Maximum Amount", prefix: "R", hint: "Largest single transfer allowed" },
    ],
  },
  {
    id: "payment_link",
    label: "Payment Links",
    description: "Fees on payments collected through BukkaPay payment links",
    icon: Link2,
    iconColor: "text-purple-500",
    fields: [
      { key: "fee_percentage", label: "Fee Rate", suffix: "% of payment" },
      { key: "fee_fixed", label: "Flat Fee", prefix: "R" },
      { key: "min_amount", label: "Minimum Amount", prefix: "R" },
      { key: "max_amount", label: "Maximum Amount", prefix: "R" },
    ],
  },
  {
    id: "virtual_card",
    label: "Virtual Cards",
    description: "Fees for issuing and maintaining BukkaPay virtual cards",
    icon: CreditCard,
    iconColor: "text-indigo-500",
    fields: [
      { key: "issuance_fee", label: "Card Issuance Fee", prefix: "R", hint: "One-time fee to issue a virtual card" },
      { key: "monthly_fee", label: "Monthly Maintenance Fee", prefix: "R" },
      { key: "transaction_fee_percentage", label: "Transaction Fee Rate", suffix: "% per transaction" },
    ],
  },
  {
    id: "withdrawal",
    label: "Withdrawals",
    description: "Fees and limits on cash-out and bank withdrawal transactions",
    icon: Banknote,
    iconColor: "text-emerald-500",
    fields: [
      { key: "fee_fixed", label: "Flat Withdrawal Fee", prefix: "R" },
      { key: "fee_percentage", label: "Variable Fee Rate", suffix: "%" },
      { key: "min_amount", label: "Minimum Withdrawal", prefix: "R" },
      { key: "max_amount", label: "Maximum Withdrawal", prefix: "R" },
    ],
  },
  {
    id: "stokvel",
    label: "Stokvels",
    description: "Management fees applied to stokvel savings groups",
    icon: Users,
    iconColor: "text-amber-500",
    fields: [
      { key: "management_fee_percentage", label: "Management Fee Rate", suffix: "% of pot" },
    ],
  },
  {
    id: "loyalty",
    label: "Loyalty Rewards",
    description: "Points earning and redemption configuration",
    icon: Gift,
    iconColor: "text-rose-500",
    fields: [
      { key: "points_per_rand", label: "Points per R1 Spent", suffix: "pts/R", hint: "How many points a user earns for every rand spent" },
      { key: "redemption_rate", label: "Redemption Rate", suffix: "pts = R1", hint: "How many points are worth R1 when redeeming" },
    ],
  },
]

function FeePreview({ config }: { config: PricingConfig }) {
  const t = config.transfer
  const sampleAmount = 500
  const fee = sampleAmount * (t.fee_percentage / 100) + t.fee_fixed
  const received = sampleAmount - fee
  return (
    <div className="bg-muted/40 border border-border rounded-2xl p-5 space-y-3">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide text-xs">Live Transfer Preview</p>
      <p className="text-xs text-muted-foreground">For a {formatCurrency(sampleAmount)} transfer:</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Sent</p>
          <p className="font-bold text-foreground">{formatCurrency(sampleAmount)}</p>
        </div>
        <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-3">
          <p className="text-xs text-destructive/70">Fee</p>
          <p className="font-bold text-destructive">−{formatCurrency(fee)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-xl p-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400">Received</p>
          <p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(received)}</p>
        </div>
      </div>
    </div>
  )
}

export default function PricingPage() {
  const { data: pricing, isLoading, isError, error } = usePricing()
  const updatePricing = useUpdatePricing()
  const { toast } = useToast()
  const perms = usePermissions()

  const [drafts, setDrafts] = useState<Partial<Record<keyof PricingConfig, Record<string, string>>>>({})
  const [saved, setSaved] = useState<keyof PricingConfig | null>(null)
  const [saving, setSaving] = useState<keyof PricingConfig | null>(null)

  if (!perms.isSuperAdmin) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
          <ShieldCheck className="w-14 h-14 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold">Super Admin Required</h2>
          <p className="text-muted-foreground max-w-sm">Platform pricing configuration is restricted to Super Admins only.</p>
        </div>
      </AppLayout>
    )
  }

  const getDraft = (id: keyof PricingConfig, key: string): string => {
    if (drafts[id]?.[key] !== undefined) return drafts[id]![key]
    const val = (pricing as any)?.[id]?.[key]
    return val !== undefined ? String(val) : ""
  }

  const setDraft = (id: keyof PricingConfig, key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [key]: value } }))
  }

  const handleSave = async (id: keyof PricingConfig) => {
    const section = SECTIONS.find((s) => s.id === id)!
    const values: Record<string, number> = {}
    for (const f of section.fields) {
      const raw = getDraft(id, f.key)
      const n = parseFloat(raw)
      if (isNaN(n) || n < 0) {
        toast({ title: "Invalid value", description: `${f.label} must be a positive number.`, variant: "destructive" })
        return
      }
      values[f.key] = n
    }
    setSaving(id)
    try {
      await updatePricing.mutateAsync({ category: id, values })
      setSaved(id)
      setDrafts((prev) => { const n = { ...prev }; delete n[id]; return n })
      setTimeout(() => setSaved(null), 2000)
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  const hasDraft = (id: keyof PricingConfig) => !!drafts[id] && Object.keys(drafts[id]!).length > 0

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-display">Platform Pricing</h1>
          <p className="text-muted-foreground mt-1">Configure fees, limits, and reward rates across all BukkaPay services.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 bg-destructive/5 text-destructive rounded-2xl border border-destructive/20 gap-2">
            <AlertCircle className="w-10 h-10" />
            <p className="font-semibold">Failed to load pricing</p>
            <p className="text-sm opacity-80">{(error as any)?.message}</p>
          </div>
        ) : (
          <>
            {pricing && <FeePreview config={pricing} />}

            {SECTIONS.map(({ id, label, description, icon: Icon, iconColor, fields }) => (
              <div key={id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                {/* Section header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-background border border-border">
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={hasDraft(id) ? "default" : "outline"}
                    disabled={saving === id || !hasDraft(id)}
                    onClick={() => handleSave(id)}
                    className="min-w-[90px]"
                  >
                    <AnimatePresence mode="wait">
                      {saving === id ? (
                        <motion.span key="saving" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />Saving
                        </motion.span>
                      ) : saved === id ? (
                        <motion.span key="saved" className="flex items-center gap-1.5 text-emerald-600" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <CheckCircle2 className="w-3.5 h-3.5" />Saved
                        </motion.span>
                      ) : (
                        <motion.span key="save" className="flex items-center gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <Save className="w-3.5 h-3.5" />Save
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Button>
                </div>

                {/* Fields */}
                <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fields.map(({ key, label: flabel, prefix, suffix, hint }) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">{flabel}</label>
                      <div className="relative flex items-center">
                        {prefix && (
                          <span className="absolute left-3 text-sm font-semibold text-muted-foreground">{prefix}</span>
                        )}
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={getDraft(id, key)}
                          onChange={(e) => setDraft(id, key, e.target.value)}
                          className={`${prefix ? "pl-7" : ""} ${suffix ? "pr-24" : ""}`}
                        />
                        {suffix && (
                          <span className="absolute right-3 text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>
                        )}
                      </div>
                      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </motion.div>
    </AppLayout>
  )
}
