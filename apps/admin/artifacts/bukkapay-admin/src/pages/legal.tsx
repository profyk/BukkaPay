import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataTable, Page, Section, errorMessage, useApi, when } from "@/components/network/kit"
import { LegalMarkdown } from "@/components/legal/LegalMarkdown"
import { api } from "@/lib/api"
import { usePermissions } from "@/lib/permissions"
import { useToast } from "@/hooks/use-toast"

type ReviewStatus = "template" | "in_review" | "approved"
type Version = {
  version: number; title: string; summary: string; effectiveDate: string; reviewStatus: ReviewStatus
  reviewedBy: string | null; changeNote: string | null; publishedBy: string | null; publishedAt: string; body?: string
}
type Draft = {
  slug: string; title: string; summary: string; audience: string; body: string; sortOrder: number; listed: boolean
  draftVersion: number; publishedVersion: number | null; updatedBy: string | null; updatedAt: string | null
  standard: boolean; fromTemplate: boolean; hasUnpublishedChanges?: boolean
}
type ListDoc = Omit<Draft, "body"> & { published: Version | null; hasUnpublishedChanges: boolean }
type Details = Record<string, string>
type ListResponse = {
  documents: ListDoc[]; details: Details; detailsVersion: number
  placeholders: { token: string; label: string }[]; audiences: string[]; reviewStatuses: ReviewStatus[]
}
type DocResponse = { draft: Draft; preview: string; unknownPlaceholders: string[]; versions: Version[] }

const SITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined) ?? "https://www.bukkapay.com"
const REVIEW: Record<ReviewStatus, { label: string; variant: "secondary" | "outline" | "default" }> = {
  template: { label: "Not reviewed", variant: "outline" },
  in_review: { label: "In legal review", variant: "secondary" },
  approved: { label: "Approved by counsel", variant: "default" },
}
const AUDIENCE: Record<string, string> = { everyone: "Everyone", customers: "Customers", merchants: "Merchants", cardholders: "Cardholders" }
const DETAIL_FIELDS: { key: string; label: string; hint?: string; long?: boolean }[] = [
  { key: "legalName", label: "Company legal name", hint: "As registered, e.g. Example (Pty) Ltd" },
  { key: "tradingName", label: "Trading name" },
  { key: "registrationNumber", label: "Company registration number" },
  { key: "countryOfIncorporation", label: "Country of incorporation" },
  { key: "registeredAddress", label: "Registered address", long: true },
  { key: "governingLaw", label: "Governing law", hint: "e.g. the Republic of South Africa" },
  { key: "informationOfficer", label: "Information Officer (name)", hint: "Required by POPIA / PAIA" },
  { key: "informationOfficerEmail", label: "Information Officer email", hint: "Blank = privacy email" },
  { key: "privacyEmail", label: "Privacy email" },
  { key: "supportEmail", label: "Support email" },
  { key: "complaintsEmail", label: "Complaints email", hint: "Blank = support email" },
  { key: "complianceEmail", label: "Compliance email" },
  { key: "securityEmail", label: "Security incident email", hint: "Blank = privacy email" },
  { key: "phone", label: "Phone number" },
  { key: "websiteUrl", label: "Website address" },
  { key: "partnerInstitutions", label: "Licensed partner institutions", hint: "Banks / payment institutions that hold customer funds", long: true },
  { key: "cardIssuer", label: "Card issuer", hint: "The licensed issuer of the virtual Visa card" },
]

/** Fill {{placeholders}} the same way the API does, so the live preview
 *  matches what the website will show. */
function fill(text: string, d: Details, labels: Record<string, string>): string {
  const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
  const fallback: Record<string, string> = {
    complaints_email: d.supportEmail, security_email: d.privacyEmail, information_officer_email: d.privacyEmail,
  }
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => {
    if (!(key in labels)) return m
    return d[camel(key)] || fallback[key] || `[${labels[key]}]`
  })
}

/** Legal documents pipeline: draft here → publish a version with an effective
 *  date and review status → the website updates within seconds. Published
 *  versions are permanent and listed on the website as version history. */
