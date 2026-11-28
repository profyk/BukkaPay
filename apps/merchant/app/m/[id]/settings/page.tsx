"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { Button, Card, Field, Input, Notice, PageHeader } from "@/components/ui"
import { useMerchant, useReloadMerchant } from "@/components/merchant-context"

type Detail = {
  businessName: string; businessType: string; businessCategory: string | null; businessEmail: string | null
  businessPhone: string | null; businessAddress: string | null; vatNumber: string | null; website: string | null
  businessRegNumber: string | null; qrCode: string; paymentLink: string
}
const FIELDS = ["businessName", "businessCategory", "businessEmail", "businessPhone", "businessAddress", "vatNumber", "website"] as const
type FormT = Record<(typeof FIELDS)[number], string>
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/

function errorsOf(f: FormT): Partial<Record<keyof FormT, string>> {
  const e: Partial<Record<keyof FormT, string>> = {}
  const name = f.businessName.replace(/\s+/g, " ").trim()
  if (name.length < 2 || name.length > 120) e.businessName = "2 to 120 characters."
  if (f.businessEmail && !EMAIL_RE.test(f.businessEmail.trim())) e.businessEmail = "Enter a valid email."
  const digits = f.businessPhone.replace(/\D/g, "")
  if (f.businessPhone && (digits.length < 6 || digits.length > 15)) e.businessPhone = "Enter a valid phone number."
  if (f.website && !/^https?:\/\/\S+\.\S+/i.test(f.website.trim())) e.website = "Start with https://"
  return e
}

/** Business settings: the public profile customers see when they pay, and
 *  contact details. Payout bank details live under Settlements (PIN-protected). */
export default function SettingsPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const reloadMerchant = useReloadMerchant()
  const detail = useData<Detail>(`/merchants/${id}`)
  const [form, setForm] = useState<FormT | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const editable = can(merchant?.role, "owner")

  useEffect(() => {
    if (!detail.data) return
    setForm(Object.fromEntries(FIELDS.map((k) => [k, (detail.data as any)[k] ?? ""])) as FormT)
  }, [detail.data])

  if (detail.error) return <Notice tone="error">{detail.error}</Notice>
  if (!form || !detail.data) return <p className="text-sm text-ink-muted">Loading…</p>
  const errs = errorsOf(form)
  const changed = FIELDS.filter((k) => (form[k] ?? "") !== ((detail.data as any)[k] ?? ""))
  const set = (k: keyof FormT) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    if (Object.keys(errs).length || !changed.length) return
    setBusy(true); setMsg(null)
    try {
      await api(`/merchants/${id}`, { method: "PATCH", json: Object.fromEntries(changed.map((k) => [k, form[k].trim()])) })
      setMsg({ tone: "success", text: "Saved." }); detail.reload(); reloadMerchant()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Business settings" subtitle="What customers see when they pay you, and how BukkaPay reaches you." />
      {msg && <div className="mb-4" role="status"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {!editable && <div className="mb-4"><Notice>Only the business owner can change these.</Notice></div>}
      <form onSubmit={(e) => { e.preventDefault(); void save() }}>
        <fieldset disabled={!editable || busy} className="grid lg:grid-cols-2 gap-4">
          <Card>
            <p className="font-semibold mb-4">Public profile</p>
            <div className="space-y-4">
              <Field label="Business name" hint="Shown on receipts, QR codes and checkout." error={errs.businessName}><Input maxLength={120} value={form.businessName} onChange={set("businessName")} /></Field>
              <Field label="What you sell" hint="e.g. groceries, haircuts, school fees"><Input maxLength={80} value={form.businessCategory} onChange={set("businessCategory")} /></Field>
              <Field label="Website" error={errs.website}><Input type="url" placeholder="https://" value={form.website} onChange={set("website")} /></Field>
            </div>
          </Card>
          <Card>
            <p className="font-semibold mb-4">Contact & tax</p>
            <div className="space-y-4">
              <Field label="Business email" error={errs.businessEmail}><Input type="email" value={form.businessEmail} onChange={set("businessEmail")} /></Field>
              <Field label="Business phone" error={errs.businessPhone}><Input type="tel" value={form.businessPhone} onChange={set("businessPhone")} /></Field>
              <Field label="Address"><Input value={form.businessAddress} onChange={set("businessAddress")} /></Field>
              <Field label="VAT number" hint="Printed on receipts when set."><Input value={form.vatNumber} onChange={set("vatNumber")} /></Field>
            </div>
          </Card>
        </fieldset>
        {editable && (
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={busy || !changed.length || Object.keys(errs).length > 0}>{busy ? "Saving…" : "Save changes"}</Button>
            {changed.length > 0 && <span className="text-xs text-ink-muted">{changed.length} unsaved change{changed.length > 1 ? "s" : ""}</span>}
          </div>
        )}
      </form>
      <div className="grid lg:grid-cols-3 gap-4 mt-8">
        <Card><p className="font-semibold">Payout bank account</p><p className="text-sm text-ink-muted mt-1">Protected by your transaction PIN.</p>
          <Link href={`/m/${id}/settlements`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Manage in Settlements</Link></Card>
        <Card><p className="font-semibold">Plan</p><p className="text-sm text-ink-muted mt-1">Limits, upgrades and billing history.</p>
          <Link href={`/m/${id}/plan`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Plan & billing</Link></Card>
        <Card><p className="font-semibold">Registration</p><p className="text-sm text-ink-muted mt-1">{detail.data.businessRegNumber ? `Reg. no. ${detail.data.businessRegNumber}` : "Not verified as a registered business yet."}</p>
          <Link href={`/m/${id}/verification`} className="mt-3 inline-block text-sm font-semibold text-brand-700 underline">Verification</Link></Card>
      </div>
    </>
  )
}
