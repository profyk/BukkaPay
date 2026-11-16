"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { useData } from "@/lib/hooks"
import { money, when } from "@/lib/format"
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Table } from "@/components/ui"
import { useMerchant } from "@/components/merchant-context"

type Link = { id: string; url: string; amount: string; currency: string; amountPaid: string; status: string; description?: string; expiresAt?: string; createdAt: string }

export default function LinksPage() {
  const { id } = useParams<{ id: string }>()
  const merchant = useMerchant()
  const { data, error, reload } = useData<Link[]>(`/merchants/${id}/checkout-links`)
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [hours, setHours] = useState("72")
  const [partial, setPartial] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null)

  const create = async () => {
    setMsg(null)
    try {
      const link = await api<Link>(`/merchants/${id}/checkout-links`, {
        method: "POST", json: { amount, description: description || undefined, expiresInHours: Number(hours) || undefined, allowPartialPayment: partial },
      })
      setAmount(""); setDescription("")
      await navigator.clipboard?.writeText(link.url).catch(() => undefined)
      setMsg({ tone: "success", text: `Link created and copied: ${link.url}` })
      reload()
    } catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }
  const share = (l: Link) => {
    const text = `Pay ${merchant?.businessName} ${money(l.amount, l.currency)}${l.description ? ` for ${l.description}` : ""}: ${l.url}`
    if (navigator.share) navigator.share({ text, url: l.url }).catch(() => undefined)
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener")
  }
  const cancel = async (l: Link) => {
    try { await api(`/merchants/${id}/checkout-links/${l.id}/cancel`, { method: "POST" }); reload() }
    catch (e: any) { setMsg({ tone: "error", text: e.message }) }
  }

  return (
    <>
      <PageHeader title="Checkout links" subtitle="A hosted, secure checkout page you can share by WhatsApp, SMS, email or social media. A link is only marked paid when BukkaPay confirms the payment — never from a browser redirect." />
      <Card className="mb-6">
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <Field label={`Amount (${merchant?.currency})`}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="What it's for"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Expires after (hours)"><Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />Allow part payments</label>
        </div>
        <Button className="mt-4" disabled={!amount} onClick={create}>Create link</Button>
      </Card>
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {error && <Notice tone="error">{error}</Notice>}
      {!data?.length ? <Empty>No checkout links yet.</Empty> : (
        <Table head={["Created", "For", "Amount", "Paid", "Status", "Expires", ""]}>
          {data.map((l) => (
            <tr key={l.id}>
              <td className="px-4 py-3 whitespace-nowrap">{when(l.createdAt)}</td>
              <td className="px-4 py-3">{l.description ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{money(l.amount, l.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{money(l.amountPaid, l.currency)}</td>
              <td className="px-4 py-3"><Badge value={l.status} /></td>
              <td className="px-4 py-3 whitespace-nowrap">{when(l.expiresAt)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(l.url)}>Copy</Button>
                <Button variant="ghost" onClick={() => share(l)}>Share</Button>
                {l.status === "pending" && <Button variant="ghost" onClick={() => cancel(l)}>Cancel</Button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
