import { useMemo, useState } from "react"
import { Building2, Globe2, Network, Pencil, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, FormDialog, Page, Stat, StatusBadge, useAction, useApi, when } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Dept = { id: string; code: string; name: string; description?: string; email?: string; headId?: string; head?: string; members: number; active: number }
type Person = { id: string; name: string; email: string; role: string; roleLabel: string; active: boolean; mfa: boolean
                title?: string; phone?: string; departmentId?: string; department?: string; managerId?: string
                countries: string[]; startedOn?: string; lastLoginAt?: string }
type Org = { departments: Dept[]; people: Person[]; coverage: { code: string; name: string; status: string; staff: string[] }[]
             unassigned: number; roles: { value: string; label: string }[] }

const TABS = [["departments", "Departments", Building2], ["people", "People", Users], ["chart", "Org chart", Network],
              ["coverage", "Country coverage", Globe2]] as const

/** The company: departments, staff directory, reporting lines and country coverage. */
export default function OrganisationPage() {
  const perms = usePermissions()
  const can = perms.can("org.manage")
  const { data, isLoading, error } = useApi<Org>(["org"], "/admin/org")
  const action = useAction([["org"]])
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("departments")
  const [editDept, setEditDept] = useState<Dept | "new" | null>(null)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [q, setQ] = useState("")
  const people = useMemo(() => (data?.people ?? []).filter((p) => !q || `${p.name} ${p.email} ${p.title ?? ""} ${p.department ?? ""} ${p.roleLabel}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  const byId = useMemo(() => Object.fromEntries((data?.people ?? []).map((p) => [p.id, p])), [data])
  const open = (data?.coverage ?? []).filter((c) => c.status === "pilot" || c.status === "live")

  return (
    <Page title="Organisation"
      subtitle="Who works at BukkaPay, where they sit, who they report to and which countries they cover. Country coverage is enforced: staff limited to some countries only see those countries' customers, merchants, agents and tickets.">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Staff" value={data?.people.filter((p) => p.active).length ?? "…"} />
        <Stat label="Departments" value={data?.departments.length ?? "…"} />
        <Stat label="Without a department" value={data?.unassigned ?? "…"} tone={(data?.unassigned ?? 0) > 0 ? "warn" : undefined} />
        <Stat label="Open countries without local staff" value={open.filter((c) => !c.staff.length).length} tone={open.some((c) => !c.staff.length) ? "warn" : "good"} />
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([v, l, Icon]) => <Button key={v} size="sm" variant={tab === v ? "default" : "outline"} onClick={() => setTab(v)}><Icon className="w-4 h-4 mr-1.5" />{l}</Button>)}
        {can && tab === "departments" && <Button size="sm" className="ml-auto" onClick={() => setEditDept("new")}><Plus className="w-4 h-4 mr-1" />Department</Button>}
        {tab === "people" && <Input className="ml-auto w-64" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Couldn't load the organisation.</p>}

      {data && tab === "departments" && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.departments.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{d.name}</p><p className="text-xs text-muted-foreground font-mono">{d.code}</p></div>
                {can && <Button size="sm" variant="ghost" onClick={() => setEditDept(d)}><Pencil className="w-4 h-4" /></Button>}
              </div>
              {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
              <p className="text-sm">Head: <span className="font-medium">{d.head ?? "—"}</span></p>
              <p className="text-sm">{d.active} active of {d.members} people{d.email ? ` · ${d.email}` : ""}</p>
            </div>
          ))}
        </div>
      )}

      {data && tab === "people" && (
        <DataTable rows={people} rowKey={(p) => p.id} empty="No staff yet."
          columns={[
            { header: "Person", cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.email}</p></div> },
            { header: "Title", cell: (p) => p.title ?? "—" },
            { header: "Department", cell: (p) => p.department ?? <span className="text-amber-600">Not set</span> },
            { header: "Role", cell: (p) => p.roleLabel },
            { header: "Reports to", cell: (p) => (p.managerId && byId[p.managerId]?.name) || "—" },
            { header: "Countries", cell: (p) => p.role === "super_admin" || !p.countries.length ? "All" : p.countries.join(", ") },
            { header: "Status", cell: (p) => <div className="space-y-1"><StatusBadge value={p.active ? "active" : "suspended"} />{!p.mfa && <p className="text-xs text-amber-600">MFA off</p>}</div> },
            { header: "Last sign-in", cell: (p) => when(p.lastLoginAt) },
            { header: "", className: "text-right", cell: (p) => can ? <Button size="sm" variant="outline" onClick={() => setEditPerson(p)}>Edit</Button> : null },
          ]} />
      )}

      {data && tab === "chart" && <OrgChart people={data.people.filter((p) => p.active)} />}

      {data && tab === "coverage" && (
        <DataTable rows={data.coverage} rowKey={(c) => c.code}
          columns={[
            { header: "Country", cell: (c) => <span>{c.name} <span className="text-xs text-muted-foreground">{c.code}</span></span> },
            { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
            { header: "Local staff", cell: (c) => c.staff.length ? c.staff.join(", ")
              : (c.status === "pilot" || c.status === "live") ? <span className="text-amber-600">Covered by central teams only</span> : "—" },
          ]} />
      )}

      <FormDialog key={editDept === "new" ? "new" : editDept?.id ?? "none"} open={!!editDept} onOpenChange={(o) => !o && setEditDept(null)}
        title={editDept === "new" ? "New department" : `Edit ${editDept?.name ?? ""}`}
        initial={editDept && editDept !== "new" ? { code: editDept.code, name: editDept.name, description: editDept.description ?? "", email: editDept.email ?? "", headId: editDept.headId ?? "" } : {}}
        fields={[
          { name: "code", label: "Code (lowercase, e.g. finance)", required: true },
          { name: "name", label: "Name", required: true },
          { name: "description", label: "What it does", type: "textarea" },
          { name: "email", label: "Shared mailbox" },
          { name: "headId", label: "Head of department", type: "select", options: (data?.people ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} (${p.roleLabel})` })) },
        ]}
        onSubmit={(v) => editDept === "new"
          ? action.mutateAsync({ url: "/admin/org/departments", success: "Department created", body: { ...v, headId: v.headId || null } })
          : action.mutateAsync({ method: "patch", url: `/admin/org/departments/${(editDept as Dept).id}`, success: "Department saved", body: { ...v, headId: v.headId || null } })}
      />
      <FormDialog key={editPerson?.id ?? "none"} open={!!editPerson} onOpenChange={(o) => !o && setEditPerson(null)} title={`Edit ${editPerson?.name ?? ""}`}
        description="Roles and access are changed in Admins & Roles by the owner. Here: where they sit and what they cover."
        initial={editPerson ? { departmentId: editPerson.departmentId ?? "", title: editPerson.title ?? "", managerId: editPerson.managerId ?? "",
                                phone: editPerson.phone ?? "", startedOn: editPerson.startedOn ?? "", countries: editPerson.countries.join(", ") } : {}}
        fields={[
          { name: "departmentId", label: "Department", type: "select", options: (data?.departments ?? []).map((d) => ({ value: d.id, label: d.name })) },
          { name: "title", label: "Job title" },
          { name: "managerId", label: "Reports to", type: "select", options: (data?.people ?? []).filter((p) => p.active && p.id !== editPerson?.id).map((p) => ({ value: p.id, label: p.name })) },
          { name: "phone", label: "Work phone" },
          { name: "startedOn", label: "Start date (YYYY-MM-DD)" },
          ...(editPerson?.role === "super_admin" ? [] : [{ name: "countries", label: "Countries covered (ISO codes, comma-separated; empty = all)", help: "e.g. KE, UG, TZ. They will only see these countries' customers, merchants, agents and tickets." }]),
        ]}
        onSubmit={(v) => action.mutateAsync({ method: "patch", url: `/admin/org/people/${editPerson!.id}`, success: "Profile saved",
          body: { departmentId: v.departmentId || null, title: v.title || null, managerId: v.managerId || null, phone: v.phone || null,
                  startedOn: v.startedOn || null,
                  ...(editPerson?.role === "super_admin" ? {} : { countries: String(v.countries ?? "").split(",").map((s) => s.trim()).filter(Boolean) }) } })}
      />
    </Page>
  )
}

function OrgChart({ people }: { people: Person[] }) {
  const ids = new Set(people.map((p) => p.id))
  const roots = people.filter((p) => !p.managerId || !ids.has(p.managerId))
  const kids = (id: string) => people.filter((p) => p.managerId === id)
  const Node = ({ p, depth }: { p: Person; depth: number }) => (
    <div className={depth ? "ml-6 border-l border-border pl-4" : ""}>
      <div className="my-1.5 inline-flex flex-col rounded-xl border border-border bg-card px-3 py-2">
        <span className="font-medium text-sm">{p.name}</span>
        <span className="text-xs text-muted-foreground">{p.title ?? p.roleLabel}{p.department ? ` · ${p.department}` : ""}</span>
      </div>
      {kids(p.id).map((k) => <Node key={k.id} p={k} depth={depth + 1} />)}
    </div>
  )
  return <div className="bg-card border border-border rounded-2xl p-4 overflow-x-auto">{roots.map((r) => <Node key={r.id} p={r} depth={0} />)}</div>
}
