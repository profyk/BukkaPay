import { useEffect, useState, type FormEvent } from "react"
import { useLocation } from "wouter"
import { Copy, KeyRound, Loader2, Mail } from "lucide-react"
import { boardApi, errorText, setToken } from "./api"
import { ErrorBox, Label, PasswordInput, Shell, Submit, TextInput } from "./auth"

const codeCls = "h-14 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-center text-2xl tracking-[0.5em] outline-none dark:border-[#2D2D45] dark:bg-[#252538]"
const linkCls = "w-full text-sm font-semibold text-[#0B8F63] dark:text-[#10B981]"

function CodeInput({ value, onChange, onComplete, label = "Authenticator code" }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; label?: string }) {
  return (
    <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" aria-label={label}
      className={codeCls} value={value}
      onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); onChange(v); if (v.length === 6) onComplete?.(v) }} />
  )
}

function Strength({ password }: { password: string }) {
  const strength = [password.length >= 12, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-emerald-400" : "bg-amber-400") : "bg-[#E5E7EB] dark:bg-[#2D2D45]"}`} />)}
    </div>
  )
}

/** Authenticator set-up: a link that opens the app on this device, and the key to type in on another. */
function AuthenticatorKey({ secret, uri }: { secret: string; uri: string }) {
  const [copied, setCopied] = useState(false)
  const grouped = secret.replace(/(.{4})/g, "$1 ").trim()
  return (
    <div className="rounded-xl border border-[#E5E7EB] dark:border-[#2D2D45] p-4 space-y-3 text-sm">
      <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-[#0B8F63] dark:text-[#10B981]" />Set up your authenticator app</p>
      <ol className="list-decimal pl-5 space-y-1 text-[#6B7280] dark:text-[#A0A0C0]">
        <li>Open Google Authenticator, Microsoft Authenticator or 1Password.</li>
        <li>Add an account with this setup key, or <a className="font-semibold text-[#0B8F63] dark:text-[#10B981] underline" href={uri}>open it in the app on this device</a>.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg bg-[#F9FAFB] dark:bg-[#252538] px-3 py-2 font-mono text-sm tracking-wide">{grouped}</code>
        <button type="button" aria-label="Copy setup key" onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="rounded-lg border border-[#E5E7EB] dark:border-[#2D2D45] p-2"><Copy className="h-4 w-4" /></button>
      </div>
      {copied && <p className="text-xs text-[#0B8F63]">Copied</p>}
    </div>
  )
}

export function LoginPage() {
  const [, go] = useLocation()
  const [step, setStep] = useState<"password" | "totp" | "email">("password")
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
        const { data } = await boardApi.post("/auth/login", { email: email.trim(), password })
        setStep(data.method === "email" ? "email" : "totp"); setPassword("")
      } else {
        const { data } = await boardApi.post("/auth/verify", { email: email.trim(), code: value })
        setToken(data.token); go(data.member?.mfaSetupRequired ? "/mfa" : "/")
      }
    } catch (err) { setError(errorText(err)); if (step !== "password") setCode("") } finally { setBusy(false) }
  }

  if (step === "password") return (
    <Shell title="Welcome Back" subtitle="Sign in to BukkaPay Boardroom">
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-4">
        <Label text="Email"><TextInput icon={Mail} type="email" autoComplete="username" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Label>
        <Label text="Password"><PasswordInput autoComplete="current-password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
        <div className="text-right -mt-1"><a href="/forgot" className="text-sm font-semibold text-[#0B8F63] dark:text-[#10B981]">Forgot password?</a></div>
        <Submit busy={busy} busyText="Checking…">Sign In</Submit>
      </form>
    </Shell>
  )
  return (
    <Shell title={step === "totp" ? "Authenticator code" : "Check your email"}
      subtitle={step === "totp" ? "Enter the 6-digit code from your authenticator app." : `Enter the 6-digit code we sent to ${email}. You'll then set up an authenticator app.`}>
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-4">
        <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(undefined, v)} label={step === "totp" ? "Authenticator code" : "Emailed code"} />
        <Submit busy={busy} disabled={code.length !== 6} busyText="Verifying…">Verify and sign in</Submit>
        <button type="button" className={linkCls} onClick={() => { setStep("password"); setCode(""); setError(null) }}>Start again</button>
      </form>
    </Shell>
  )
}

/** The owner arrives here from Admin → Board & Investors with a single-use
 *  pass in the URL fragment (never sent to a server log). */
export function OwnerPage() {
  const [, go] = useLocation()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const code = window.location.hash.slice(1)
    history.replaceState(null, "", "/owner")  // the pass leaves the address bar at once
    if (!code) { setError("Open the Boardroom from the admin panel: Board & Investors → Open board portal."); return }
    boardApi.post("/auth/owner", { code })
      .then(({ data }) => { setToken(data.token); go("/") })
      .catch((err) => setError(errorText(err)))
  }, [])  // once: the pass is single-use
  return (
    <Shell title={error ? "Couldn't sign you in" : "Signing you in…"} subtitle={error ? "" : "Opening the Boardroom as the owner."}>
      {error ? <ErrorBox text={error} /> : <div className="flex justify-center py-2"><Loader2 className="h-6 w-6 animate-spin text-[#0B8F63]" /></div>}
    </Shell>
  )
}