export default function LegalPage() {
  const { data, isLoading, error } = useApi<ListResponse>(["legal"], "/admin/legal")
  const perms = usePermissions()
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  if (isLoading || !data) return <Page title="Legal documents">{error ? <p className="text-destructive">{errorMessage(error)}</p> : <p>Loading…</p>}</Page>
  const labels = Object.fromEntries(data.placeholders.map((p) => [p.token.slice(2, -2), p.label]))
  const canEdit = perms.can("legal.manage")
  const canPublish = perms.can("legal.publish")

  if (open) {
    return <DocumentEditor slug={open} list={data} labels={labels} canEdit={canEdit} canPublish={canPublish} onBack={() => setOpen(null)} />
  }
  const missingDetails = DETAIL_FIELDS.filter((f) => ["legalName", "registrationNumber", "registeredAddress", "informationOfficer", "governingLaw"].includes(f.key) && !data.details[f.key])
  return (
    <Page title="Legal documents"
      subtitle="Terms, privacy policy and other policies shown on the website. Edit a draft, then publish it as a new version with an effective date. Every published version is kept and shown as version history."
      actions={<>
        <a href={`${SITE_URL}/legal`} target="_blank" rel="noopener" className="self-center text-sm text-primary underline">Open legal centre ↗</a>
        {canEdit && <Button onClick={() => setCreating(true)}>+ New document</Button>}
      </>}>
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="details">Company details{missingDetails.length > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{missingDetails.length}</span>}</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="space-y-4 pt-4">
          {missingDetails.length > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Company details are missing ({missingDetails.map((f) => f.label.toLowerCase()).join(", ")}). Documents show them as [placeholders] until you fill them in on the Company details tab.
            </p>
          )}
          <DataTable rows={data.documents} rowKey={(d) => d.slug}
            columns={[
              { header: "Document", cell: (d) => (
                <button className="text-left" onClick={() => setOpen(d.slug)}>
                  <span className="font-medium text-primary hover:underline">{d.title}</span>
                  <span className="block text-xs text-muted-foreground">/legal/{d.slug}{!d.listed && " · hidden from website"}</span>
                </button>) },
              { header: "For", cell: (d) => AUDIENCE[d.audience] ?? d.audience },
              { header: "Live on website", cell: (d) => d.published
                ? <span>Version {d.published.version}<span className="block text-xs text-muted-foreground">effective {d.published.effectiveDate}</span></span>
                : d.standard ? <span className="text-muted-foreground">Template (draft banner)</span> : <span className="text-muted-foreground">Not published</span> },
              { header: "Review", cell: (d) => <ReviewBadge status={d.published?.reviewStatus ?? "template"} /> },
              { header: "Draft", cell: (d) => d.hasUnpublishedChanges ? <Badge variant="secondary">Unpublished changes</Badge> : <span className="text-xs text-muted-foreground">Up to date</span> },
              { header: "", cell: (d) => <Button size="sm" variant="outline" onClick={() => setOpen(d.slug)}>{canEdit ? "Edit" : "View"}</Button> },
            ]} />
        </TabsContent>
        <TabsContent value="details" className="pt-4">
          <DetailsForm details={data.details} version={data.detailsVersion} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
      <CreateDialog open={creating} onOpenChange={setCreating} onCreated={(slug) => { setCreating(false); setOpen(slug) }} />
    </Page>
  )
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const r = REVIEW[status]
  return <Badge variant={r.variant}>{r.label}</Badge>
}

