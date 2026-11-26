import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, Eye, EyeOff, Lock, Loader2, Mail, ShieldCheck } from "lucide-react"
import { boardApi, errorText, setToken } from "./api"
import { ThemeToggle } from "./theme-toggle"

/* Same layout as the customer app sign-in (apps/customer/pages/login.tsx):
   deep-blue brand header, one centred card overlapping it, brand footer. */

const ICON = "/icons/icon-512.png"

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#F5F3FF] text-[#1A1A2E] dark:bg-background dark:text-foreground">
      {/* Brand header */}
      <header className="relative overflow-hidden rounded-b-[32px] bg-[#010C38] px-6 pt-14 pb-20 text-white">
        <div aria-hidden className="absolute -top-32 -right-20 h-[280px] w-[280px] rounded-full bg-[rgba(0,82,255,0.35)] blur-2xl" />
        <div aria-hidden className="absolute -bottom-36 -left-24 h-[300px] w-[300px] rounded-full bg-[rgba(34,211,238,0.14)] blur-2xl" />
        <div className="absolute right-4 top-4"><ThemeToggle onDark /></div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="relative mx-auto flex max-w-[480px] flex-col items-center text-center">
          <img src={ICON} alt="BukkaPay" className="h-[72px] w-[72px] rounded-[18px]" />
          <p className="mt-3.5 text-[26px] font-extrabold tracking-tight">BukkaPay</p>
          <p className="mt-1 text-[15px] text-white/70">Board and investor portal</p>
          <div className="mt-[18px] flex flex-wrap justify-center gap-2">
            {["Live company numbers", "Investor updates", "By invitation only"].map((c) => (
              <span key={c} className="rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/85">{c}</span>
            ))}
          </div>
        </motion.div>
      </header>

      {/* Card */}
      <motion.main initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}
        className="relative mx-auto -mt-10 w-[92%] max-w-[480px] rounded-3xl border border-[#E5E7EB] bg-white p-8 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:border-border dark:bg-card">
        <h1 className="text-center text-[28px] font-bold">{title}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-[#6B7280] dark:text-muted-foreground">{subtitle}</p>
        {children}
        <div className="mt-6 flex items-start gap-2.5 border-t border-[#E5E7EB] pt-5 dark:border-border">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
          <p className="text-xs leading-relaxed text-[#6B7280] dark:text-muted-foreground">
            Two-step sign-in with a code emailed to you. Company totals only, never a customer. Every sign-in is recorded.
          </p>
        </div>
      </motion.main>

      <footer className="pb-8 pt-8 text-center">
        <p className="text-2xl font-bold">BukkaPay</p>
        <p className="mt-1 text-sm italic text-[#6B7280] dark:text-muted-foreground">The Pulse of African Finance</p>
      </footer>
    </div>
  )
}

const boxCls = "flex items-center rounded-xl border border-[#E5E7EB] bg-white focus-within:border-[#7C3AED] focus-within:ring-2 focus-within:ring-[#7C3AED]/20 dark:border-border dark:bg-background"
const fieldCls = "min-w-0 flex-1 bg-transparent px-2.5 py-3.5 text-base outline-none placeholder:text-[#9CA3AF] dark:placeholder:text-muted-foreground"

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{text}</span>
      {children}
    </label>
  )
}

function TextInput({ icon: Icon, ...props }: { icon: typeof Mail } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={boxCls}>
      <Icon className="ml-3 h-5 w-5 shrink-0 text-[#6B7280] dark:text-muted-foreground" />
      <input {...props} className={fieldCls} />
    </div>
  )
}

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className={boxCls}>
      <Lock className="ml-3 h-5 w-5 shrink-0 text-[#6B7280] dark:text-muted-foreground" />
      <input {...props} type={show ? "text" : "password"} className={fieldCls} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
        className="px-3 py-3.5 text-[#6B7280] transition hover:text-[#1A1A2E] dark:text-muted-foreground dark:hover:text-foreground">
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

function Submit({ busy, disabled, busyText, children }: { busy: boolean; disabled?: boolean; busyText: string; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#7C3AED] py-4 text-lg font-semibold text-white transition hover:bg-[#6D28D9] disabled:opacity-60">
      {busy ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{busyText}</> : children}
    </button>
  )
}

function ErrorBox({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-400/30 dark:bg-red-500/10">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm font-medium text-red-700 dark:text-red-200">{text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function LoginPage() {
  const [, go] = useLocation()
  const [step, setStep] = useState<"password" | "code">("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e?: FormEvent, value = code) => {
    e?.preventDefault(); if (busy) return
    setBusy(true); setError(null)
    try {
      if (step === "password") {
        await boardApi.post("/auth/login", { email: email.trim(), password })
        setStep("code"); setPassword("")
      } else {
        const { data } = await boardApi.post("/auth/verify", { email: email.trim(), code: value })
        setToken(data.token); go("/")
      }
    } catch (err) { setError(errorText(err)); if (step === "code") setCode("") } finally { setBusy(false) }
  }

  return step === "password" ? (
    <Shell title="Welcome Back" subtitle="Sign in to the BukkaPay board portal">
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-5">
        <Label text="Email"><TextInput icon={Mail} type="email" autoComplete="username" required placeholder="you@fund.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Label>
        <Label text="Password"><PasswordInput autoComplete="current-password" required placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
        <Submit busy={busy} busyText="Checking…">Sign In</Submit>
      </form>
    </Shell>
  ) : (
    <Shell title="Check your email" subtitle={`Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`}>
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-5">
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" aria-label="Sign-in code"
          className="h-14 w-full rounded-xl border border-[#E5E7EB] bg-white text-center text-2xl tracking-[0.5em] outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 dark:border-border dark:bg-background" value={code}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) void submit(undefined, v) }} />
        <Submit busy={busy} disabled={code.length !== 6} busyText="Verifying…">Verify and sign in</Submit>
        <button type="button" className="w-full text-sm font-semibold text-[#7C3AED]" onClick={() => { setStep("password"); setCode(""); setError(null) }}>
          Use a different email or send a new code
        </button>
      </form>
    </Shell>
  )
}

export function AcceptPage() {
  const [, go] = useLocation()
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const strength = [password.length >= 12, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("The passwords don't match"); return }
    setBusy(true); setError(null)
    try { await boardApi.post("/auth/accept", { token, password }); setDone(true) }
    catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  if (done) return (
    <Shell title="Your access is ready" subtitle="Sign in with your new password. We'll email you a code each time.">
      <form onSubmit={(e) => { e.preventDefault(); go("/login") }}><Submit busy={false} busyText="">Go to sign in</Submit></form>
    </Shell>
  )
  return (
    <Shell title="Accept your invitation" subtitle="Choose a password of at least 12 characters.">
      <ErrorBox text={token ? error : "This link is missing its invitation code. Open the link from your email again."} />
      {token && (
        <form onSubmit={submit} className="space-y-5">
          <Label text="New password"><PasswordInput autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-[#E5E7EB] dark:bg-muted"}`} />)}
          </div>
          <Label text="Confirm password"><PasswordInput autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Label>
          <Submit busy={busy} busyText="Saving…">Accept invitation</Submit>
        </form>
      )}
    </Shell>
  )
}
