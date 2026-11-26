import { useState, type FormEvent, type ReactNode } from "react"
import { useLocation } from "wouter"
import { Loader2, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { boardApi, errorText, setToken } from "./api"

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl" />
          <div><p className="font-semibold">BukkaPay</p><p className="text-xs text-muted-foreground">Board portal</p></div>
        </div>
        <div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground mt-1">{subtitle}</p></div>
        {children}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><LockKeyhole className="w-3.5 h-3.5" />By invitation only. Confidential.</p>
      </div>
    </div>
  )
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span><Input {...props} /></label>
}

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

  return (
    <Shell title={step === "password" ? "Sign in" : "Check your email"}
      subtitle={step === "password" ? "For BukkaPay board members and investors." : `We sent a 6-digit code to ${email}. It expires in 10 minutes.`}>
      <form onSubmit={submit} className="space-y-3">
        {step === "password" ? (
          <>
            <Field label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        ) : (
          <Field label="Sign-in code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || (step === "code" && code.length !== 6)}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{step === "password" ? "Continue" : "Sign in"}
        </Button>
        {step === "code" && <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { setStep("password"); setCode("") }}>Start again</button>}
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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("The passwords don't match"); return }
    setBusy(true); setError(null)
    try { await boardApi.post("/auth/accept", { token, password }); setDone(true) }
    catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }

  if (done) return (
    <Shell title="You're all set" subtitle="Your password is saved. Sign in with it; we'll email you a code each time.">
      <Button className="w-full" onClick={() => go("/login")}>Go to sign in</Button>
    </Shell>
  )
  return (
    <Shell title="Accept your invitation" subtitle="Choose a password of at least 12 characters.">
      {!token ? <p className="text-sm text-destructive">This link is missing its invitation code. Open the link from your email again.</p> : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field label="Confirm password" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save password</Button>
        </form>
      )}
    </Shell>
  )
}
