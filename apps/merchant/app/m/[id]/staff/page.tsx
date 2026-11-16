"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select, Table } from "@/components/ui"

type Staff = { id: string; name: string; role: string; status: string; inviteCode?: string; linkedAt?: string }
const ROLES: { value: string; label: string; help: string }[] = [
  { value: "admin", label: "Administrator", help: "Everything except payouts and ownership" },
  { value: "finance", label: "Finance", help: "Reports, refunds, settlements and payouts" },
  { value: "cashier", label: "Cashier", help: "Take payments with QR codes and links" },
  { value: "viewer", label: "Viewer", help: "Read-only" },
]

export default function StaffPage() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useData<Staff[]>(`/merchants/${id}/staff`)
  const [name, setName] = useState("")
  const [role, setRole] = useState("cashier")
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  const invite = async () => {
    try {
      const r = await api<{ staff: Staff }>(`/merchants/${id}/staff`, { method: "POST", json: { name, role } })
      setMsg({ tone: "success", text: `Invite code for ${r.staff.name}: ${r.staff.inviteCode}. They enter it after signing in with their own BukkaPay account.` })
      setName("")
      reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const changeRole = async (s: Staff, newRole: string) => {
    try { await api(`/merchants/${id}/staff/${s.id}`, { method: "PATCH", json: { role: newRole } }); reload() }
    catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const remove = async (s: Staff) => {
    try { await api(`/merchants/${id}/staff/${s.id}`, { method: "DELETE" }); reload() }
    catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  return (
    <>
      <PageHeader title="Staff & permissions" subtitle="Each person signs in with their own BukkaPay account. The owner keeps full control." />
      <Card className="mb-6">
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Role" hint={ROLES.find((r) => r.value === role)?.help}>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Button disabled={!name.trim()} onClick={invite}>Create invite</Button>
        </div>
      </Card>
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {error && <Notice tone="error">{error}</Notice>}
      {!data?.length ? <Empty>No staff yet.</Empty> : (
        <Table head={["Name", "Role", "Status", "Invite code", "Joined", ""]}>
          {data.filter((s) => s.status !== "removed").map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-medium">{s.name}</td>
              <td className="px-4 py-3">
                <Select value={s.role === "manager" ? "admin" : s.role} onChange={(e) => changeRole(s, e.target.value)} className="h-8 w-36">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </td>
              <td className="px-4 py-3"><Badge value={s.status} /></td>
              <td className="px-4 py-3 font-mono text-xs">{s.status === "pending" ? s.inviteCode : "—"}</td>
              <td className="px-4 py-3">{when(s.linkedAt)}</td>
              <td className="px-4 py-3 text-right"><Button variant="ghost" onClick={() => remove(s)}>Remove</Button></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
