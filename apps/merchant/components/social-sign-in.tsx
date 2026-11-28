"use client"

/**
 * Sign in / sign up with Google or Apple for the merchant dashboard. These
 * are BukkaPay Business accounts: the first time, we ask for a username,
 * phone number and country, then create the account. Personal (BukkaPay app)
 * accounts can't sign in here — the API refuses them with a clear message.
 *
 * Google: BukkaPay's own button (Google's brand guidelines) opens Google's
 * account chooser in a popup every time and hands back an access token that
 * the API checks with Google. Google's ready-made button isn't used: once
 * someone has signed in it shows their name, email and photo on this page
 * for good, even after they sign out. Apple uses its JS SDK in popup mode
 * with Apple's black button style.
 *
 * Env: NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_APPLE_SERVICES_ID.
 */
import { useCallback, useEffect, useRef, useState } from "react"
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
  const googleClient = useRef<any>(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPendingState] = useState<Pending | null>(null)
  // Google's callback outlives renders: read the latest sheet state from a ref.
  const pendingRef = useRef<Pending | null>(null)
  const setPending = (p: Pending | null) => { pendingRef.current = p; setPendingState(p) }
  const [profile, setProfile] = useState<Profile>({ username: "", phone: "", residenceCountry: "" })
  const [accepted, setAccepted] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const countries = useOperatingCountries()

  useEffect(() => {
    if (countries.length === 1 && !profile.residenceCountry) setProfile((p) => ({ ...p, residenceCountry: countries[0].code }))
  }, [countries])

  const exchange = useCallback(async (provider: "google" | "apple", body: Record<string, unknown>) => {
    const inSheet = pendingRef.current !== null
    setBusy(true)
    try {
      const res = await api<{ token: string }>(`/auth/${provider}`, { method: "POST", json: { ...body, app: "merchant" } })
      setToken(res.token)
      setPending(null)
      onSignedIn()
    } catch (err: any) {
      if (err?.status === 428) {
        setPending({ provider, body: { ...body, username: undefined, phone: undefined, residenceCountry: undefined, acceptTerms: undefined } })
        // Opening the sheet: no error yet. Already in it: say what's missing.
        setSheetError(inSheet ? (err?.message ?? "Please complete every field") : null)
        return
      }
      if (inSheet) setSheetError(err?.message ?? "Couldn't create your account")
      else onError(err?.message ?? "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }, [onSignedIn, onError])
  const exchangeRef = useRef(exchange)
  exchangeRef.current = exchange

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadScript("https://accounts.google.com/gsi/client").then(() => {
      const g = (window as any).google
      if (cancelled || !g?.accounts?.oauth2) return
      googleClient.current = g.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        // Always show the account chooser: nothing is remembered on this page.
        prompt: "select_account",
        callback: (r: { access_token?: string; error?: string; error_description?: string }) => {
          if (r.access_token) void exchangeRef.current("google", { accessToken: r.access_token })
          else { setBusy(false); if (r.error && r.error !== "access_denied") onError(r.error_description || "Google sign-in failed") }
        },
        error_callback: (e: { type?: string }) => {
          setBusy(false)
          if (e?.type !== "popup_closed") onError(e?.type === "popup_failed_to_open"
            ? "Your browser blocked the Google window. Allow pop-ups for this site and try again."
            : "Google sign-in failed")
        },
      })
      setGoogleReady(true)
    }).catch(() => onError("Couldn't load Google sign-in. Check your connection and try again."))
    return () => { cancelled = true }
  }, [])

  const google = () => {
    if (!googleClient.current) return
    setBusy(true)
    googleClient.current.requestAccessToken()
  }

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
      {GOOGLE_CLIENT_ID && (
        <button
          type="button"
          onClick={google}
          disabled={busy || !googleReady}
          aria-label={mode === "signup" ? "Sign up with Google" : "Continue with Google"}
          className="w-full h-11 rounded-md border border-[#747775] bg-white text-[#1F1F1F] text-sm font-medium inline-flex items-center justify-center gap-3 hover:bg-[#F8F9FA] disabled:opacity-60 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1F1F20]"
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {busy && !pending ? "Opening Google…" : mode === "signup" ? "Sign up with Google" : "Continue with Google"}
        </button>
      )}
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

      <Modal open={pending !== null} title="Create your business account" onClose={() => { setPending(null); setSheetError(null) }}>
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
