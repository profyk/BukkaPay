"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui"
import { useMerchant, useReloadMerchant } from "@/components/merchant-context"

/* Business verification (KYB) as a guided four-step flow. Every rule here
   mirrors the API's (app/api/merchant_platform.py::clean_kyb), which has the
   final say; the form only explains problems before the round trip. The
   draft (never the uploaded files' contents) is kept in this browser so a
   refresh doesn't lose the owner's work. */

type Country = { code: string; name: string; status: string; currency: string }
type Person = { fullName: string; idNumber: string; role: string }
type Doc = { url: string; name: string }
type Form = {
  registrationNumber: string; businessAddress: string; countryCode: string
  businessCategory: string; contactEmail: string; contactPhone: string
}

const DOCS = [
  { type: "registration_certificate", label: "Company registration certificate", hint: "CIPC (ZA), CIPA (BW), ZIMRA/Registrar (ZW) or your country's equivalent.", required: true },
  { type: "proof_of_address", label: "Proof of business address", hint: "A utility bill, lease or bank statement from the last 3 months.", required: true },
  { type: "director_id", label: "Owner / director ID", hint: "ID book, ID card or passport of the main owner.", required: true },
  { type: "bank_letter", label: "Bank confirmation letter", hint: "Optional: speeds up payouts to your bank account.", required: false },
] as const
const ROLES = ["director", "owner", "shareholder", "member", "partner", "trustee"]
const STEPS = ["Business", "People", "Documents", "Review"] as const
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/
const MAX_MB = 10

const clean = (v: string) => v.replace(/\s+/g, " ").trim()
const emptyForm: Form = { registrationNumber: "", businessAddress: "", countryCode: "", businessCategory: "", contactEmail: "", contactPhone: "" }

function businessErrors(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  const reg = clean(f.registrationNumber)
  if (reg.length < 2 || reg.length > 60) e.registrationNumber = "Enter the registration number on your certificate."
  if (clean(f.businessAddress).length < 5) e.businessAddress = "Enter the full registered address."
  if (!f.countryCode) e.countryCode = "Choose the country the business is registered in."
  if (clean(f.businessCategory).length < 2) e.businessCategory = "Say what the business does, e.g. grocery retail."
  if (!EMAIL_RE.test(clean(f.contactEmail))) e.contactEmail = "Enter a valid email address."
  const digits = f.contactPhone.replace(/\D/g, "")
  if (digits.length < 6 || digits.length > 15) e.contactPhone = "Enter a valid phone number, with the country code."
  return e
}

function peopleErrors(people: Person[]): string[] {
  const rows = people.filter((p) => clean(p.fullName) || clean(p.idNumber))
  const out: string[] = []
  if (!rows.length) out.push("Add at least one owner or director.")
  rows.forEach((p, i) => {
    if (clean(p.fullName).length < 2) out.push(`Person ${i + 1}: enter their full name.`)
    if (clean(p.idNumber).length < 4) out.push(`${clean(p.fullName) || `Person ${i + 1}`}: enter their ID or passport number.`)
  })
  const ids = rows.map((p) => clean(p.idNumber).toUpperCase()).filter(Boolean)
  if (new Set(ids).size !== ids.length) out.push("The same ID number is listed twice.")
  return out
}

