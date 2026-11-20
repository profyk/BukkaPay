"use client"

/**
 * Business-account sign-up pieces for the merchant dashboard:
 * - useOperatingCountries: countries BukkaPay is open in (pilot or live)
 * - EmailCodeDialog: confirms a new sign-up's email with the 6-digit code
 * - ProfileFields: username / phone / country, shared by email and
 *   Google/Apple sign-up
 */
import { useEffect, useState } from "react"
import { api, setToken } from "@/lib/api"
import { Button, Field, Input, Modal, Notice, Select } from "@/components/ui"

export type Country = { code: string; name: string; status: string; currency: string; dialCode?: string | null }

export function useOperatingCountries() {
  const [countries, setCountries] = useState<Country[]>([])
  useEffect(() => {
    api<Country[]>("/public/countries")
      .then((list) => setCountries(list.filter((c) => c.status === "pilot" || c.status === "live")))
      .catch(() => setCountries([]))
  }, [])
  return countries
}

export const USERNAME_RE = /^[A-Za-z0-9._]{3,30}$/
export const phoneOk = (p: string) => p.replace(/\D/g, "").length >= 6

export type Profile = { username: string; phone: string; residenceCountry: string }

export function ProfileFields({ value, onChange, countries }: {
  value: Profile; onChange: (p: Profile) => void; countries: Country[]
}) {
  const dial = countries.find((c) => c.code === value.residenceCountry)?.dialCode
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <Field label="Username" hint={value.username && !USERNAME_RE.test(value.username) ? "3–30 letters, numbers, dots or underscores" : undefined}>
        <Input autoComplete="username" value={value.username} onChange={set("username")} placeholder="mamas.kota" />
      </Field>
      <Field label="Country">
        <Select value={value.residenceCountry} onChange={set("residenceCountry")}>
          <option value="">Choose your country</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
        </Select>
      </Field>
      <Field label="Phone number">
        <div className="flex gap-2">
          {dial && <span className="inline-flex items-center rounded-md border border-black/10 px-3 text-sm text-ink-muted dark:border-white/10">{dial}</span>}
          <Input type="tel" autoComplete="tel-national" value={value.phone} onChange={set("phone")} placeholder="82 123 4567" />
        </div>
      </Field>
    </>
  )
}

export const profileComplete = (p: Profile) => USERNAME_RE.test(p.username.trim()) && phoneOk(p.phone) && !!p.residenceCountry

const RESEND_SECONDS = 60

/** Confirms a new sign-up's email. Never a way to sign in to a verified account. */
export function EmailCodeDialog({ email, onVerified }: { email: string | null; onVerified: () => void }) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [wait, setWait] = useState(RESEND_SECONDS)

  useEffect(() => { if (email) { setCode(""); setError(null); setInfo(null); setWait(RESEND_SECONDS) } }, [email])
  useEffect(() => {
    if (!email || wait <= 0) return
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearInterval(t)
  }, [email, wait > 0])

  const submit = async (value = code) => {
    if (!email || value.length !== 6 || busy) return
    setBusy(true); setError(null)
    try {
      const res = await api<{ token: string }>("/auth/otp/verify", { method: "POST", json: { email, code: value, app: "merchant" } })
      if (res?.token) setToken(res.token)
      onVerified()
    } catch (e: any) {
      setError(e?.message ?? "That code didn't work."); setCode("")
    } finally { setBusy(false) }
  }

  const resend = async () => {
    if (!email || wait > 0) return
    setError(null)
    try {
      await api("/auth/otp/request", { method: "POST", json: { email } })
      setInfo("A new code is on its way."); setWait(RESEND_SECONDS)
    } catch (e: any) { setError(e?.message ?? "Couldn't send a new code.") }
  }

  return (
    <Modal open={!!email} title="Confirm your email" onClose={() => {}}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">We sent a 6-digit code to <strong className="text-ink dark:text-white">{email}</strong>.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" aria-label="6-digit code"
          className="text-center text-2xl tracking-[0.5em]" value={code}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) submit(v) }} />
        <Button className="w-full" disabled={code.length !== 6 || busy} onClick={() => submit()}>{busy ? "Checking…" : "Confirm"}</Button>
        <button type="button" onClick={resend} disabled={wait > 0} className="w-full text-sm font-medium text-brand-700 disabled:text-ink-muted">
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </div>
    </Modal>
  )
}
