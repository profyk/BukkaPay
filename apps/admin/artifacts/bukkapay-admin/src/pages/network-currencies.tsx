import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Bool, DataTable, FormDialog, Page, StatusBadge, useAction, useApi, useRequestApproval } from "@/components/network/kit"

type Currency = { code: string; name: string; symbol: string; decimals: number; status: string; walletEnabled: boolean }

export default function NetworkCurrenciesPage() {
  const { data, isLoading, error } = useApi<Currency[]>(["currencies"], "/admin/network/currencies")
  const action = useAction([["currencies"]])
  const requestApproval = useRequestApproval([["currencies"]])
  const [creating, setCreating] = useState(false)
  const [toggle, setToggle] = useState<Currency | null>(null)

  return (
    <Page
      title="Currencies"
      subtitle="Currencies are data, not code. Wallets in a currency are only switched on — by approval — once a custodian backs balances in it. Decimal precision can't change after creation."
      actions={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Add currency</Button>}
    >
      <DataTable
        rows={data} loading={isLoading} error={error} rowKey={(c) => c.code}
        columns={[
          { header: "Code", cell: (c) => <span className="font-mono font-semibold">{c.code}</span> },
          { header: "Name", cell: (c) => c.name },
          { header: "Symbol", cell: (c) => c.symbol },
          { header: "Decimals", cell: (c) => c.decimals },
          { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          { header: "Wallets", cell: (c) => <Bool value={c.walletEnabled} yes="Enabled" no="Disabled" /> },
          {
            header: "", className: "text-right", cell: (c) => (
              <Button size="sm" variant="outline" onClick={() => setToggle(c)}>
                {c.walletEnabled ? "Disable wallets" : "Enable wallets"}
              </Button>
            ),
          },
        ]}
      />
      <FormDialog
        open={creating} onOpenChange={setCreating} title="Add currency"
        fields={[
          { name: "code", label: "ISO 4217 code", required: true },
          { name: "name", label: "Name", required: true },
          { name: "symbol", label: "Symbol", required: true },
          { name: "decimals", label: "Decimals", type: "number", placeholder: "2" },
        ]}
        onSubmit={(v) => action.mutateAsync({
          url: "/admin/network/currencies", body: { ...v, decimals: Number(v.decimals || 2) }, success: "Currency added",
        })}
      />
      <FormDialog
        open={!!toggle} onOpenChange={(o) => !o && setToggle(null)}
        title={`${toggle?.walletEnabled ? "Disable" : "Enable"} ${toggle?.code} wallets`}
        description="Needs a second admin's approval."
        fields={[{ name: "reason", label: "Reason", type: "textarea", required: true }]}
        submitLabel="Request approval"
        onSubmit={(v) => requestApproval("currency.set_wallets", { code: toggle!.code, enabled: !toggle!.walletEnabled }, v.reason)}
      />
    </Page>
  )
}
