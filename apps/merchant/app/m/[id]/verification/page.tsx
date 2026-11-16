"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Country = { code: string; name: string; status: string; currency: string }
type Director = { fullName: string; idNumber: string; role: string }
const DOCS = [
  { type: "registration_certificate", label: "Company registration certificate" },
  { type: "proof_of_address", label: "Proof of business address" },
  { type: "director_id", label: "Owner / director ID" },
  { type: "bank_letter", label: "Bank confirmation letter (optional)" },
]

export default function VerificationPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const countries = useData<Country[]>("/public/countries")
  const [form, setForm] = useState({ registrationNumber: "", businessAddress: "", countryCode: "ZA", businessCategory: "", contactEmail: "", contactPhone: "" })
  const [directors, setDirectors] = useState<Director[]>([{ fullName: "", idNumber: "", role: "director" }])
  const [docs, setDocs] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [status, setStatus] = useState(merchant?.kybStatus)
  const [tier, setTier] = useState(merchant?.verificationTier)
  const [upgrade, setUpgrade] = useState(false)
  useEffect(() => { setStatus(merchant?.kybStatus); setTier(merchant?.verificationTier) }, [merchant?.kybStatus, merchant?.verificationTier])

  const verifyIndividual = async () => {
    setMsg(null)
    try {
      const r = await api<{ kybStatus: string; verificationTier: "individual" }>(`/merchants/${id}/kyb/individual`, { method: "POST" })
      setStatus(r.kybStatus); setTier(r.verificationTier)
      setMsg({ tone: "success", text: "Verified as an individual seller. You can accept payments now." })
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  const upload = async (type: string, file: File) => {
    setUploading(type)
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller")
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
        reader.onerror = () => reject(new Error("Couldn't read the file"))
        reader.readAsDataURL(file)
      })
      const r = await api<{ url: string }>("/upload", {
        method: "POST", json: { base64, mimeType: file.type, filename: file.name, purpose: "kyb" },
      })
      setDocs({ ...docs, [type]: r.url })
    } catch (e: any) { setMsg({ tone: "error", text: `Upload failed: ${e.message}` }) }
    finally { setUploading(null) }
  }
  const submit = async () => {
    setMsg(null)
    try {
      await api(`/merchants/${id}/kyb`, {
        method: "POST",
        json: { ...form, directors: directors.filter((d) => d.fullName && d.idNumber), documents: Object.entries(docs).map(([type, url]) => ({ type, url })) },
      })
      setStatus("pending"); setUpgrade(false)
      setMsg({ tone: "success", text: "Submitted. BukkaPay's compliance team will review it — you'll get a notification when it's decided." })
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const operating = countries.data?.filter((c) => c.status === "pilot" || c.status === "live") ?? []

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
        <Card>
          <Badge value={status} />
          <p className="mt-3 text-sm">{status === "approved" ? "Your business is verified. You can accept payments and request payouts." : "Your documents are being reviewed. Payments switch on as soon as it's approved."}</p>
        </Card>
      </>
    )
  }
  if (!can(merchant?.role, "owner")) {
    return <Notice tone="warn">Only the business owner can submit verification.</Notice>
  }

  return (
    <>
      <PageHeader title="Verify your business" subtitle="Required by our licensed partners before you can accept payments. Your documents are stored securely and only used for verification." />
      {status === "rejected" && <div className="mb-4"><Notice tone="error">Your previous submission was not approved. Please correct the details and resubmit.</Notice></div>}
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {!upgrade && (
        <Card className="mb-6">
          <p className="font-semibold">Street vendor, tuck shop or individual landlord?</p>
          <p className="mt-1 text-sm text-ink-muted">
            No business registration needed. We verify you with the ID you already verified in the BukkaPay app, and you can start
            accepting payments straight away, up to the individual seller limits. You can upgrade to a registered business at any time.
          </p>
          <Button className="mt-4" onClick={verifyIndividual}>Verify me as an individual seller</Button>
        </Card>
      )}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <p className="font-semibold mb-4">Business details</p>
          <div className="space-y-3">
            <Field label="Registration number"><Input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></Field>
            <Field label="Registered address"><Input value={form.businessAddress} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} /></Field>
            <Field label="Country" hint="Only countries where BukkaPay is operating are listed.">
              <Select value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })}>
                {operating.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
              </Select>
            </Field>
            <Field label="Category"><Input placeholder="e.g. grocery retail" value={form.businessCategory} onChange={(e) => setForm({ ...form, businessCategory: e.target.value })} /></Field>
            <Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
            <Field label="Contact phone"><Input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></Field>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="font-semibold mb-4">Owners & directors</p>
            {directors.map((d, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                <Input placeholder="Full name" value={d.fullName} onChange={(e) => setDirectors(directors.map((x, j) => j === i ? { ...x, fullName: e.target.value } : x))} />
                <Input placeholder="ID / passport number" value={d.idNumber} onChange={(e) => setDirectors(directors.map((x, j) => j === i ? { ...x, idNumber: e.target.value } : x))} />
              </div>
            ))}
            <Button variant="ghost" onClick={() => setDirectors([...directors, { fullName: "", idNumber: "", role: "director" }])}>+ Add person</Button>
          </Card>
          <Card>
            <p className="font-semibold mb-4">Documents</p>
            <div className="space-y-3">
              {DOCS.map((d) => (
                <Field key={d.type} label={d.label}>
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && upload(d.type, e.target.files[0])} className="text-sm" />
                    {uploading === d.type ? <span className="text-xs">Uploading…</span> : docs[d.type] ? <span className="text-xs text-emerald-700">Uploaded</span> : null}
                  </div>
                </Field>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <Button className="mt-6" onClick={submit}
              disabled={!form.registrationNumber || !form.businessAddress || !directors[0].fullName || !docs.registration_certificate || !docs.proof_of_address || !docs.director_id}>
        Submit for review
      </Button>
    </>
  )
}
