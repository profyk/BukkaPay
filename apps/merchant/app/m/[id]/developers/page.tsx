"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api, API_URL } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { when } from "@/lib/format"
import { Button, Card, Empty, Field, Input, Notice, PageHeader, Table } from "@/components/ui"

type Key = { id: string; prefix: string; label?: string; createdAt: string; revokedAt?: string; lastUsedAt?: string }
type Hook = { id: string; url: string; events: string[]; active: boolean }
const EVENTS = ["payment.succeeded", "refund.succeeded", "payout.submitted", "payment_link.paid"]

export default function DevelopersPage() {
  const { id } = useParams<{ id: string }>()
  const keys = useData<Key[]>(`/merchants/${id}/api-keys`)
  const hooks = useData<Hook[]>(`/merchants/${id}/webhooks`)
  const [label, setLabel] = useState("")
  const [secret, setSecret] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const createKey = async () => {
    try {
      const r = await api<{ key: string }>(`/merchants/${id}/api-keys`, { method: "POST", json: { label: label || undefined } })
      setSecret(`API key (shown once): ${r.key}`)
      setLabel("")
      keys.reload()
    } catch (e: any) { setMsg(e.message) }
  }
  const createHook = async () => {
    try {
      const r = await api<{ secret: string }>(`/merchants/${id}/webhooks`, { method: "POST", json: { url, events } })
      setSecret(`Webhook signing secret (shown once): ${r.secret}`)
      setUrl("")
      hooks.reload()
    } catch (e: any) { setMsg(e.message) }
  }

  return (
    <>
      <PageHeader title="Developers" subtitle="Create checkout links from your own website or app and receive signed webhooks when payments succeed." />
      {secret && <div className="mb-4"><Notice tone="success"><span className="break-all font-mono text-xs">{secret}</span></Notice></div>}
      {msg && <div className="mb-4"><Notice tone="error">{msg}</Notice></div>}

      <Card className="mb-6">
        <p className="font-semibold">Quick start</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-[#1A1A2E] p-4 text-xs text-white">{`curl -X POST ${API_URL}/api/v1/merchant-api/checkout-links \\
  -H "Authorization: Bearer bkp_<prefix>_<secret>" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"250.00","description":"Order #1042","expiresInHours":24}'`}</pre>
        <p className="mt-3 text-xs text-ink-muted">Webhooks carry <code>X-BukkaPay-Signature: t=&lt;unix&gt;,v1=&lt;hmac_sha256(secret, "t.body")&gt;</code>. Verify the signature and reject events older than 5 minutes.</p>
      </Card>

      <h2 className="font-semibold mb-3">API keys</h2>
      <div className="flex gap-2 mb-3">
        <Input placeholder="Label (e.g. online shop)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={createKey}>Create key</Button>
      </div>
      {!keys.data?.length ? <Empty>No API keys.</Empty> : (
        <Table head={["Prefix", "Label", "Created", "Last used", ""]}>
          {keys.data.map((k) => (
            <tr key={k.id}>
              <td className="px-4 py-3 font-mono text-xs">bkp_{k.prefix}_…</td>
              <td className="px-4 py-3">{k.label ?? "—"}</td>
              <td className="px-4 py-3">{when(k.createdAt)}</td>
              <td className="px-4 py-3">{k.revokedAt ? "Revoked" : when(k.lastUsedAt)}</td>
              <td className="px-4 py-3 text-right">{!k.revokedAt && <Button variant="ghost" onClick={async () => { await api(`/merchants/${id}/api-keys/${k.id}`, { method: "DELETE" }); keys.reload() }}>Revoke</Button>}</td>
            </tr>
          ))}
        </Table>
      )}

      <h2 className="font-semibold mt-8 mb-3">Webhook endpoints</h2>
      <Card className="mb-3">
        <Field label="HTTPS endpoint URL"><Input placeholder="https://example.com/bukkapay/webhook" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {EVENTS.map((e) => (
            <label key={e} className="flex items-center gap-1.5">
              <input type="checkbox" checked={events.includes(e)} onChange={(x) => setEvents(x.target.checked ? [...events, e] : events.filter((v) => v !== e))} />{e}
            </label>
          ))}
        </div>
        <Button className="mt-3" disabled={!url.startsWith("https://")} onClick={createHook}>Add endpoint</Button>
      </Card>
      {!hooks.data?.length ? <Empty>No endpoints.</Empty> : (
        <Table head={["URL", "Events", "Status", ""]}>
          {hooks.data.map((h) => (
            <tr key={h.id}>
              <td className="px-4 py-3 font-mono text-xs break-all">{h.url}</td>
              <td className="px-4 py-3 text-xs">{h.events.length ? h.events.join(", ") : "All events"}</td>
              <td className="px-4 py-3">{h.active ? "Active" : "Disabled"}</td>
              <td className="px-4 py-3 text-right">{h.active && <Button variant="ghost" onClick={async () => { await api(`/merchants/${id}/webhooks/${h.id}`, { method: "DELETE" }); hooks.reload() }}>Disable</Button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
