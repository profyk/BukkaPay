"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, setToken } from "@/lib/api"
import { Button, Field, Input, Notice, PasswordInput } from "@/components/ui"
import { SocialSignIn } from "@/components/social-sign-in"
import {
  EmailCodeDialog, ProfileFields, profileComplete, useOperatingCountries, type Profile,
} from "@/components/account-forms"
import { AuthShell } from "@/components/auth-shell"

/** Business account sign-up for the merchant dashboard. */
export default function SignupPage() {
  const router = useRouter()
  const countries = useOperatingCountries()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [profile, setProfile] = useState<Profile>({ username: "", phone: "", residenceCountry: "" })
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)

  useEffect(() => {
    if (countries.length === 1 && !profile.residenceCountry) setProfile((p) => ({ ...p, residenceCountry: countries[0].code }))
  }, [countries])

  const strong = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready = name.trim() && emailOk && strong && profileComplete(profile) && accepted

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    const dial = countries.find((c) => c.code === profile.residenceCountry)?.dialCode ?? undefined
    try {
      const res = await api<{ token: string; user: { email: string } }>("/auth/signup", {
        method: "POST",
        json: {
          name: name.trim(), email: email.trim().toLowerCase(), username: profile.username.trim(), password,
          phone: profile.phone.replace(/\D/g, ""), countryCode: dial, residenceCountry: profile.residenceCountry,
          acceptTerms: true, app: "merchant",
        },
      })
      setToken(res.token)
      setConfirmEmail(res.user.email)
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
          <h1 className="font-display text-3xl font-semibold">Create your business account</h1>
          <p className="text-sm text-ink-muted mt-1">For shops, market vendors, wholesalers and online sellers. You'll add your business details next.</p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <SocialSignIn mode="signup" onSignedIn={() => router.replace("/businesses")} onError={setError} />
        <Field label="Your full name"><Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Business email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <ProfileFields value={profile} onChange={setProfile} countries={countries} />
        <Field label="Password" hint={password && !strong ? "At least 8 characters, with letters and numbers" : undefined}>
          <PasswordInput autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>I agree to the <a className="underline" href="https://www.bukkapay.com/legal/merchant-terms" target="_blank" rel="noreferrer">Merchant Terms</a> and <a className="underline" href="https://www.bukkapay.com/legal/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
        </label>
        <Button type="submit" className="w-full" disabled={!ready || busy}>{busy ? "Creating account…" : "Create business account"}</Button>
        <p className="text-sm text-ink-muted">Already have one? <Link href="/login" className="font-medium text-brand-700 underline">Sign in</Link></p>
        <p className="text-xs text-ink-muted">Want to send and receive money personally? Use the BukkaPay app at app.bukkapay.com — personal and business accounts are separate.</p>
      </form>
      <EmailCodeDialog email={confirmEmail} onVerified={() => router.replace("/businesses")} />
    </AuthShell>
  )
}
