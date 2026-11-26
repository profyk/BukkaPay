import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"
import { AlertCircle, Eye, EyeOff, Lock, Loader2, Mail } from "lucide-react"
import { boardApi, errorText, setToken } from "./api"

/* A copy of the customer app sign-in (apps/customer/pages/login.tsx +
   components/AuthHero.tsx), with the customer theme's exact colours
   (lib/theme.ts, light and dark). Only what can't apply to an invite-only
   portal is left out: Google sign-in, "Forgot?" and "Sign Up". */

const ICON = "/icons/icon-512.png" // same file as apps/customer/assets/logo.png

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-white text-[#1A1A2E] dark:bg-[#0D0D1A] dark:text-[#F1F1FF]">
      {/* AuthHero */}
      <header className="relative overflow-hidden rounded-b-[32px] bg-[#010C38] px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))] pb-16">
        <div aria-hidden className="absolute -top-[120px] -right-20 h-[280px] w-[280px] rounded-full bg-[rgba(0,82,255,0.35)]" />
        <div aria-hidden className="absolute -bottom-[140px] -left-[100px] h-[300px] w-[300px] rounded-full bg-[rgba(34,211,238,0.14)]" />
        <div className="relative mx-auto flex w-full max-w-[480px] flex-col items-center">
          <img src={ICON} alt="BukkaPay" className="h-[72px] w-[72px] rounded-[18px]" />
          <p className="mt-3.5 text-[26px] font-extrabold tracking-[-0.5px] text-white">BukkaPay</p>
          <p className="mt-1 text-center text-[15px] text-white/[0.72]">Africa's money, without borders.</p>
          <div className="mt-[18px] flex flex-wrap justify-center gap-2">
            {["ZAR · BWP · USD", "Free transfers", "Escrow for traders"].map((c) => (
              <span key={c} className="rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/[0.85]">{c}</span>
            ))}
          </div>
        </div>
      </header>

      {/* Card */}
      <main className="relative mx-auto -mt-10 w-[92%] max-w-[480px] rounded-3xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:border-[#2D2D45] dark:bg-[#1E1E30]">
        <h1 className="mb-2 text-center text-[28px] font-bold">{title}</h1>
        <p className="mb-7 text-center text-sm text-[#9CA3AF] dark:text-[#6B6B90]">{subtitle}</p>
        {children}
        <div className="my-6 flex items-center">
          <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2D2D45]" />
          <span className="px-3 text-sm text-[#9CA3AF] dark:text-[#6B6B90]">or</span>
          <span className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#2D2D45]" />
        </div>
        <p className="mt-2 text-center text-sm text-[#9CA3AF] dark:text-[#6B6B90]">
          Need access? <span className="font-semibold text-[#7C3AED]">Ask BukkaPay for an invitation</span>
        </p>
      </main>

      <footer className="mt-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-2xl font-bold">BukkaPay</p>
        <p className="mt-1 text-sm italic text-[#9CA3AF] dark:text-[#6B6B90]">The Pulse of African Finance</p>
      </footer>
    </div>
  )
}

const boxCls = "flex items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] dark:border-[#2D2D45] dark:bg-[#252538]"
const fieldCls = "min-w-0 flex-1 bg-transparent px-2.5 py-3.5 text-base text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] dark:text-[#F1F1FF] dark:placeholder:text-[#6B6B90]"
const iconCls = "ml-3 h-5 w-5 shrink-0 text-[#9CA3AF] dark:text-[#6B6B90]"

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="mb-1 block">
      <span className="mb-2 block text-sm font-medium">{text}</span>
      {children}
    </label>
  )
}

function TextInput({ icon: Icon, ...props }: { icon: typeof Mail } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={boxCls}>
      <Icon className={iconCls} />
      <input {...props} className={fieldCls} />
    </div>
  )
}

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className={boxCls}>
      <Lock className={iconCls} />
      <input {...props} type={show ? "text" : "password"} className={fieldCls} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
        className="py-3.5 pr-3 text-[#9CA3AF] dark:text-[#6B6B90]">
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

function Submit({ busy, disabled, busyText, children }: { busy: boolean; disabled?: boolean; busyText: string; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled} aria-label={busy ? busyText : undefined}
      className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#7C3AED] py-4 text-lg font-semibold text-white disabled:opacity-60">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
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
    <Shell title="Welcome Back" subtitle="Sign in to your BukkaPay board account">
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-4">
        <Label text="Email"><TextInput icon={Mail} type="email" autoComplete="username" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Label>
        <Label text="Password"><PasswordInput autoComplete="current-password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
        <Submit busy={busy} busyText="Checking…">Sign In</Submit>
      </form>
    </Shell>
  ) : (
    <Shell title="Check your email" subtitle={`Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`}>
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-4">
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" aria-label="Sign-in code"
          className="h-14 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-center text-2xl tracking-[0.5em] outline-none dark:border-[#2D2D45] dark:bg-[#252538]" value={code}
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
        <form onSubmit={submit} className="space-y-4">
          <Label text="New password"><PasswordInput autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-[#E5E7EB] dark:bg-[#2D2D45]"}`} />)}
          </div>
          <Label text="Confirm password"><PasswordInput autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Label>
          <Submit busy={busy} busyText="Saving…">Accept invitation</Submit>
        </form>
      )}
    </Shell>
  )
}
