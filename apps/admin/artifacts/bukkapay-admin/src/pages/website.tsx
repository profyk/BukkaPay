import { useEffect, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable, Page, Section, Stat, errorMessage, useApi, when } from "@/components/network/kit"
import { api } from "@/lib/api"
import { usePermissions } from "@/lib/permissions"
import { useToast } from "@/hooks/use-toast"

type LinkItem = { label: string; href: string }
type Site = {
  settings: {
    launchMode: "waitlist" | "live"
    announcement: { enabled: boolean; text: string; link: LinkItem | null; tone: "info" | "success" | "warning" }
    iosUrl: string | null; androidUrl: string | null; supportEmail: string; salesEmail: string; pressEmail: string
    socials: LinkItem[]; seoTitle: string; seoDescription: string
  }
  home: { eyebrow: string; title: string; subtitle: string; benefits: string[]; features: { tag: string; title: string; body: string }[]; useCases: { audience: string; title: string; body: string }[] }
  pricing: { enabled: boolean; intro: string; footnote: string; plans: { name: string; price: string; period: string; description: string; features: string[]; cta: LinkItem | null; highlighted: boolean }[] }
  faq: { items: { question: string; answer: string }[] }
  versions: Record<string, number>
}
type Waitlist = { total: number; byCountry: Record<string, number>; signups: { id: string; email: string; name: string | null; countryCode: string | null; kind: string; source: string | null; createdAt: string }[] }

const SITE_URL = (import.meta.env.VITE_WEBSITE_URL as string | undefined) ?? "https://www.bukkapay.com"

/** Edit the public website without a redeploy. Saves are validated by the
 *  API, versioned (no silent overwrites), audited, and refresh the site. */
export default function WebsitePage() {
  const { data, isLoading, error } = useApi<{ site: Site }>(["website"], "/admin/website")
  const perms = usePermissions()
  const canEdit = perms.can("website.manage")
  if (isLoading || !data) return <Page title="Website">{error ? <p className="text-destructive">{errorMessage(error)}</p> : <p>Loading…</p>}</Page>
  const site = data.site
  return (
    <Page title="Website" subtitle="Content for www.bukkapay.com. Changes go live within seconds of saving. Only publish claims BukkaPay can back up: licences, countries, fees and speeds must be true today."
          actions={<a href={SITE_URL} target="_blank" rel="noopener" className="text-sm text-primary underline">Open website ↗</a>}>
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="home">Home page</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
        </TabsList>
        <TabsContent value="settings"><SectionEditor k="settings" initial={site.settings} version={site.versions.settings ?? 0} canEdit={canEdit} render={SettingsForm} /></TabsContent>
        <TabsContent value="home"><SectionEditor k="home" initial={site.home} version={site.versions.home ?? 0} canEdit={canEdit} render={HomeForm} /></TabsContent>
        <TabsContent value="pricing"><SectionEditor k="pricing" initial={site.pricing} version={site.versions.pricing ?? 0} canEdit={canEdit} render={PricingForm} /></TabsContent>
        <TabsContent value="faq"><SectionEditor k="faq" initial={site.faq} version={site.versions.faq ?? 0} canEdit={canEdit} render={FaqForm} /></TabsContent>
        <TabsContent value="waitlist"><WaitlistTab canExport={canEdit} /></TabsContent>
      </Tabs>
    </Page>
  )
}

type FormProps<T> = { value: T; set: (v: T) => void; disabled: boolean }

