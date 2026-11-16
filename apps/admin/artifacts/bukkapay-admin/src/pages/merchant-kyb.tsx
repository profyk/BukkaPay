import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataTable, FormDialog, Page, useAction, useApi, when } from "@/components/network/kit"
import { api } from "@/lib/api"

type Merchant = {
  id: string; businessName: string; businessType: string; businessCategory?: string; businessRegNumber?: string
  businessAddress?: string; businessEmail?: string; businessPhone?: string; countryCode: string; settlementCurrency: string
  kybStatus: string; kybSubmittedAt?: string; kybRejectionReason?: string
  kybDetails?: { directors?: { fullName: string; idNumber: string; role: string }[]; documents?: { type: string; url: string }[] }
}

/** Documents are private; fetch a short-lived signed link to view one. */
async function openDocument(ref: string) {
  const { data } = await api.get("/admin/files/signed-url", { params: { ref } })
  window.open(data.url, "_blank", "noopener")
}

export default function MerchantKybPage() {
  const [status, setStatus] = useState("pending")
  const { data, isLoading, error } = useApi<Merchant[]>(["kyb", status], "/admin/merchants/kyb", { status })
  const action = useAction([["kyb", status]])
  const [rejecting, setRejecting] = useState<Merchant | null>(null)

  return (
    <Page
      title="Business verification (KYB)"
      subtitle="Merchants can't accept payments or withdraw until their business, owners/directors and documents are verified here. Approval records a screening entry (not screened until a provider is connected)."
    >
      <div className="flex gap-2">
        {["pending", "approved", "rejected", "not_submitted"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s.replace(/_/g, " ")}</Button>
        ))}
      </div>
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(m) => m.id} empty="No merchants in this state."
        columns={[
          { header: "Business", cell: (m) => <div><p className="font-semibold">{m.businessName}</p><p className="text-xs text-muted-foreground">{m.businessCategory ?? m.businessType} · {m.countryCode} · {m.settlementCurrency}</p></div> },
          { header: "Registration", cell: (m) => <div className="text-xs"><p>{m.businessRegNumber ?? "—"}</p><p className="text-muted-foreground">{m.businessAddress}</p></div> },
          { header: "Contact", cell: (m) => <div className="text-xs"><p>{m.businessEmail}</p><p>{m.businessPhone}</p></div> },
          { header: "Owners / directors", cell: (m) => <ul className="text-xs">{m.kybDetails?.directors?.map((d) => <li key={d.idNumber}>{d.fullName} · {d.idNumber}</li>) ?? "—"}</ul> },
          { header: "Documents", cell: (m) => <ul className="text-xs space-y-0.5">{m.kybDetails?.documents?.map((d) => <li key={d.url}><button className="text-primary underline" onClick={() => openDocument(d.url)}>{d.type.replace(/_/g, " ")}</button></li>) ?? "—"}</ul> },
          { header: "Submitted", cell: (m) => when(m.kybSubmittedAt) },
          {
            header: "", className: "text-right whitespace-nowrap", cell: (m) => m.kybStatus !== "pending"
              ? <span className="text-xs text-muted-foreground">{m.kybRejectionReason ?? m.kybStatus}</span> : (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => action.mutate({ url: `/admin/merchants/${m.id}/kyb`, body: { approve: true }, success: "Merchant approved" })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(m)}>Reject</Button>
                </div>
              ),
          },
        ]}
      />
      <FormDialog
        open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)} title={`Reject ${rejecting?.businessName}`}
        fields={[{ name: "reason", label: "Reason (shown to the merchant)", type: "textarea", required: true }]}
        submitLabel="Reject"
        onSubmit={(v) => action.mutateAsync({ url: `/admin/merchants/${rejecting!.id}/kyb`, body: { approve: false, reason: v.reason }, success: "Merchant rejected" })}
      />
    </Page>
  )
}