export function AcceptPage() {
  const [, go] = useLocation()
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [invite, setInvite] = useState<{ email: string; name: string; role: string; secret: string; otpauthUri: string } | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its invitation code. Open the link from your email again.")
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    boardApi.post("/auth/accept/start", { token }).then(({ data }) => setInvite(data)).catch((e) => setError(errorText(e)))
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("The passwords don't match"); return }
    setBusy(true); setError(null)
    try { await boardApi.post("/auth/accept", { token, password, otp }); setDone(true) }
    catch (err) { setError(errorText(err)); setOtp("") } finally { setBusy(false) }
  }

  if (done) return (
    <Shell title="Your access is ready" subtitle="Sign in with your password and a code from your authenticator app.">
      <form onSubmit={(e) => { e.preventDefault(); go("/login") }}><Submit busy={false} busyText="">Go to sign in</Submit></form>
    </Shell>
  )
  return (
    <Shell title="Accept your invitation" subtitle={invite ? `${invite.name}, you've been invited as ${invite.role}.` : "Checking your invitation…"}>
      <ErrorBox text={error} />
      {invite && (
        <form onSubmit={submit} className="space-y-4">
          <Label text="New password"><PasswordInput autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
          <Strength password={password} />
          <Label text="Confirm password"><PasswordInput autoComplete="new-password" minLength={12} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Label>
          <AuthenticatorKey secret={invite.secret} uri={invite.otpauthUri} />
          <Label text="Code from your authenticator app"><CodeInput value={otp} onChange={setOtp} /></Label>
          <Submit busy={busy} disabled={otp.length !== 6 || password.length < 12} busyText="Saving…">Accept invitation</Submit>
        </form>
      )}
    </Shell>
  )
}

/** Members who joined before authenticators were required set one up here. */
export function MfaSetupPage() {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null)
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { boardApi.post("/auth/mfa/setup").then(({ data }) => setSetup(data)).catch((e) => setError(errorText(e))) }, [])
  const submit = async (e?: FormEvent, v = otp) => {
    e?.preventDefault(); setBusy(true); setError(null)
    try { await boardApi.post("/auth/mfa/confirm", { otp: v }); window.location.assign("/") }
    catch (err) { setError(errorText(err)); setOtp("") } finally { setBusy(false) }
  }
  return (
    <Shell title="Protect your account" subtitle="The Boardroom needs an authenticator app on every sign-in.">
      <ErrorBox text={error} />
      {setup && (
        <form onSubmit={submit} className="space-y-4">
          <AuthenticatorKey secret={setup.secret} uri={setup.otpauthUri} />
          <CodeInput value={otp} onChange={setOtp} onComplete={(v) => void submit(undefined, v)} />
          <Submit busy={busy} disabled={otp.length !== 6} busyText="Checking…">Turn on</Submit>
        </form>
      )}
    </Shell>
  )
}

export function ForgotPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { await boardApi.post("/auth/forgot", { email: email.trim() }); setSent(true) } catch (err) { setError(errorText(err)) } finally { setBusy(false) }
  }
  return (
    <Shell title={sent ? "Check your email" : "Reset your password"}
      subtitle={sent ? "If that address belongs to a Boardroom member, we've sent a reset link. It expires in 1 hour." : "We'll email you a link. You'll also need your authenticator app."}>
      <ErrorBox text={error} />
      {!sent ? (
        <form onSubmit={submit} className="space-y-4">
          <Label text="Email"><TextInput icon={Mail} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Label>
          <Submit busy={busy} busyText="Sending…">Send reset link</Submit>
          <a href="/login" className={`block text-center ${linkCls}`}>Back to sign in</a>
        </form>
      ) : <a href="/login" className={`block text-center ${linkCls}`}>Back to sign in</a>}
    </Shell>
  )
}

export function ResetPage() {
  const [, go] = useLocation()
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(token ? null : "This link is incomplete. Open the link from your email again.")
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try { await boardApi.post("/auth/reset", { token, password, otp: otp || null }); go("/login") }
    catch (err) { setError(errorText(err)); setOtp("") } finally { setBusy(false) }
  }
  return (
    <Shell title="Choose a new password" subtitle="At least 12 characters. All your sessions will be signed out.">
      <ErrorBox text={error} />
      {token && (
        <form onSubmit={submit} className="space-y-4">
          <Label text="New password"><PasswordInput autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></Label>
          <Strength password={password} />
          <Label text="Code from your authenticator app"><CodeInput value={otp} onChange={setOtp} /></Label>
          <Submit busy={busy} disabled={password.length < 12} busyText="Saving…">Save password</Submit>
        </form>
      )}
    </Shell>
  )
}