function F({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function DocumentEditor({ slug, list, labels, canEdit, canPublish, onBack }: {
  slug: string; list: ListResponse; labels: Record<string, string>; canEdit: boolean; canPublish: boolean; onBack: () => void
}) {
  const { data, isLoading, error } = useApi<DocResponse>(["legal", slug], `/admin/legal/${slug}`)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [view, setView] = useState<"split" | "edit" | "preview">("split")
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const qc = useQueryClient()
  const { toast } = useToast()
  useEffect(() => { if (data) setDraft(data.draft) }, [data])
  const preview = useMemo(() => (draft ? fill(draft.body, list.details, labels) : ""), [draft, list.details, labels])

  if (isLoading || !data || !draft) return <Page title="Legal documents">{error ? <p className="text-destructive">{errorMessage(error)}</p> : <p>Loading…</p>}</Page>
  const saved = data.draft
  const dirty = (["title", "summary", "audience", "body", "sortOrder", "listed"] as const).some((k) => draft[k] !== saved[k])
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const latest = data.versions[0]

  const save = async () => {
    setSaving(true)
    try {
      const { title, summary, audience, body, sortOrder, listed } = draft
      await api.put(`/admin/legal/${slug}`, { data: { title, summary, audience, body, sortOrder, listed }, version: saved.draftVersion })
      toast({ title: "Draft saved", description: "Not public until you publish it." })
      await Promise.all([qc.invalidateQueries({ queryKey: ["legal", slug] }), qc.invalidateQueries({ queryKey: ["legal"] })])
    } catch (e) {
      toast({ title: "Not saved", description: errorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title={draft.title}
      subtitle={`/legal/${slug} · ${latest ? `version ${latest.version} live since ${latest.effectiveDate}` : "never published — the website shows the template with a draft banner"}`}
      actions={<>
        <Button variant="ghost" onClick={onBack}>← All documents</Button>
        {canEdit && data.draft.standard && (
          <Button variant="outline" disabled={saving} onClick={async () => {
            if (dirty && !window.confirm("Replace your unsaved changes with BukkaPay's latest template?")) return
            setSaving(true)
            try {
              await api.post(`/admin/legal/${slug}/load-template`)
              toast({ title: "Latest template loaded into the draft", description: "Review it, then publish to make it live." })
              await Promise.all([qc.invalidateQueries({ queryKey: ["legal", slug] }), qc.invalidateQueries({ queryKey: ["legal"] })])
            } catch (e) {
              toast({ title: "Not loaded", description: errorMessage(e), variant: "destructive" })
            } finally { setSaving(false) }
          }}>Load latest template</Button>
        )}
        <a href={`${SITE_URL}/legal/${slug}`} target="_blank" rel="noopener" className="self-center text-sm text-primary underline">View on website ↗</a>
      </>}>
      <div className="grid gap-4 md:grid-cols-4">
        <F label="Title"><Input disabled={!canEdit} maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} /></F>
        <F label="Shown to">
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={!canEdit} value={draft.audience} onChange={(e) => set({ audience: e.target.value })}>
            {list.audiences.map((a) => <option key={a} value={a}>{AUDIENCE[a] ?? a}</option>)}
          </select>
        </F>
        <F label="Order" hint="Lower comes first"><Input type="number" disabled={!canEdit} value={draft.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) || 0 })} /></F>
        <label className="flex items-center gap-3 pt-6"><Switch checked={draft.listed} disabled={!canEdit} onCheckedChange={(v) => set({ listed: v })} /><span className="text-sm">Listed in the legal centre</span></label>
        <div className="md:col-span-4">
          <F label="Summary" hint={`${draft.summary.length}/300 — shown on the legal centre page`}><Input disabled={!canEdit} maxLength={300} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} /></F>
        </div>
      </div>

      <Section title="Document" actions={
        <div className="flex gap-1">
          {(["edit", "split", "preview"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</Button>)}
        </div>}>
        <div className={`grid gap-4 ${view === "split" ? "lg:grid-cols-2" : ""}`}>
          {view !== "preview" && (
            <Textarea className="min-h-[65vh] font-mono text-[13px] leading-relaxed" disabled={!canEdit} value={draft.body}
                      onChange={(e) => set({ body: e.target.value })} spellCheck />
          )}
          {view !== "edit" && (
            <div className="legal-preview min-h-[65vh] overflow-y-auto rounded-md border bg-white p-6 text-slate-900 lg:max-h-[75vh]">
              <LegalMarkdown source={preview} />
            </div>
          )}
        </div>
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Formatting and placeholders</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <ul className="space-y-1 text-muted-foreground">
              <li><code>## Heading</code> — section heading (appears in the contents list)</li>
              <li><code>### Sub-heading</code></li>
              <li><code>- item</code> or <code>1. item</code> — lists</li>
              <li><code>**bold**</code> · <code>[text](/legal/terms)</code> — links</li>
              <li><code>&gt; note</code> — highlighted note</li>
              <li>A blank line starts a new paragraph</li>
            </ul>
            <ul className="space-y-1 text-muted-foreground">
              {list.placeholders.map((p) => <li key={p.token}><code>{p.token}</code> — {p.label}</li>)}
            </ul>
          </div>
        </details>
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {canEdit && <Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save draft"}</Button>}
        {canEdit && <Button variant="outline" onClick={() => setDraft(saved)} disabled={!dirty || saving}>Discard</Button>}
        {canPublish && (
          <Button variant="secondary" onClick={() => setPublishing(true)} disabled={dirty}
                  title={dirty ? "Save the draft first" : undefined}>Publish…</Button>
        )}
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : data.draft.hasUnpublishedChanges ? "Saved draft differs from the live version" : "Draft matches the live version"}
          {saved.updatedBy && ` · last saved by ${saved.updatedBy} ${when(saved.updatedAt)}`}
        </span>
      </div>

      <Section title="Published versions">
        <DataTable rows={data.versions} rowKey={(v) => String(v.version)} empty="Not published yet — the website shows the template marked as a draft."
          columns={[
            { header: "Version", cell: (v) => v.version },
            { header: "Effective", cell: (v) => v.effectiveDate },
            { header: "Review", cell: (v) => <span><ReviewBadge status={v.reviewStatus} />{v.reviewedBy && <span className="block text-xs text-muted-foreground">{v.reviewedBy}</span>}</span> },
            { header: "Change note", cell: (v) => v.changeNote ?? "—" },
            { header: "Published", cell: (v) => <span>{when(v.publishedAt)}<span className="block text-xs text-muted-foreground">{v.publishedBy}</span></span> },
            { header: "", cell: (v) => <Button size="sm" variant="ghost" onClick={() => setViewing(v.version)}>View</Button> },
          ]} />
      </Section>

      <PublishDialog open={publishing} onOpenChange={setPublishing} slug={slug} draftVersion={saved.draftVersion}
                     nextVersion={(latest?.version ?? 0) + 1} />
      <VersionDialog slug={slug} version={viewing} onClose={() => setViewing(null)} details={list.details} labels={labels} />
    </Page>
  )
}

function PublishDialog({ open, onOpenChange, slug, draftVersion, nextVersion }: {
  open: boolean; onOpenChange: (o: boolean) => void; slug: string; draftVersion: number; nextVersion: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ effectiveDate: today, reviewStatus: "template" as ReviewStatus, reviewedBy: "", changeNote: "" })
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  useEffect(() => { if (open) setForm({ effectiveDate: today, reviewStatus: "template", reviewedBy: "", changeNote: "" }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const needsReviewer = form.reviewStatus === "approved" && !form.reviewedBy.trim()
  const publish = async () => {
    setBusy(true)
    try {
      await api.post(`/admin/legal/${slug}/publish`, { ...form, reviewedBy: form.reviewedBy || null, changeNote: form.changeNote || null, draftVersion })
      toast({ title: `Version ${nextVersion} published`, description: "The website updates within seconds." })
      await Promise.all([qc.invalidateQueries({ queryKey: ["legal", slug] }), qc.invalidateQueries({ queryKey: ["legal"] })])
      onOpenChange(false)
    } catch (e) {
      toast({ title: "Not published", description: errorMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish version {nextVersion}</DialogTitle>
          <DialogDescription>The saved draft becomes the version customers see. Published versions can't be edited or deleted — publish a new version to change it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <F label="Effective date" hint="Material changes to terms usually need 30 days' notice to customers.">
            <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
          </F>
          <F label="Legal review">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.reviewStatus}
                    onChange={(e) => setForm({ ...form, reviewStatus: e.target.value as ReviewStatus })}>
              <option value="template">Not reviewed yet — website shows a draft notice</option>
              <option value="in_review">With our lawyer — website shows "under review"</option>
              <option value="approved">Approved by counsel — no notice</option>
            </select>
          </F>
          <F label={`Reviewed by${form.reviewStatus === "approved" ? " *" : ""}`} hint="Law firm or lawyer who approved it">
            <Input value={form.reviewedBy} onChange={(e) => setForm({ ...form, reviewedBy: e.target.value })} />
          </F>
          <F label="What changed" hint="Shown in the version history on the website">
            <Textarea rows={2} maxLength={1000} value={form.changeNote} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} />
          </F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={publish} disabled={busy || !form.effectiveDate || needsReviewer}>{busy ? "Publishing…" : `Publish version ${nextVersion}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VersionDialog({ slug, version, onClose, details, labels }: {
  slug: string; version: number | null; onClose: () => void; details: Details; labels: Record<string, string>
}) {
  const { data } = useQuery({
    queryKey: ["legal", slug, "v", version],
    queryFn: async () => (await api.get(`/admin/legal/${slug}/versions/${version}`)).data as Version,
    enabled: version !== null,
  })
  return (
    <Dialog open={version !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{data ? `${data.title} — version ${data.version}` : "Loading…"}</DialogTitle>
          {data && <DialogDescription>Effective {data.effectiveDate} · published by {data.publishedBy ?? "—"} {when(data.publishedAt)}</DialogDescription>}
        </DialogHeader>
        <div className="legal-preview max-h-[65vh] overflow-y-auto rounded-md border bg-white p-6 text-slate-900">
          {data?.body && <LegalMarkdown source={fill(data.body, details, labels)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (slug: string) => void }) {
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  const auto = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
  const create = async () => {
    setBusy(true)
    try {
      const { data } = await api.post("/admin/legal", { title, slug: slug || auto })
      await qc.invalidateQueries({ queryKey: ["legal"] })
      setTitle(""); setSlug("")
      onCreated(data.draft.slug)
    } catch (e) {
      toast({ title: "Not created", description: errorMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New legal document</DialogTitle>
          <DialogDescription>Starts as an unpublished draft. It appears on the website once you publish it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <F label="Title"><Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fee schedule" /></F>
          <F label="Web address" hint={`www.bukkapay.com/legal/${slug || auto || "…"}`}>
            <Input value={slug} placeholder={auto} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
          </F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={busy || title.trim().length < 3}>{busy ? "Creating…" : "Create draft"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailsForm({ details, version, canEdit }: { details: Details; version: number; canEdit: boolean }) {
  const [value, setValue] = useState<Details>(details)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  useEffect(() => setValue(details), [details])
  const dirty = JSON.stringify(value) !== JSON.stringify(details)
  const save = async () => {
    setSaving(true)
    try {
      await api.put("/admin/legal-details", { data: value, version })
      toast({ title: "Company details saved", description: "Every legal document on the website updates within seconds." })
      await qc.invalidateQueries({ queryKey: ["legal"] })
    } catch (e) {
      toast({ title: "Not saved", description: errorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">These fill the <code>{"{{placeholders}}"}</code> in every document. They apply to published versions immediately — no new version is needed. Empty fields show as [placeholders] on the website.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {DETAIL_FIELDS.map((f) => (
          <F key={f.key} label={f.label} hint={f.hint}>
            {f.long
              ? <Textarea rows={2} disabled={!canEdit} value={value[f.key] ?? ""} onChange={(e) => setValue({ ...value, [f.key]: e.target.value })} />
              : <Input disabled={!canEdit} value={value[f.key] ?? ""} onChange={(e) => setValue({ ...value, [f.key]: e.target.value })} />}
          </F>
        ))}
      </div>
      {canEdit && (
        <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
          <Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save details"}</Button>
          <Button variant="outline" onClick={() => setValue(details)} disabled={!dirty || saving}>Discard</Button>
        </div>
      )}
    </div>
  )
}
