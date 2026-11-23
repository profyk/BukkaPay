"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, setToken } from "@/lib/api"
import { Button, Field, Input, Notice } from "@/components/ui"
import { SocialSignIn } from "@/components/social-sign-in"
import { EmailCodeDialog } from "@/components/account-forms"
import { AuthShell } from "@/components/auth-shell"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ token: string; user: { email: string; verified?: boolean } }>(
        "/auth/login", { method: "POST", json: { email, password, app: "merchant" } })
      setToken(res.token)
      if (res.user?.verified === false) {
        // Never confirmed their email: do it now.
        api("/auth/otp/request", { method: "POST", json: { email: res.user.email } }).catch(() => {})
        setConfirmEmail(res.user.email)
        return
      }
      router.replace("/businesses")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <h2 className="font-display text-3xl font-semibold">Welcome back</h2>
            <p className="text-sm text-ink-muted mt-1">Use your BukkaPay Business account. Owners and invited staff use the same login.</p>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <SocialSignIn onSignedIn={() => router.replace("/businesses")} onError={setError} />
          <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <p className="text-sm text-ink-muted">New to BukkaPay for Business? <Link href="/signup" className="font-medium text-brand-700 underline">Create a business account</Link></p>
          <p className="text-xs text-ink-muted">Personal BukkaPay accounts sign in at app.bukkapay.com.</p>
        </form>
      <EmailCodeDialog email={confirmEmail} onVerified={() => router.replace("/businesses")} />
    </AuthShell>
  )
}
