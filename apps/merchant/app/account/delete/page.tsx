"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { api, setToken } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { Button, Card, Field, Input, Notice, PageHeader, PasswordInput } from "@/components/ui"

type Check = { canClose: boolean; blockers: string[]; retentionYears: number; confirmWith: "pin" | "password" | "set_pin" }

/** Delete a BukkaPay Business account (and the person's login). */
export default function DeleteAccountPage() {
  const router = useRouter()
  const { data, error, reload } = useData<Check>("/account/closure-check")
  const [confirm, setConfirm] = useState("")
  const [secret, setSecret] = useState("")
  const [reason, setReason] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!data) return
    setBusy(true); setMsg(null)
    try {
      await api("/account/close", { method: "POST", json: {
        confirm, reason: reason || undefined,
        ...(data.confirmWith === "pin" ? { pin: secret } : { password: secret }),
      } })
      setToken(null)
      setDone(true)
      setTimeout(() => router.replace("/login"), 3000)
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  if (done) {
    return <main className="mx-auto max-w-xl p-6"><Notice tone="success">Your account is closed. We've emailed you a confirmation.</Notice></main>
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <Link href="/businesses" className="text-sm text-ink-muted hover:text-brand-600">← Back</Link>
      <PageHeader title="Delete your account" subtitle="Closes your BukkaPay login and the businesses you own. This can't be undone." />
      <Card>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>Your login closes straight away and you're signed out on every device.</li>
          <li>Your profile, phone number, password, PIN and devices are deleted. Staff you invited keep their own logins.</li>
          <li>By law we keep identity, business verification and transaction records for {data?.retentionYears ?? 5} years, sealed and only visible to our compliance team, then delete them automatically.</li>
          <li>Money is never deleted: withdraw every balance first.</li>
        </ul>
      </Card>
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.canClose && (
        <Notice tone="warn">
          <p className="font-semibold mb-1">Before you can delete</p>
          {data.blockers.map((b) => <p key={b}>• {b}</p>)}
          <button className="mt-2 underline font-semibold" onClick={reload}>Check again</button>
        </Notice>
      )}
      {data?.canClose && (
        <Card>
          <div className="space-y-3">
            <Field label="Why are you leaving? (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <Field label="Type DELETE to confirm"><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" /></Field>
            {data.confirmWith === "set_pin"
              ? <Notice tone="warn">Set a transaction PIN in the BukkaPay app first, then come back.</Notice>
              : <Field label={data.confirmWith === "pin" ? "Your PIN" : "Your password"}>
                  <PasswordInput value={secret} onChange={(e) => setSecret(e.target.value)} />
                </Field>}
          </div>
          <Button className="mt-4 !bg-red-600 hover:!bg-red-700" disabled={busy || confirm.trim().toUpperCase() !== "DELETE" || !secret || data.confirmWith === "set_pin"}
                  onClick={submit}>Delete my account</Button>
          {msg && <div className="mt-3"><Notice tone="error">{msg}</Notice></div>}
        </Card>
      )}
    </main>
  )
}
