import { Link } from "wouter"
import { Stat, money, useApi } from "@/components/network/kit"
import { usePermissions } from "@/lib/permissions"

type Overview = {
  countries: Record<string, number>; users: number; activeWallets: number; merchants: number; pendingKyb: number
  pendingApprovals: number; openCases: number; transfersInFlight: number; fundingInReview: number
  providers: { code: string; status: string; mode: string }[]; volumeByCurrency: { currency: string; volume: string }[]
}

export function NetworkOverview() {
  const perms = usePermissions()
  const { data } = useApi<Overview>(["network-overview"], "/admin/network/overview")
  if (!data || !perms.can("dashboard.view")) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Live / pilot countries" value={`${data.countries.live ?? 0} / ${data.countries.pilot ?? 0}`} />
        <Stat label="Active wallets" value={data.activeWallets} />
        <Link href="/approvals"><div className="cursor-pointer"><Stat label="Pending approvals" value={data.pendingApprovals} tone={data.pendingApprovals ? "warn" : undefined} /></div></Link>
        <Link href="/merchant-kyb"><div className="cursor-pointer"><Stat label="KYB to review" value={data.pendingKyb} tone={data.pendingKyb ? "warn" : undefined} /></div></Link>
        <Link href="/compliance"><div className="cursor-pointer"><Stat label="Open cases" value={data.openCases} tone={data.openCases ? "bad" : undefined} /></div></Link>
        <Link href="/cross-border"><div className="cursor-pointer"><Stat label="Transfers in flight" value={data.transfersInFlight} /></div></Link>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Volume by currency (never summed across currencies)</p>
          {data.volumeByCurrency.length ? data.volumeByCurrency.map((v) => (
            <div key={v.currency} className="flex justify-between text-sm py-1 border-b last:border-0 border-border">
              <span>{v.currency}</span><span className="tabular-nums font-semibold">{money(v.volume, v.currency)}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">No volume yet.</p>}
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Providers</p>
          {data.providers.map((p) => (
            <div key={p.code} className="flex justify-between text-sm py-1 border-b last:border-0 border-border">
              <span className="font-mono">{p.code}</span><span>{p.status} · {p.mode}</span>
            </div>
          ))}
          {data.fundingInReview > 0 && (
            <Link href="/reconciliation"><p className="text-sm text-amber-600 mt-2 cursor-pointer">{data.fundingInReview} top-up(s) held for review →</p></Link>
          )}
        </div>
      </div>
    </div>
  )
}
