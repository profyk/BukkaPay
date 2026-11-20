"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, setToken } from "@/lib/api"
import { Button, Field, Input, Notice } from "@/components/ui"
import { SocialSignIn } from "@/components/social-sign-in"
import { EmailCodeDialog } from "@/components/account-forms"

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
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-[#1A1A2E] p-12 text-white">
        <p className="font-display text-xl font-semibold">BukkaPay <span className="text-brand-200">for Business</span></p>
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">Get paid by customers across the BukkaPay network.</h1>
          <ul className="mt-6 space-y-2 text-white/70 text-sm">
            <li>Signed QR codes for counter and table payments</li>
            <li>Checkout links for WhatsApp, SMS and your website</li>
            <li>Real-time sales, refunds and settlements by currency</li>
            <li>Staff roles: admin, finance, cashier and viewer</li>
          </ul>
        </div>
        <p className="text-xs text-white/40">Funds are held and settled through BukkaPay's licensed partners in each country.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="font-display text-2xl font-semibold">Sign in</h2>
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
      </section>
      <EmailCodeDialog email={confirmEmail} onVerified={() => router.replace("/businesses")} />
    </main>
  )
}
