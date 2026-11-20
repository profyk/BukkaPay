"use client"

/**
 * Sign in / sign up with Google or Apple for the merchant dashboard. These
 * are BukkaPay Business accounts: the first time, we ask for a username,
 * phone number and country, then create the account. Personal (BukkaPay app)
 * accounts can't sign in here — the API refuses them with a clear message.
 *
 * Google renders its own button (Google Identity Services); Apple uses its JS
 * SDK in popup mode with Apple's black button style.
 *
 * Env: NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_APPLE_SERVICES_ID.
 */
import { useEffect, useRef, useState } from "react"
import { api, setToken } from "@/lib/api"
import { Button, Modal, Notice } from "@/components/ui"
import { ProfileFields, profileComplete, useOperatingCountries, type Profile } from "@/components/account-forms"

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Couldn't load ${src}`))
    document.head.appendChild(s)
  })
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

type Pending = { provider: "google" | "apple"; body: Record<string, unknown> }

export function SocialSignIn({ onSignedIn, onError, mode = "signin" }: {
  onSignedIn: () => void; onError: (msg: string) => void; mode?: "signin" | "signup"
}) {
  const googleRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [profile, setProfile] = useState<Profile>({ username: "", phone: "", residenceCountry: "" })
  const [accepted, setAccepted] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const countries = useOperatingCountries()

  useEffect(() => {
    if (countries.length === 1 && !profile.residenceCountry) setProfile((p) => ({ ...p, residenceCountry: countries[0].code }))
  }, [countries])

  const exchange = async (provider: "google" | "apple", body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await api<{ token: string }>(`/auth/${provider}`, { method: "POST", json: { ...body, app: "merchant" } })
      setToken(res.token)
      setPending(null)
      onSignedIn()
    } catch (err: any) {
      if (err?.status === 428) { setPending({ provider, body }); setSheetError(null); return }
      if (pending) setSheetError(err?.message ?? "Couldn't create your account")
      else onError(err?.message ?? "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleRef.current) return
    let cancelled = false
    loadScript("https://accounts.google.com/gsi/client").then(() => {
      const g = (window as any).google
      if (cancelled || !g?.accounts?.id || !googleRef.current) return
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r: { credential?: string }) => r.credential && exchange("google", { idToken: r.credential }),
        ux_mode: "popup",
      })
      g.accounts.id.renderButton(googleRef.current, {
        type: "standard", theme: "outline", size: "large", text: mode === "signup" ? "signup_with" : "continue_with",
        shape: "rectangular", logo_alignment: "left", width: googleRef.current.offsetWidth || 384,
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const apple = async () => {
    try {
      await loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js")
      const rawNonce = crypto.randomUUID() + crypto.randomUUID()
      const AppleID = (window as any).AppleID
      AppleID.auth.init({
        clientId: APPLE_SERVICES_ID, scope: "name email", redirectURI: window.location.origin,
        usePopup: true, nonce: await sha256Hex(rawNonce),
      })
      const res = await AppleID.auth.signIn()
      const n = res?.user?.name
      const name = n ? [n.firstName, n.lastName].filter(Boolean).join(" ") : undefined
      await exchange("apple", { identityToken: res?.authorization?.id_token, nonce: rawNonce, name })
    } catch (err: any) {
      if (err?.error === "popup_closed_by_user" || err?.error === "user_cancelled_authorize") return
      onError("Apple sign-in failed")
    }
  }

  const create = () => {
    if (!pending) return
    exchange(pending.provider, {
      ...pending.body, ...profile, username: profile.username.trim(), acceptTerms: true,
    })
  }

  if (!GOOGLE_CLIENT_ID && !APPLE_SERVICES_ID) return null

  return (
    <div className="space-y-3" aria-busy={busy}>
      {GOOGLE_CLIENT_ID && <div ref={googleRef} className="w-full flex justify-center min-h-[44px]" />}
      {APPLE_SERVICES_ID && (
        <button
          type="button"
          onClick={apple}
          disabled={busy}
          className="w-full h-11 rounded-md bg-black text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-neutral-900 disabled:opacity-60"
        >
          <svg aria-hidden width="16" height="19" viewBox="0 0 814 1000" fill="currentColor">
            <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-167 41s-106-57-156-128C44 790 0 669 0 553c0-185 121-283 239-283 63 0 116 41 155 41 38 0 97-44 169-44 27 0 126 3 191 74zM555 167c30-35 51-84 51-133 0-7-1-14-2-19-48 2-106 32-140 72-27 31-53 80-53 130 0 8 1 15 2 18 3 1 9 2 14 2 44 0 99-29 128-70z" />
          </svg>
          {mode === "signup" ? "Sign up with Apple" : "Continue with Apple"}
        </button>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span className="h-px flex-1 bg-black/10" />or {mode === "signup" ? "sign up" : "sign in"} with email<span className="h-px flex-1 bg-black/10" />
      </div>

      <Modal open={pending !== null} title="Create your business account" onClose={() => setPending(null)}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">One last step before we set up your BukkaPay Business account.</p>
          {sheetError && <Notice tone="error">{sheetError}</Notice>}
          <ProfileFields value={profile} onChange={setProfile} countries={countries} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>I agree to the <a className="underline" href="https://www.bukkapay.com/legal/merchant-terms" target="_blank" rel="noreferrer">Merchant Terms</a> and <a className="underline" href="https://www.bukkapay.com/legal/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
          </label>
          <Button className="w-full" disabled={!profileComplete(profile) || !accepted || busy} onClick={create}>
            {busy ? "Creating…" : "Create business account"}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
