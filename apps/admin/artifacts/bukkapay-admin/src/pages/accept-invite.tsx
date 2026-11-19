import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { AlertCircle, CheckCircle2, Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Invite = { email: string; name: string; role: string; roleLabel: string; expiresAt: string }
type Mfa = { secret: string; otpauthUri: string }
type Step = "loading" | "invalid" | "password" | "mfa" | "done"

const errText = (e: any) => e?.response?.data?.error ?? e?.message ?? "Something went wrong"

/** Public page opened from the invitation email: the invited admin chooses
 * their password, enrols an authenticator app, and the account is created
 * with two-factor sign-in already on. */
export default function AcceptInvitePage() {
  const [, setLocation] = useLocation()
  const token = new URLSearchParams(window.location.search).get("token") ?? ""
  const [step, setStep] = useState<Step>("loading")
  const [invite, setInvite] = useState<Invite | null>(null)
  const [problem, setProblem] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [mfa, setMfa] = useState<Mfa | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) { setProblem("This page needs the link from your invitation email."); setStep("invalid"); return }
    api.get(`/admin/invitations/${encodeURIComponent(token)}`)
      .then(({ data }) => { setInvite(data); setName(data.name); setStep("password") })
      .catch((e) => { setProblem(errText(e)); setStep("invalid") })
  }, [token])

  const strong = password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password)
  const pwOk = strong && password === confirm

  const toMfa = async () => {
    setError(""); setBusy(true)
    try {
      const { data } = await api.post(`/admin/invitations/${encodeURIComponent(token)}/mfa`)
      setMfa(data); setStep("mfa")
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const finish = async () => {
    setError(""); setBusy(true)
    try {
      await api.post(`/admin/invitations/${encodeURIComponent(token)}/accept`, { password, otp: code.trim(), name: name.trim() })
      setStep("done")
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <img src={`${import.meta.env.BASE_URL}images/bukkapay-logo.png`} alt="BukkaPay" className="h-9 w-auto" />
          <span className="text-sm text-muted-foreground">Admin panel</span>
        </div>

        {step === "loading" && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}

        {step === "invalid" && (
          <div className="text-center space-y-3 py-6">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">This invitation can't be used</h1>
            <p className="text-sm text-muted-foreground">{problem}</p>
            <p className="text-sm text-muted-foreground">Ask the BukkaPay owner to send you a new invitation.</p>
          </div>
        )}

        {step === "password" && invite && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 1 of 2</p>
              <h1 className="text-2xl font-semibold mt-1">Set your password</h1>
              <p className="text-sm text-muted-foreground mt-1">
                You've been invited as <strong>{invite.roleLabel}</strong>. You'll sign in as <strong>{invite.email}</strong>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="ai-name">Your name</label>
              <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="ai-pw">Password</label>
              <div className="relative">
                <Input id="ai-pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className={`text-xs ${password && !strong ? "text-destructive" : "text-muted-foreground"}`}>At least 10 characters, with letters and numbers.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold" htmlFor="ai-pw2">Confirm password</label>
              <Input id="ai-pw2" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              {confirm && password !== confirm && <p className="text-xs text-destructive">Passwords don't match.</p>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={!pwOk || !name.trim() || busy} onClick={toMfa}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}Continue
            </Button>
          </div>
        )}

        {step === "mfa" && mfa && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 2 of 2</p>
              <h1 className="text-2xl font-semibold mt-1">Turn on two-factor sign-in</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Every admin signs in with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
              </p>
            </div>
            <ol className="text-sm space-y-3 list-decimal pl-5">
              <li>
                On your phone, open your authenticator app and add an account.{" "}
                <a className="text-primary underline" href={mfa.otpauthUri}>Open in authenticator</a> (on this device), or enter this setup key:
                <div className="flex gap-2 mt-2">
                  <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs break-all font-mono">{mfa.secret}</code>
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(mfa.secret)} aria-label="Copy setup key"><Copy className="w-4 h-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Account: BukkaPay ({invite?.email}). Type: time-based.</p>
              </li>
              <li>Enter the 6-digit code the app shows:</li>
            </ol>
            <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Authenticator code" className="text-center text-lg tracking-[0.4em]" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={code.length !== 6 || busy} onClick={finish}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}Verify and create my account
            </Button>
            <button type="button" className="text-xs text-muted-foreground underline w-full" onClick={() => { setStep("password"); setError("") }}>Back</button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-3 py-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold">You're all set</h1>
            <p className="text-sm text-muted-foreground">Your admin account is ready. Sign in with your email, password and the code from your authenticator app.</p>
            <Button className="w-full" onClick={() => setLocation("/login")}><ShieldCheck className="w-4 h-4 mr-2" />Go to sign in</Button>
          </div>
        )}
      </div>
    </div>
  )
}
