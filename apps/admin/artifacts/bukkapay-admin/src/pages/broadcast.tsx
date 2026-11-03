import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Megaphone, Bell, CheckCircle2, Loader2, Info, AlertTriangle } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useBroadcast } from "@/hooks/use-broadcast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

const TYPE_CONFIG = {
  info:    { label: "Info",    icon: Info,          color: "text-blue-600",   bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" },
  success: { label: "Success", icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" },
  warning: { label: "Warning", icon: AlertTriangle,  color: "text-amber-600",  bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" },
  alert:   { label: "Alert",   icon: Bell,           color: "text-red-600",    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" },
}

export default function BroadcastPage() {
  const broadcast = useBroadcast()
  const { toast } = useToast()
  const [form, setForm] = useState({ type: "info", title: "", message: "" })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lastSent, setLastSent] = useState<{ sent: number; title: string } | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const typeConf = TYPE_CONFIG[form.type as keyof typeof TYPE_CONFIG]
  const TypeIcon = typeConf.icon

  const handleSend = async () => {
    try {
      const result = await broadcast.mutateAsync(form)
      setLastSent({ sent: result.sent, title: form.title })
      setForm({ type: "info", title: "", message: "" })
      toast({ title: "Broadcast sent", description: `Delivered to ${result.sent} users.` })
    } catch (e: any) {
      toast({ title: "Failed to send", description: e.message, variant: "destructive" })
    } finally {
      setConfirmOpen(false)
    }
  }

  const ready = form.title.trim() && form.message.trim()

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-3xl font-display">Broadcast</h1>
          <p className="text-muted-foreground mt-1">Send an in-app notification to all BukkaPay users at once.</p>
        </div>

        <AnimatePresence>
          {lastSent && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800 rounded-2xl px-5 py-4"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                <span className="font-semibold">"{lastSent.title}"</span> was sent to <span className="font-semibold">{lastSent.sent.toLocaleString()} users</span>.
              </p>
              <button onClick={() => setLastSent(null)} className="ml-auto text-emerald-600 hover:text-emerald-800 text-xs underline">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <div className="p-2.5 rounded-xl bg-primary/10"><Megaphone className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="font-semibold text-foreground">Compose Message</h2>
              <p className="text-xs text-muted-foreground">Will appear in every user's notification centre</p>
            </div>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Notification Type</label>
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <v.icon className={`w-4 h-4 ${v.color}`} />
                      {v.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Title</label>
            <Input placeholder="e.g. Platform maintenance scheduled" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
            <p className="text-xs text-muted-foreground text-right">{form.title.length}/80</p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Message</label>
            <Textarea
              placeholder="Write the notification body here…"
              rows={5}
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{form.message.length}/500</p>
          </div>

          {/* Preview */}
          {(form.title || form.message) && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-muted-foreground">Preview</label>
              <div className={`rounded-xl border p-4 ${typeConf.bg}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <TypeIcon className={`w-4 h-4 ${typeConf.color}`} />
                  <p className={`font-semibold text-sm ${typeConf.color}`}>{form.title || "Notification title"}</p>
                </div>
                <p className="text-sm text-foreground/80">{form.message || "Notification body…"}</p>
              </div>
            </div>
          )}

          <Button className="w-full" size="lg" disabled={!ready || broadcast.isPending} onClick={() => setConfirmOpen(true)}>
            {broadcast.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Megaphone className="w-5 h-5 mr-2" />}
            Send to All Users
          </Button>
        </div>
      </motion.div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send broadcast to all users?</AlertDialogTitle>
            <AlertDialogDescription>
              Every active BukkaPay user will receive the notification <strong>"{form.title}"</strong>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} disabled={broadcast.isPending}>
              {broadcast.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Send Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  )
}