function SectionEditor<T>({ k, initial, version, canEdit, render: Form }: {
  k: string; initial: T; version: number; canEdit: boolean; render: (p: FormProps<T>) => ReactNode
}) {
  const [value, setValue] = useState<T>(initial)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const { toast } = useToast()
  useEffect(() => setValue(initial), [initial])
  const dirty = JSON.stringify(value) !== JSON.stringify(initial)

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/website/${k}`, { data: value, version })
      toast({ title: "Published", description: "The website refreshes within seconds." })
      await qc.invalidateQueries({ queryKey: ["website"] })
    } catch (e) {
      toast({ title: "Not saved", description: errorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-6 pt-4">
      {Form({ value, set: setValue, disabled: !canEdit })}
      {canEdit && (
        <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3">
          <Button onClick={save} disabled={!dirty || saving}>{saving ? "Publishing…" : "Publish changes"}</Button>
          <Button variant="outline" onClick={() => setValue(initial)} disabled={!dirty || saving}>Discard</Button>
          {!dirty && <span className="self-center text-xs text-muted-foreground">Version {version} · no unsaved changes</span>}
        </div>
      )}
    </div>
  )
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

/** Repeating rows of small objects. */
function Rows<T extends Record<string, any>>({ items, set, blank, disabled, fields, max }: {
  items: T[]; set: (v: T[]) => void; blank: T; disabled: boolean; max: number
  fields: { key: keyof T; label: string; long?: boolean }[]
}) {
  const update = (i: number, key: keyof T, v: any) => set(items.map((x, j) => (j === i ? { ...x, [key]: v } : x)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items];[next[i], next[j]] = [next[j], next[i]]; set(next)
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border p-3 space-y-2">
          {fields.map((f) => f.long
            ? <Textarea key={String(f.key)} placeholder={f.label} value={item[f.key] ?? ""} disabled={disabled} rows={2} onChange={(e) => update(i, f.key, e.target.value)} />
            : <Input key={String(f.key)} placeholder={f.label} value={item[f.key] ?? ""} disabled={disabled} onChange={(e) => update(i, f.key, e.target.value)} />)}
          {!disabled && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>↑</Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>↓</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => set(items.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          )}
        </div>
      ))}
      {!disabled && items.length < max && <Button size="sm" variant="outline" onClick={() => set([...items, { ...blank }])}>+ Add</Button>}
    </div>
  )
}

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean)

function SettingsForm({ value: s, set, disabled }: FormProps<Site["settings"]>) {
  const a = s.announcement
  return (
    <>
      <Section title="Launch">
        <div className="grid gap-4 md:grid-cols-2">
          <F label="Main call to action" hint="Waitlist before launch; switch to Live once the apps are in the stores.">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={disabled} value={s.launchMode}
                    onChange={(e) => set({ ...s, launchMode: e.target.value as "waitlist" | "live" })}>
              <option value="waitlist">Waitlist (pre-launch)</option>
              <option value="live">Live — download the app</option>
            </select>
          </F>
          <F label="iPhone App Store link"><Input disabled={disabled} value={s.iosUrl ?? ""} placeholder="https://apps.apple.com/…" onChange={(e) => set({ ...s, iosUrl: e.target.value || null })} /></F>
          <F label="Android Play Store link"><Input disabled={disabled} value={s.androidUrl ?? ""} placeholder="https://play.google.com/…" onChange={(e) => set({ ...s, androidUrl: e.target.value || null })} /></F>
        </div>
      </Section>
      <Section title="Announcement bar">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3"><Switch checked={a.enabled} disabled={disabled} onCheckedChange={(v) => set({ ...s, announcement: { ...a, enabled: v } })} /><span className="text-sm">Show on every page</span></label>
          <F label="Style">
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={disabled} value={a.tone} onChange={(e) => set({ ...s, announcement: { ...a, tone: e.target.value as any } })}>
              <option value="info">Brand</option><option value="success">Good news</option><option value="warning">Warning</option>
            </select>
          </F>
          <F label="Text"><Input disabled={disabled} maxLength={200} value={a.text} onChange={(e) => set({ ...s, announcement: { ...a, text: e.target.value } })} /></F>
          <F label="Link (optional)">
            <div className="flex gap-2">
              <Input disabled={disabled} placeholder="Label" value={a.link?.label ?? ""} onChange={(e) => set({ ...s, announcement: { ...a, link: e.target.value || a.link?.href ? { label: e.target.value, href: a.link?.href ?? "" } : null } })} />
              <Input disabled={disabled} placeholder="/countries or https://…" value={a.link?.href ?? ""} onChange={(e) => set({ ...s, announcement: { ...a, link: e.target.value || a.link?.label ? { label: a.link?.label ?? "", href: e.target.value } : null } })} />
            </div>
          </F>
        </div>
      </Section>
      <Section title="Contact & social">
        <div className="grid gap-4 md:grid-cols-3">
          <F label="Support email"><Input disabled={disabled} value={s.supportEmail} onChange={(e) => set({ ...s, supportEmail: e.target.value })} /></F>
          <F label="Sales email"><Input disabled={disabled} value={s.salesEmail} onChange={(e) => set({ ...s, salesEmail: e.target.value })} /></F>
          <F label="Press email"><Input disabled={disabled} value={s.pressEmail} onChange={(e) => set({ ...s, pressEmail: e.target.value })} /></F>
        </div>
        <div className="mt-4"><Rows items={s.socials} set={(v) => set({ ...s, socials: v })} blank={{ label: "", href: "" }} disabled={disabled} max={8}
          fields={[{ key: "label", label: "Name (e.g. LinkedIn)" }, { key: "href", label: "https://…" }]} /></div>
      </Section>
      <Section title="Search & sharing">
        <div className="grid gap-4">
          <F label="Title" hint={`${s.seoTitle.length}/70 — shown in Google and link previews`}><Input disabled={disabled} maxLength={70} value={s.seoTitle} onChange={(e) => set({ ...s, seoTitle: e.target.value })} /></F>
          <F label="Description" hint={`${s.seoDescription.length}/160`}><Textarea disabled={disabled} maxLength={160} value={s.seoDescription} onChange={(e) => set({ ...s, seoDescription: e.target.value })} /></F>
        </div>
      </Section>
    </>
  )
}

function HomeForm({ value: h, set, disabled }: FormProps<Site["home"]>) {
  return (
    <>
      <Section title="Hero">
        <div className="grid gap-4">
          <F label="Eyebrow"><Input disabled={disabled} maxLength={60} value={h.eyebrow} onChange={(e) => set({ ...h, eyebrow: e.target.value })} /></F>
          <F label="Headline"><Input disabled={disabled} maxLength={80} value={h.title} onChange={(e) => set({ ...h, title: e.target.value })} /></F>
          <F label="Subtitle"><Textarea disabled={disabled} maxLength={280} value={h.subtitle} onChange={(e) => set({ ...h, subtitle: e.target.value })} /></F>
          <F label="Benefits" hint="One per line, up to 5"><Textarea disabled={disabled} rows={4} value={h.benefits.join("\n")} onChange={(e) => set({ ...h, benefits: lines(e.target.value).slice(0, 5) })} /></F>
        </div>
      </Section>
      <Section title="Features">
        <Rows items={h.features} set={(v) => set({ ...h, features: v })} blank={{ tag: "", title: "", body: "" }} disabled={disabled} max={12}
              fields={[{ key: "tag", label: "Tag (e.g. Business)" }, { key: "title", label: "Title" }, { key: "body", label: "Description", long: true }]} />
      </Section>
      <Section title="Use cases">
        <Rows items={h.useCases} set={(v) => set({ ...h, useCases: v })} blank={{ audience: "", title: "", body: "" }} disabled={disabled} max={8}
              fields={[{ key: "audience", label: "Who (e.g. Street vendors)" }, { key: "title", label: "Title" }, { key: "body", label: "Description", long: true }]} />
      </Section>
    </>
  )
}

function PricingForm({ value: p, set, disabled }: FormProps<Site["pricing"]>) {
  const plan = (i: number, patch: Partial<Site["pricing"]["plans"][number]>) => set({ ...p, plans: p.plans.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <>
      <Section title="Pricing page">
        <label className="flex items-center gap-3"><Switch checked={p.enabled} disabled={disabled} onCheckedChange={(v) => set({ ...p, enabled: v })} /><span className="text-sm">Publish plans (when off, the page says plans are announced at launch)</span></label>
        <div className="mt-4 grid gap-4">
          <F label="Intro"><Input disabled={disabled} value={p.intro} onChange={(e) => set({ ...p, intro: e.target.value })} /></F>
          <F label="Footnote"><Input disabled={disabled} value={p.footnote} onChange={(e) => set({ ...p, footnote: e.target.value })} /></F>
        </div>
      </Section>
      <Section title="Plans">
        <div className="grid gap-4 md:grid-cols-2">
          {p.plans.map((pl, i) => (
            <div key={i} className="space-y-2 rounded-xl border p-4">
              <div className="grid grid-cols-3 gap-2">
                <Input disabled={disabled} placeholder="Name" value={pl.name} onChange={(e) => plan(i, { name: e.target.value })} />
                <Input disabled={disabled} placeholder="Price (R299)" value={pl.price} onChange={(e) => plan(i, { price: e.target.value })} />
                <Input disabled={disabled} placeholder="/month" value={pl.period} onChange={(e) => plan(i, { period: e.target.value })} />
              </div>
              <Input disabled={disabled} placeholder="Who it's for" value={pl.description} onChange={(e) => plan(i, { description: e.target.value })} />
              <Textarea disabled={disabled} placeholder="Features, one per line" rows={4} value={pl.features.join("\n")} onChange={(e) => plan(i, { features: lines(e.target.value).slice(0, 10) })} />
              <div className="grid grid-cols-2 gap-2">
                <Input disabled={disabled} placeholder="Button label" value={pl.cta?.label ?? ""} onChange={(e) => plan(i, { cta: e.target.value ? { label: e.target.value, href: pl.cta?.href ?? "/#waitlist" } : null })} />
                <Input disabled={disabled} placeholder="Button link" value={pl.cta?.href ?? ""} onChange={(e) => plan(i, { cta: pl.cta ? { ...pl.cta, href: e.target.value } : null })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><Switch checked={pl.highlighted} disabled={disabled} onCheckedChange={(v) => plan(i, { highlighted: v })} />Highlight</label>
                {!disabled && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => set({ ...p, plans: p.plans.filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            </div>
          ))}
        </div>
        {!disabled && p.plans.length < 4 && (
          <Button className="mt-3" size="sm" variant="outline" onClick={() => set({ ...p, plans: [...p.plans, { name: "", price: "", period: "", description: "", features: [], cta: null, highlighted: false }] })}>+ Add plan</Button>
        )}
      </Section>
    </>
  )
}

function FaqForm({ value: f, set, disabled }: FormProps<Site["faq"]>) {
  return (
    <Section title="Questions">
      <Rows items={f.items} set={(v) => set({ items: v })} blank={{ question: "", answer: "" }} disabled={disabled} max={30}
            fields={[{ key: "question", label: "Question" }, { key: "answer", label: "Answer", long: true }]} />
    </Section>
  )
}

function WaitlistTab({ canExport }: { canExport: boolean }) {
  const [kind, setKind] = useState("")
  const { data, isLoading, error } = useApi<Waitlist>(["waitlist", kind], "/admin/waitlist", { kind: kind || undefined })
  const { toast } = useToast()
  const exportCsv = async () => {
    try {
      const res = await api.get("/admin/waitlist.csv", { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a")
      a.href = url; a.download = "bukkapay-waitlist.csv"; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({ title: "Export failed", description: errorMessage(e), variant: "destructive" })
    }
  }
  const top = Object.entries(data?.byCountry ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Signups" value={data?.total ?? "—"} />
        {top.map(([c, n]) => <Stat key={c} label={`Country ${c}`} value={n} />)}
      </div>
      <div className="flex gap-2">
        {["", "personal", "business"].map((k) => <Button key={k || "all"} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k || "all"}</Button>)}
        {canExport && <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}>Export CSV</Button>}
      </div>
      <DataTable rows={data?.signups} loading={isLoading} error={error} rowKey={(s) => s.id} empty="No signups yet."
        columns={[
          { header: "Email", cell: (s) => s.email },
          { header: "Type", cell: (s) => s.kind },
          { header: "Country", cell: (s) => s.countryCode ?? "—" },
          { header: "Source", cell: (s) => s.source ?? "—" },
          { header: "Joined", cell: (s) => when(s.createdAt) },
        ]} />
    </div>
  )
}
