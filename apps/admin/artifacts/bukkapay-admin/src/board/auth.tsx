import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { useLocation } from "wouter"
import { ArrowRight, Eye, EyeOff, KeyRound, LineChart, Loader2, LockKeyhole, ShieldCheck } from "lucide-react"
import { boardApi, errorText, setToken } from "./api"
import { ThemeToggle } from "./theme-toggle"

const SERIF = { fontFamily: "Fraunces, Georgia, serif" }

/** Split-screen shell: brand story on the left, the form on the right. */
function Shell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background text-foreground">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#010C38] text-white p-12 xl:p-16">
        {/* quiet depth: two soft glows and a fine grid */}
        <div aria-hidden className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(closest-side, #2a78d6, transparent)" }} />
        <div aria-hidden className="absolute -bottom-48 -right-24 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-25"
          style={{ background: "radial-gradient(closest-side, #eb6834, transparent)" }} />
        <div aria-hidden className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "48px 48px",
                   maskImage: "radial-gradient(ellipse at 30% 40%, #000 30%, transparent 75%)", WebkitMaskImage: "radial-gradient(ellipse at 30% 40%, #000 30%, transparent 75%)" }} />

        <div className="relative flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl ring-1 ring-white/15" />
          <div className="leading-tight"><p className="font-semibold tracking-tight">BukkaPay</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">Board &amp; Investors</p></div>
        </div>

        <div className="relative max-w-xl">
          <p className="text-xs uppercase tracking-[0.22em] text-[#8fb8ee] mb-5">Investor relations</p>
          <h2 className="text-5xl xl:text-6xl leading-[1.05] tracking-tight" style={SERIF}>
            Building Africa's<br />everyday money network.
          </h2>
          <p className="mt-6 text-lg text-white/70 max-w-md leading-relaxed">
            One place for the people backing BukkaPay to follow the company: growth, revenue, profitability, cash and runway, straight from our books.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              [LineChart, "Numbers from the ledger", "Revenue and volume come straight from the double-entry ledger, not a spreadsheet."],
              [ShieldCheck, "Company totals only", "No customer or merchant is ever shown. Every view is logged."],
              [KeyRound, "Two-step sign-in", "Your password plus a code emailed to you, every time."],
            ].map(([Icon, t, d]: any) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white/[0.07] ring-1 ring-white/10 flex items-center justify-center"><Icon className="w-4 h-4 text-[#8fb8ee]" /></span>
                <div><p className="font-medium">{t}</p><p className="text-sm text-white/60">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/45">Confidential. For invited board members and investors of BukkaPay only.</p>
      </aside>

      <main className="relative flex flex-col">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold tracking-tight">BukkaPay</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex-1 flex items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[400px]">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</p>
            <h1 className="mt-3 text-4xl tracking-tight" style={SERIF}>{title}</h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <p className="mt-10 text-xs text-muted-foreground flex items-center gap-1.5"><LockKeyhole className="w-3.5 h-3.5" />Access is by invitation from BukkaPay's owner.</p>
          </div>
        </div>
      </main>
    </div>
  )
}

const inputCls = "w-full h-12 rounded-xl border border-border bg-background px-4 text-[15px] outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-[#2a78d6] focus:ring-4 focus:ring-[#2a78d6]/15"

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span><input className={inputCls} {...props} /></label>
}

function PasswordField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="relative block">
        <input {...props} type={show ? "text" : "password"} className={`${inputCls} pr-12`} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </span>
    </label>
  )
}

function Submit({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy || disabled}
      className="group w-full h-12 rounded-xl bg-[#010C38] text-white font-medium inline-flex items-center justify-center gap-2 transition hover:bg-[#0a1a55] disabled:opacity-50 dark:bg-white dark:text-[#010C38] dark:hover:bg-white/90">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{children}
      {!busy && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
    </button>
  )
}

const Alert = ({ children }: { children: ReactNode }) =>
  <p role="alert" className="text-sm rounded-xl border border-destructive/30 bg-destructive/5 text-destructive px-3 py-2">{children}</p>

export function LoginPage() {
  const [, go] = useLocation()
  const [step, setStep] = useState<"password" | "code">("password")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      if (step === "password") {
        await boardApi.post("/auth/login", { email, password })
        setStep("code"); setPassword("")
      } else {
        const { data } = await boardApi.post("/auth/verify", { email, code })
        setToken(data.token); go("/")
      }
    } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  return step === "password" ? (
    <Shell eyebrow="Board portal" title="Welcome back" subtitle="Sign in to see how BukkaPay is doing.">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email" type="email" autoComplete="username" required placeholder="you@fund.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Submit busy={busy}>Continue</Submit>
      </form>
    </Shell>
  ) : (
    <Shell eyebrow="Step 2 of 2" title="Check your email" subtitle={`We sent a 6-digit code to ${email}. It expires in 10 minutes.`}>
      <form onSubmit={submit} className="space-y-5">
        <label className="block space-y-2 text-sm"><span className="font-medium">Sign-in code</span>
          <input className={`${inputCls} text-center text-2xl tracking-[0.5em] font-semibold tabular-nums`} inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} required autoFocus placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        </label>
        {error && <Alert>{error}</Alert>}
        <Submit busy={busy} disabled={code.length !== 6}>Sign in</Submit>
        <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => { setStep("password"); setCode(""); setError(null) }}>
          Use a different email or resend the code
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
    <Shell eyebrow="All set" title="Your access is ready" subtitle="Sign in with your new password. We'll email you a code each time.">
      <button onClick={() => go("/login")} className="w-full h-12 rounded-xl bg-[#010C38] text-white font-medium dark:bg-white dark:text-[#010C38]">Go to sign in</button>
    </Shell>
  )
  return (
    <Shell eyebrow="Invitation" title="Join the board portal" subtitle="Choose a password of at least 12 characters to accept your invitation.">
      {!token ? <Alert>This link is missing its invitation code. Open the link from your email again.</Alert> : (
        <form onSubmit={submit} className="space-y-5">
          <PasswordField label="Password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-[#2a78d6]" : "bg-[#eb6834]") : "bg-muted"}`} />)}
          </div>
          <PasswordField label="Confirm password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Submit busy={busy}>Accept invitation</Submit>
        </form>
      )}
    </Shell>
  )
}
