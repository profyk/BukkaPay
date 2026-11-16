"use client"

import { useState } from "react"
import { API_URL } from "@/lib/site"

const KINDS = [
  { value: "contact", label: "General question" },
  { value: "business", label: "Business / merchant enquiry" },
  { value: "bank_partner", label: "Bank partnership" },
  { value: "psp_partner", label: "PSP / payment provider partnership" },
  { value: "custodian", label: "Local custodian / safeguarding partner" },
  { value: "press", label: "Press" },
]

export function EnquiryForm({ defaultKind = "contact", kinds }: { defaultKind?: string; kinds?: string[] }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const options = kinds ? KINDS.filter((k) => kinds.includes(k.value)) : KINDS

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setState("sending")
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/v1/public/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.detail?.[0]?.msg || "Something went wrong")
      }
      setState("sent")
    } catch (err: any) {
      setError(err.message)
      setState("error")
    }
  }

  if (state === "sent") {
    return <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">Thank you — we've received your message and will reply by email.</div>
  }
  const input = "w-full h-11 rounded-xl border border-line px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line p-6 sm:grid-cols-2">
      <label className="space-y-1.5 sm:col-span-2"><span className="text-sm font-semibold">Topic</span>
        <select name="kind" defaultValue={defaultKind} className={input}>{options.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
      </label>
      <label className="space-y-1.5"><span className="text-sm font-semibold">Name</span><input name="name" required minLength={2} className={input} autoComplete="name" /></label>
      <label className="space-y-1.5"><span className="text-sm font-semibold">Email</span><input name="email" type="email" required className={input} autoComplete="email" /></label>
      <label className="space-y-1.5"><span className="text-sm font-semibold">Organisation</span><input name="organisation" className={input} autoComplete="organization" /></label>
      <label className="space-y-1.5"><span className="text-sm font-semibold">Country (2-letter code)</span><input name="countryCode" maxLength={2} className={input} placeholder="ZA" /></label>
      <label className="space-y-1.5 sm:col-span-2"><span className="text-sm font-semibold">Message</span><textarea name="message" required minLength={10} rows={5} className={`${input} h-auto py-2`} /></label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="h-12 rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:col-span-2 sm:justify-self-start">
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  )
}
