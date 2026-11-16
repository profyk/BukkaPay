"use client"

import { useState } from "react"
import { API_URL } from "@/lib/site"

export function WaitlistForm({ source = "website", dark = false }: { source?: string; dark?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = Object.fromEntries(new FormData(e.currentTarget).entries())
    setState("sending")
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/public/waitlist`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Something went wrong — please try again")
      }
      setState("sent")
    } catch (err: any) {
      setError(err.message)
      setState("error")
    }
  }

  if (state === "sent") {
    return <p role="status" className={`rounded-2xl px-5 py-4 font-medium ${dark ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-800"}`}>You're on the list. We'll email you when BukkaPay opens in your country.</p>
  }
  const input = `h-12 rounded-xl border px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${dark ? "border-white/20 bg-white/10 text-white placeholder:text-white/50" : "border-line bg-white"}`
  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor={`wl-email-${source}`}>Email</label>
        <input id={`wl-email-${source}`} name="email" type="email" required placeholder="you@example.com" autoComplete="email" className={`${input} flex-1`} />
        <label className="sr-only" htmlFor={`wl-kind-${source}`}>I am</label>
        <select id={`wl-kind-${source}`} name="kind" defaultValue="personal" className={input}>
          <option value="personal">For me</option>
          <option value="business">For my business</option>
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor={`wl-country-${source}`}>Country code</label>
        <input id={`wl-country-${source}`} name="countryCode" maxLength={2} placeholder="Country (e.g. ZA)" className={`${input} sm:w-44 uppercase`} />
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <button type="submit" disabled={state === "sending"} className="h-12 flex-1 rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {state === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      {error && <p role="alert" className={`text-sm ${dark ? "text-red-200" : "text-red-700"}`}>{error}</p>}
      <p className={`text-xs ${dark ? "text-white/60" : "text-ink-muted"}`}>We only use your email to tell you when BukkaPay launches. See our <a href="/legal/privacy-policy" className="underline">privacy policy</a>.</p>
    </form>
  )
}
