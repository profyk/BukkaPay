"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, signOut } from "@/lib/api"
import { useData, type Membership } from "@/lib/hooks"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, PageHeader, Select } from "@/components/ui"

const TYPES: [string, string][] = [
  ["retail", "Shop / retail"], ["restaurant", "Restaurant, café or takeaway"], ["tuckshop", "Spaza or tuck shop"],
  ["street_vendor", "Street vendor or market stall"], ["services", "Services (salon, repairs, cleaning…)"],
  ["online", "Online store"], ["logistics", "Transport & logistics"], ["school", "School or crèche"],
  ["utility", "Utility or levies"], ["sme", "Other small business"], ["other", "Something else"],
]

export default function BusinessesPage() {
  const router = useRouter()
  const { data, error, loading, reload } = useData<Membership[]>("/merchant-memberships")
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState("retail")
  const [formError, setFormError] = useState<string | null>(null)
  const [staffCode, setStaffCode] = useState("")

  const [busy, setBusy] = useState(false)
  const trimmed = name.replace(/\s+/g, " ").trim()
  const nameError = name && (trimmed.length < 2 || trimmed.length > 120) ? "Use 2 to 120 characters." : undefined
  const create = async () => {
    if (busy || !trimmed || nameError) return
    setFormError(null); setBusy(true)
    try {
      const m = await api<{ id: string }>("/merchants", { method: "POST", json: { businessName: trimmed, businessType: type } })
      router.push(`/m/${m.id}/verification`)
    } catch (e: any) { setFormError(e.message); setBusy(false) }
  }
  const joinAsStaff = async () => {
    setFormError(null)
    try {
      await api("/merchants/staff/link", { method: "POST", json: { inviteCode: staffCode.trim() } })
      setStaffCode("")
      reload()
    } catch (e: any) { setFormError(e.message) }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader
        title="Your businesses"
        subtitle="Choose a business to manage, register a new one, or join one with a staff invite code."
        actions={<>
          <Button variant="secondary" onClick={() => void signOut()}>Sign out</Button>
            <ThemeToggle />
            <Button variant="ghost" onClick={() => router.push("/account/delete")}>Delete account</Button>
          <Button onClick={() => setCreating(true)}>Register a business</Button>
        </>}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : !data?.length ? (
        <Empty>No businesses yet. Register one to start accepting payments.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((m) => (
            <Link key={m.id} href={`/m/${m.id}`}>
              <Card className="hover:border-brand-500 transition cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">{m.businessName}</p>
                    <p className="text-xs text-ink-muted mt-0.5 capitalize">{m.role} · {m.country} · {m.currency}</p>
                  </div>
                  <Badge value={m.kybStatus} />
                </div>
                {m.kybStatus !== "approved" && (
                  <p className="mt-3 text-xs text-amber-700">Verification required before you can accept payments.</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Card className="mt-8">
        <p className="font-semibold">Joining a team?</p>
        <p className="text-sm text-ink-muted mb-3">Enter the staff invite code the business owner gave you.</p>
        <div className="flex gap-2">
          <Input placeholder="STAFF-…" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} />
          <Button variant="secondary" onClick={joinAsStaff} disabled={!staffCode.trim()}>Join</Button>
        </div>
      </Card>
      {formError && <div className="mt-4"><Notice tone="error">{formError}</Notice></div>}
      <Modal open={creating} title="Register a business" onClose={() => { setCreating(false); setFormError(null) }}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void create() }}>
          <Field label="Business name" hint="The name customers see when they pay you." error={nameError}>
            <Input autoFocus maxLength={120} placeholder="e.g. Mama's Kota" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="What kind of business is it?">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </Field>
          {formError && <Notice tone="error">{formError}</Notice>}
          <Notice>Next, you'll verify the business (registration, address, owners and documents), or verify as an individual seller if it isn't registered. Payments stay switched off until it's verified. You can choose a plan any time after that.</Notice>
          <Button type="submit" className="w-full" disabled={!trimmed || !!nameError || busy}>{busy ? "Creating…" : "Continue"}</Button>
        </form>
      </Modal>
    </main>
  )
}