export default function VerificationPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const reloadMerchant = useReloadMerchant()
  const countries = useData<Country[]>("/public/countries")
  const draftKey = `bukkapay_kyb_draft_${id}`

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(emptyForm)
  const [people, setPeople] = useState<Person[]>([{ fullName: "", idNumber: "", role: "director" }])
  const [docs, setDocs] = useState<Record<string, Doc>>({})
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [status, setStatus] = useState(merchant?.kybStatus)
  const [tier, setTier] = useState(merchant?.verificationTier)
  const [upgrade, setUpgrade] = useState(false)
  useEffect(() => { setStatus(merchant?.kybStatus); setTier(merchant?.verificationTier) }, [merchant?.kybStatus, merchant?.verificationTier])

  const operating = useMemo(() => countries.data?.filter((c) => c.status === "pilot" || c.status === "live") ?? [], [countries.data])

  // Restore the draft once, then keep it saved.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.form) setForm({ ...emptyForm, ...d.form })
        if (Array.isArray(d.people) && d.people.length) setPeople(d.people)
        if (d.docs) setDocs(d.docs)
      }
    } catch { /* corrupt draft: start fresh */ }
    setRestored(true)
  }, [draftKey])
  useEffect(() => {
    if (!restored) return
    try { localStorage.setItem(draftKey, JSON.stringify({ form, people, docs })) } catch { /* storage full */ }
  }, [restored, draftKey, form, people, docs])

  // Default the country to the business's own, else the only operating one.
  useEffect(() => {
    if (form.countryCode || !operating.length) return
    const own = operating.find((c) => c.code === merchant?.country)
    setForm((f) => ({ ...f, countryCode: (own ?? operating[0]).code }))
  }, [operating, merchant?.country, form.countryCode])

  const bErr = businessErrors(form)
  const pErr = peopleErrors(people)
  const missingDocs = DOCS.filter((d) => d.required && !docs[d.type])
  const stepOk = [Object.keys(bErr).length === 0, pErr.length === 0, missingDocs.length === 0 && !Object.values(uploading).some(Boolean)]
  const allOk = stepOk.every(Boolean)

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const next = () => {
    if (step < 3 && !stepOk[step]) { setTouched(true); return }
    setTouched(false); setStep((s) => Math.min(3, s + 1)); window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const verifyIndividual = async () => {
    setMsg(null); setBusy(true)
    try {
      const r = await api<{ kybStatus: string; verificationTier: "individual" }>(`/merchants/${id}/kyb/individual`, { method: "POST" })
      setStatus(r.kybStatus); setTier(r.verificationTier); reloadMerchant()
      setMsg({ tone: "success", text: "Verified as an individual seller. You can accept payments now." })
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
    finally { setBusy(false) }
  }

  const upload = async (type: string, file: File) => {
    setMsg(null)
    if (file.size > MAX_MB * 1024 * 1024) { setMsg({ tone: "error", text: `${file.name} is larger than ${MAX_MB} MB. Upload a smaller scan or photo.` }); return }
    if (!/^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(file.type)) { setMsg({ tone: "error", text: "Upload a PDF or a photo (JPG, PNG, WEBP or HEIC)." }); return }
    setUploading((u) => ({ ...u, [type]: true }))
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
        reader.onerror = () => reject(new Error("Couldn't read the file"))
        reader.readAsDataURL(file)
      })
      const r = await api<{ url: string }>("/upload", { method: "POST", json: { base64, mimeType: file.type, filename: file.name, purpose: "kyb" } })
      // Functional update: two uploads finishing together both stick.
      setDocs((d) => ({ ...d, [type]: { url: r.url, name: file.name } }))
    } catch (e: any) { setMsg({ tone: "error", text: `Upload failed: ${e.message}` }) }
    finally { setUploading((u) => ({ ...u, [type]: false })) }
  }

  const submit = async () => {
    if (!allOk) { setTouched(true); return }
    setMsg(null); setBusy(true)
    try {
      await api(`/merchants/${id}/kyb`, {
        method: "POST",
        json: {
          ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, clean(v)])),
          directors: people.filter((p) => clean(p.fullName) || clean(p.idNumber)).map((p) => ({ fullName: clean(p.fullName), idNumber: clean(p.idNumber), role: p.role })),
          documents: Object.entries(docs).map(([type, d]) => ({ type, url: d.url })),
        },
      })
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setStatus("pending"); setUpgrade(false); reloadMerchant()
      setMsg({ tone: "success", text: "Submitted. BukkaPay's compliance team usually reviews within 1–2 business days. You'll get a notification when it's decided." })
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
    finally { setBusy(false) }
  }

  if (tier === "individual" && !upgrade) {
    return (
      <>
        <PageHeader title="Verification" />
        {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <Card>
          <Badge value={status === "pending" ? "pending" : "approved"} />
          <p className="mt-3 text-sm">
            {status === "pending"
              ? "You're trading as an individual seller while your business documents are reviewed."
              : "You're verified as an individual seller through your own ID. You can accept payments up to the individual seller limits."}
          </p>
          {status === "approved" && can(merchant?.role, "owner") && (
            <Button className="mt-4" variant="ghost" onClick={() => setUpgrade(true)}>Need higher limits? Verify as a registered business</Button>
          )}
        </Card>
      </>
    )
  }
  if (!upgrade && (status === "approved" || status === "pending")) {
    return (
      <>
        <PageHeader title="Verification" />
        {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <Card>
          <Badge value={status} />
          <p className="mt-3 text-sm">{status === "approved"
            ? "Your business is verified. You can accept payments and request payouts."
            : "Your documents are being reviewed, usually within 1–2 business days. Payments switch on as soon as it's approved."}</p>
          {status === "pending" && (
            <ol className="mt-4 grid sm:grid-cols-3 gap-3 text-xs">
              {[["Submitted", true], ["Compliance review", true], ["Payments switched on", false]].map(([label, done], i) => (
                <li key={i} className={`rounded-xl border p-3 ${done ? "border-brand-500/40 bg-brand-50 dark:bg-brand-500/10" : "border-line dark:border-white/10"}`}>
                  <span className="font-semibold">{i + 1}. {label}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </>
    )
  }
  if (!can(merchant?.role, "owner")) {
    return <Notice tone="warn">Only the business owner can submit verification.</Notice>
  }

  const err = (k: keyof Form) => (touched ? bErr[k] : undefined)

  return (
    <>
      <PageHeader title="Verify your business" subtitle="Required by our licensed partners before you can accept payments. Documents are stored encrypted and used only for verification." />
      {status === "rejected" && <div className="mb-4"><Notice tone="error">Your previous submission was not approved. Please correct the details and resubmit.</Notice></div>}
      {msg && <div className="mb-4" role="status"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {!upgrade && step === 0 && (
        <Card className="mb-6">
          <p className="font-semibold">Street vendor, tuck shop or individual landlord?</p>
          <p className="mt-1 text-sm text-ink-muted">
            No business registration needed. We verify you with the ID you already verified in the BukkaPay app, and you can start
            accepting payments straight away, up to the individual seller limits. You can upgrade to a registered business at any time.
          </p>
          <Button className="mt-4" variant="secondary" disabled={busy} onClick={verifyIndividual}>Verify me as an individual seller</Button>
        </Card>
      )}

      <nav aria-label="Verification steps" className="mb-6">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((label, i) => {
            const done = i < 3 ? stepOk[i] : false
            const reachable = i <= step || stepOk.slice(0, i).every(Boolean)
            return (
              <li key={label}>
                <button type="button" disabled={!reachable} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                  className={`w-full text-left rounded-xl border px-3 py-2 transition disabled:opacity-50 ${i === step ? "border-brand-600 bg-brand-50 dark:bg-brand-500/10" : "border-line dark:border-white/10 hover:bg-surface dark:hover:bg-white/5"}`}>
                  <span className={`text-[11px] font-semibold ${done ? "text-emerald-600" : "text-ink-muted"}`}>{done ? "✓ Done" : `Step ${i + 1}`}</span>
                  <span className="block text-sm font-semibold">{label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {step === 0 && (
        <Card>
          <p className="font-semibold mb-4">Business details</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Registration number" error={err("registrationNumber")}><Input aria-invalid={!!err("registrationNumber")} placeholder="e.g. 2024/123456/07" value={form.registrationNumber} onChange={set("registrationNumber")} /></Field>
            <Field label="Country of registration" error={err("countryCode")} hint={"Only countries where BukkaPay operates are listed."}>
              <Select value={form.countryCode} onChange={set("countryCode")}>
                {!operating.length && <option value="">Loading…</option>}
                {operating.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Registered address" error={err("businessAddress")}><Input aria-invalid={!!err("businessAddress")} autoComplete="street-address" placeholder="Street, suburb, city, postal code" value={form.businessAddress} onChange={set("businessAddress")} /></Field></div>
            <Field label="What the business does" error={err("businessCategory")}><Input aria-invalid={!!err("businessCategory")} placeholder="e.g. grocery retail" value={form.businessCategory} onChange={set("businessCategory")} /></Field>
            <Field label="Contact email" error={err("contactEmail")}><Input aria-invalid={!!err("contactEmail")} type="email" autoComplete="email" value={form.contactEmail} onChange={set("contactEmail")} /></Field>
            <Field label="Contact phone" error={err("contactPhone")} hint={"With the country code, e.g. +27 82 123 4567."}><Input aria-invalid={!!err("contactPhone")} type="tel" autoComplete="tel" value={form.contactPhone} onChange={set("contactPhone")} /></Field>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <p className="font-semibold">Owners & directors</p>
          <p className="text-sm text-ink-muted mb-4">Everyone who owns 25% or more, and every director. Their names are screened against sanctions lists before approval.</p>
          <div className="space-y-3">
            {people.map((p, i) => (
              <div key={i} className="grid sm:grid-cols-[1fr_1fr_160px_auto] gap-2 items-end rounded-xl border border-line p-3 dark:border-white/10">
                <Field label="Full name"><Input autoComplete="off" value={p.fullName} onChange={(e) => setPeople(people.map((x, j) => j === i ? { ...x, fullName: e.target.value } : x))} /></Field>
                <Field label="ID / passport number"><Input autoComplete="off" value={p.idNumber} onChange={(e) => setPeople(people.map((x, j) => j === i ? { ...x, idNumber: e.target.value } : x))} /></Field>
                <Field label="Role">
                  <Select value={p.role} onChange={(e) => setPeople(people.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                    {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                  </Select>
                </Field>
                <Button variant="ghost" aria-label={`Remove person ${i + 1}`} disabled={people.length === 1} onClick={() => setPeople(people.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
          </div>
          {people.length < 20 && <Button className="mt-3" variant="secondary" onClick={() => setPeople([...people, { fullName: "", idNumber: "", role: "director" }])}>+ Add person</Button>}
          {touched && pErr.length > 0 && <div className="mt-4"><Notice tone="error">{pErr.join(" ")}</Notice></div>}
        </Card>
      )}

      {step === 2 && (
        <Card>
          <p className="font-semibold">Documents</p>
          <p className="text-sm text-ink-muted mb-4">PDF or a clear photo, up to {MAX_MB} MB each. All four corners visible, nothing cut off.</p>
          <div className="space-y-3">
            {DOCS.map((d) => {
              const doc = docs[d.type]
              return (
                <div key={d.type} className={`rounded-xl border p-4 ${touched && d.required && !doc ? "border-red-400" : "border-line dark:border-white/10"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{d.label} {!d.required && <span className="font-normal text-ink-muted">(optional)</span>}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{d.hint}</p>
                      {doc && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">✓ {doc.name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {uploading[d.type] ? <span className="text-xs">Uploading…</span> : (
                        <label className="cursor-pointer inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface dark:border-white/10 dark:hover:bg-white/5">
                          {doc ? "Replace" : "Upload"}
                          <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(d.type, f) }} />
                        </label>
                      )}
                      {doc && !uploading[d.type] && (
                        <Button variant="ghost" onClick={() => setDocs((all) => { const n = { ...all }; delete n[d.type]; return n })}>Remove</Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {touched && missingDocs.length > 0 && <div className="mt-4"><Notice tone="error">Still needed: {missingDocs.map((d) => d.label.toLowerCase()).join(", ")}.</Notice></div>}
        </Card>
      )}

      {step === 3 && (
        <Card>
          <p className="font-semibold mb-4">Check and submit</p>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {([["Registration number", form.registrationNumber], ["Country", operating.find((c) => c.code === form.countryCode)?.name ?? form.countryCode],
              ["Registered address", form.businessAddress], ["What the business does", form.businessCategory],
              ["Contact email", form.contactEmail], ["Contact phone", form.contactPhone]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-ink-muted">{k}</dt><dd className="font-medium break-words">{clean(v) || "—"}</dd></div>
            ))}
            <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Owners & directors</dt>
              <dd className="font-medium">{people.filter((p) => clean(p.fullName)).map((p) => `${clean(p.fullName)} (${p.role})`).join(", ") || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-ink-muted">Documents</dt>
              <dd className="font-medium">{DOCS.filter((d) => docs[d.type]).map((d) => d.label).join(", ") || "—"}</dd></div>
          </dl>
          {!allOk && (
            <div className="mt-4"><Notice tone="error">
              Some steps aren't complete: {STEPS.slice(0, 3).filter((_, i) => !stepOk[i]).join(", ")}. Go back and finish them first.
            </Notice></div>
          )}
          <p className="mt-4 text-xs text-ink-muted">By submitting you confirm the details are true and that you're authorised to act for this business.</p>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
        <span className="text-xs text-ink-muted">Your progress is saved on this device.</span>
        {step < 3
          ? <Button onClick={next}>Continue</Button>
          : <Button onClick={submit} disabled={busy || !allOk}>{busy ? "Submitting…" : "Submit for review"}</Button>}
      </div>
    </>
  )
}
