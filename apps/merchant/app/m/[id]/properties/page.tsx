"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { can, useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Property = { id: string; merchantId: string; name: string; address: string | null; propertyType: string; totalUnits: number; isActive: boolean }
type Unit = { id: string; propertyId: string; unitNumber: string; monthlyRent: string; isOccupied: boolean }
type Tenant = { id: string; tenantId: string; propertyId: string; unitId: string; name: string; email: string | null; phone: string | null; isActive: boolean }
type RentLink = { linkCode: string; shareableLink: string | null; amount: string; rentMonth: string; tenantName: string | null }
type Payment = { id: string; amount: string; rentMonth: string; status: string; tenantName: string | null; unitNumber: string | null; createdAt: string }

const CUSTOMER_APP = (process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "https://app.bukkapay.com").replace(/\/$/, "")

/** Properties, units, tenants and rent collection. Rent is paid by tenants
 *  in the BukkaPay app (tenant code or a rent link) and settles to this
 *  business's balance — moved here from the customer app. */
export default function PropertiesPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const all = useData<Property[]>("/rental/properties")
  const tenants = useData<Tenant[]>("/rental/tenants")
  const properties = (all.data ?? []).filter((p) => p.merchantId === id)
  const [selected, setSelected] = useState<string | null>(null)
  const current = selected ?? properties[0]?.id ?? null
  const units = useData<Unit[]>(current ? `/rental/properties/${current}/units` : null)
  const payments = useData<Payment[]>(current ? `/rental/properties/${current}/payments` : null)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const [prop, setProp] = useState({ name: "", address: "", propertyType: "residential" })
  const [unit, setUnit] = useState({ unitNumber: "", monthlyRent: "" })
  const [tenant, setTenant] = useState({ unitId: "", name: "", email: "", phone: "" })
  const [link, setLink] = useState({ tenantId: "", amount: "", rentMonth: new Date().toISOString().slice(0, 7) })

  const run = async (fn: () => Promise<unknown>, ok: string, after: () => void) => {
    setMsg(null)
    try { await fn(); setMsg({ tone: "success", text: ok }); after() } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  if (merchant && !can(merchant.role, "owner")) return <Notice tone="warn">Only the business owner can manage properties.</Notice>

  const propertyTenants = (tenants.data ?? []).filter((t) => t.propertyId === current)
  const unitById = Object.fromEntries((units.data ?? []).map((u) => [u.id, u]))

  return (
    <>
      <PageHeader title="Properties & rent" subtitle="Add your properties and tenants. Tenants pay rent in the BukkaPay app with their tenant code or a rent link you send; it lands in this business's balance." />
      {merchant && merchant.kybStatus !== "approved" && (
        <div className="mb-4"><Notice tone="warn">Verify this business (an individual landlord can verify instantly with their ID) before tenants can pay rent.</Notice></div>
      )}
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <Card className="mb-6">
        <p className="font-semibold mb-3">Add a property</p>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <Field label="Name"><Input value={prop.name} onChange={(e) => setProp({ ...prop, name: e.target.value })} /></Field>
          <Field label="Address"><Input value={prop.address} onChange={(e) => setProp({ ...prop, address: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={prop.propertyType} onChange={(e) => setProp({ ...prop, propertyType: e.target.value })}>
              <option value="residential">Residential</option><option value="commercial">Commercial</option><option value="student">Student</option>
            </Select>
          </Field>
          <Button disabled={!prop.name} onClick={() => run(
            () => api("/rental/properties", { method: "POST", json: { ...prop, merchantId: id } }),
            "Property added", () => { setProp({ name: "", address: "", propertyType: "residential" }); all.reload() })}>Add</Button>
        </div>
      </Card>

      {!properties.length ? <Empty>No properties yet.</Empty> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {properties.map((p) => (
              <Button key={p.id} variant={p.id === current ? "primary" : "ghost"} onClick={() => setSelected(p.id)}>{p.name}</Button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-6">
            <Card>
              <p className="font-semibold mb-3">Units</p>
              <div className="grid grid-cols-3 gap-2 items-end mb-3">
                <Field label="Unit"><Input value={unit.unitNumber} onChange={(e) => setUnit({ ...unit, unitNumber: e.target.value })} /></Field>
                <Field label={`Rent (${merchant?.currency ?? ""})`}><Input inputMode="decimal" value={unit.monthlyRent} onChange={(e) => setUnit({ ...unit, monthlyRent: e.target.value })} /></Field>
                <Button disabled={!unit.unitNumber || !unit.monthlyRent} onClick={() => run(
                  () => api(`/rental/properties/${current}/units`, { method: "POST", json: unit }),
                  "Unit added", () => { setUnit({ unitNumber: "", monthlyRent: "" }); units.reload() })}>Add unit</Button>
              </div>
              {(units.data ?? []).map((u) => (
                <div key={u.id} className="flex justify-between py-2 border-t border-line text-sm">
                  <span>Unit {u.unitNumber}</span><span className="tabular-nums">{money(u.monthlyRent, merchant?.currency)}</span>
                  <Badge value={u.isOccupied ? "occupied" : "vacant"} />
                </div>
              ))}
            </Card>

            <Card>
              <p className="font-semibold mb-3">Tenants</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Select value={tenant.unitId} onChange={(e) => setTenant({ ...tenant, unitId: e.target.value })}>
                  <option value="">Unit…</option>
                  {(units.data ?? []).filter((u) => !u.isOccupied).map((u) => <option key={u.id} value={u.id}>Unit {u.unitNumber}</option>)}
                </Select>
                <Input placeholder="Tenant name" value={tenant.name} onChange={(e) => setTenant({ ...tenant, name: e.target.value })} />
                <Input placeholder="Email" type="email" value={tenant.email} onChange={(e) => setTenant({ ...tenant, email: e.target.value })} />
                <Input placeholder="Phone" type="tel" value={tenant.phone} onChange={(e) => setTenant({ ...tenant, phone: e.target.value })} />
              </div>
              <Button disabled={!tenant.unitId || !tenant.name} onClick={() => run(
                () => api("/rental/tenants", { method: "POST", json: { ...tenant, propertyId: current, email: tenant.email || undefined, phone: tenant.phone || undefined } }),
                "Tenant added. Share their tenant code so they can pay rent in the app.",
                () => { setTenant({ unitId: "", name: "", email: "", phone: "" }); tenants.reload(); units.reload() })}>Add tenant</Button>
              {propertyTenants.map((t) => (
                <div key={t.id} className="flex justify-between py-2 border-t border-line text-sm mt-2">
                  <span>{t.name} · Unit {unitById[t.unitId]?.unitNumber ?? "—"}</span>
                  <code className="text-xs">{t.tenantId}</code>
                </div>
              ))}
            </Card>
          </div>

          <Card className="mb-6">
            <p className="font-semibold mb-3">Send a rent link</p>
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <Field label="Tenant">
                <Select value={link.tenantId} onChange={(e) => {
                  const t = propertyTenants.find((x) => x.id === e.target.value)
                  setLink({ ...link, tenantId: e.target.value, amount: t ? unitById[t.unitId]?.monthlyRent ?? "" : "" })
                }}>
                  <option value="">Choose…</option>
                  {propertyTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Amount"><Input inputMode="decimal" value={link.amount} onChange={(e) => setLink({ ...link, amount: e.target.value })} /></Field>
              <Field label="Month"><Input type="month" value={link.rentMonth} onChange={(e) => setLink({ ...link, rentMonth: e.target.value })} /></Field>
              <Button disabled={!link.tenantId || !link.amount} onClick={() => run(async () => {
                const r = await api<RentLink>("/rental/payment-links", { method: "POST", json: link })
                const url = CUSTOMER_APP + (r.shareableLink ?? `/pay-rent/${r.linkCode}`)
                await navigator.clipboard?.writeText(url).catch(() => undefined)
                setMsg({ tone: "success", text: `Rent link copied: ${url}` })
              }, "Rent link created", () => undefined)}>Create link</Button>
            </div>
          </Card>

          <p className="font-semibold mb-3">Rent received</p>
          {!payments.data?.length ? <Empty>No rent payments yet.</Empty> : (
            <Table head={["Date", "Tenant", "Unit", "Month", "Amount", "Status"]}>
              {payments.data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{when(p.createdAt)}</td>
                  <td className="px-4 py-3">{p.tenantName ?? "—"}</td>
                  <td className="px-4 py-3">{p.unitNumber ?? "—"}</td>
                  <td className="px-4 py-3">{p.rentMonth}</td>
                  <td className="px-4 py-3 tabular-nums">{money(p.amount, merchant?.currency)}</td>
                  <td className="px-4 py-3"><Badge value={p.status} /></td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </>
  )
}
