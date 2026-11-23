import { useEffect, useState, type FormEvent } from "react"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, ArrowRight, Download, Eye, EyeOff, Landmark, Loader2, Scale, ShieldCheck, Handshake } from "lucide-react"
import { loginSchema, type LoginInput, useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const PILLARS = [
  { icon: Scale, title: "Ledger integrity", text: "Double-entry, append-only, balanced per currency." },
  { icon: Landmark, title: "Safeguarding", text: "Every customer rand, pula and dollar backed 1:1." },
  { icon: Handshake, title: "Trade escrow", text: "Cross-border disputes resolved on the record." },
]

const ICON = "/icons/icon-512.png"

/** Browser "install app" support: Chrome/Edge fire beforeinstallprompt; iOS needs Share → Add to Home Screen. */
function useInstall() {
  const [prompt, setPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone
    if (standalone) setInstalled(true)
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled) }
  }, [])
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return {
    installed,
    canPrompt: !!prompt,
    ios,
    install: async () => { if (!prompt) return; prompt.prompt(); await prompt.userChoice.catch(() => null); setPrompt(null) },
  }
}

export default function Login() {
  const { login, isLoggingIn } = useAuth()
  const [, setLocation] = useLocation()
  const install = useInstall()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"email" | "password", string>>>({})
  const [loginError, setLoginError] = useState<string | null>(null)
  // Step 2: shown only after the password is accepted and MFA is on.
  const [pending, setPending] = useState<LoginInput | null>(null)
  const [code, setCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)
  const [iosHint, setIosHint] = useState(false)

  const errText = (err: any) =>
    err?.response?.data?.error || err?.response?.data?.message || err?.message || "Those details didn't match. Please try again."

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    const parsed = loginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      const errs: typeof fieldErrors = {}
      for (const i of parsed.error.issues) errs[i.path[0] as "email" | "password"] ??= i.message
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})
    try {
      await login({ email: parsed.data.email, password: parsed.data.password })
      setLocation("/")
    } catch (err: any) {
      if (err?.response?.status === 428) {
        setCode(""); setCodeError(null); setPending({ email: parsed.data.email, password: parsed.data.password })
        return
      }
      setLoginError(errText(err))
    }
  }

  const submitCode = async (value = code) => {
    if (!pending || value.length !== 6 || isLoggingIn) return
    setCodeError(null)
    try {
      await login({ ...pending, otp: value })
      setPending(null)
      setLocation("/")
    } catch (err: any) {
      setCodeError(errText(err))
      setCode("")
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0B0820] text-white relative overflow-hidden">
      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-violet-600/30 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[460px] w-[460px] rounded-full bg-fuchsia-600/20 blur-[140px]" />
        <div className="absolute -bottom-48 left-1/3 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
          backgroundSize: "56px 56px", maskImage: "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
        }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        {/* Top bar */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <img src={ICON} alt="" className="h-9 w-9 rounded-[10px] shadow-lg shadow-violet-900/50" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">BukkaPay</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-violet-300/80">Console</p>
            </div>
          </div>
          {!install.installed && (install.canPrompt || install.ios) && (
            <button onClick={() => (install.canPrompt ? install.install() : setIosHint(true))}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur transition hover:bg-white/10">
              <Download className="h-3.5 w-3.5" /> Install app
            </button>
          )}
        </header>

        <main className="grid flex-1 items-center gap-12 py-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          {/* Story */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="hidden lg:block">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Restricted · Authorised staff
            </p>
            <h1 className="font-['Fraunces',serif] text-5xl font-semibold leading-[1.05] tracking-tight xl:text-6xl">
              The control room for <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-emerald-300 bg-clip-text text-transparent">Africa's money.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/60">
              Oversee wallets, merchants, trade escrow and safeguarding across ZAR, BWP and USD with every action signed, approved and logged.
            </p>
            <div className="mt-10 grid max-w-lg gap-3">
              {PILLARS.map(({ icon: Icon, title, text }, i) => (
                <motion.div key={title} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }}
                  className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 ring-1 ring-white/10">
                    <Icon className="h-4 w-4 text-violet-200" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-[13px] text-white/50">{text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Sign-in card */}
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto w-full max-w-md">
            <div className="rounded-[28px] bg-gradient-to-b from-white/15 to-white/[0.03] p-px shadow-2xl shadow-black/40">
              <div className="rounded-[27px] bg-[#120D2B]/90 p-7 backdrop-blur-xl sm:p-9">
                <div className="mb-8 text-center">
                  <img src={ICON} alt="BukkaPay Console" className="mx-auto mb-5 h-16 w-16 rounded-[18px] shadow-xl shadow-violet-900/60" />
                  <h2 className="text-2xl font-semibold tracking-tight">Sign in to the console</h2>
                  <p className="mt-1.5 text-sm text-white/50">Use your BukkaPay staff account.</p>
                </div>

                <AnimatePresence>
                  {loginError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
                      <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                        <p className="text-sm font-medium text-red-200">{loginError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={onSubmit} className="space-y-5" noValidate>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Work email</span>
                    <Input type="email" autoComplete="username" placeholder="you@bukkapay.com" value={email} onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!fieldErrors.email}
                      className={`h-12 rounded-xl border-white/10 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:ring-violet-400 ${fieldErrors.email ? "border-red-400/60" : ""}`} />
                    {fieldErrors.email && <span className="text-xs font-medium text-red-300">{fieldErrors.email}</span>}
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Password</span>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••••" value={password}
                        onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldErrors.password}
                        className={`h-12 rounded-xl border-white/10 bg-white/[0.04] pr-11 text-white placeholder:text-white/30 focus-visible:ring-violet-400 ${fieldErrors.password ? "border-red-400/60" : ""}`} />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-3 flex items-center text-white/40 transition hover:text-white">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {fieldErrors.password && <span className="text-xs font-medium text-red-300">{fieldErrors.password}</span>}
                  </label>
                  <Button type="submit" disabled={isLoggingIn}
                    className="group h-12 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[15px] font-semibold text-white shadow-lg shadow-violet-900/40 hover:opacity-95">
                    {isLoggingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
                      : <>Continue<ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" /></>}
                  </Button>
                </form>

                <div className="mt-7 flex items-start gap-2.5 border-t border-white/[0.07] pt-5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <p className="text-xs leading-relaxed text-white/45">
                    Protected by authenticator codes. Access is by invitation only, and every sign-in and action is recorded in the audit log.
                  </p>
                </div>
              </div>
            </div>
          </motion.section>
        </main>

        <footer className="flex flex-col items-center justify-between gap-2 py-6 text-[11px] text-white/35 sm:flex-row">
          <p>© {new Date().getFullYear()} BukkaPay Technologies</p>
          <p>Unauthorised access is prohibited and reported.</p>
        </footer>
      </div>

      {/* MFA step */}
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) { setPending(null); setCode("") } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="items-center text-center">
            <img src={ICON} alt="" className="mb-2 h-12 w-12 rounded-[14px]" />
            <DialogTitle>Enter your authenticator code</DialogTitle>
            <DialogDescription>Open your authenticator app and enter the 6-digit code for BukkaPay ({pending?.email}).</DialogDescription>
          </DialogHeader>
          {codeError && <p role="alert" className="text-center text-sm font-medium text-destructive">{codeError}</p>}
          <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
            aria-label="Authenticator code" className="h-14 text-center text-2xl tracking-[0.5em]" value={code}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) submitCode(v) }} />
          <Button className="h-11 w-full" disabled={code.length !== 6 || isLoggingIn} onClick={() => submitCode()}>
            {isLoggingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : <><ShieldCheck className="mr-2 h-4 w-4" />Verify and sign in</>}
          </Button>
        </DialogContent>
      </Dialog>

      {/* iPhone / iPad install hint */}
      <Dialog open={iosHint} onOpenChange={setIosHint}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="items-center text-center">
            <img src={ICON} alt="" className="mb-2 h-14 w-14 rounded-[16px]" />
            <DialogTitle>Install BukkaPay Console</DialogTitle>
            <DialogDescription>In Safari, tap the Share button, then <b>Add to Home Screen</b>. It opens full-screen like an app and always loads the latest version.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
