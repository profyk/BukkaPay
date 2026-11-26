import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"
import { Download } from "lucide-react"
import { can, download, useBoard, useMe } from "../api"
import {
  Banner, Btn, C, Card, Chart, Empty, ErrorLine, Field, Grid, Input, Kpi, Legend, Loading, Modal, Notes, Page,
  PeriodLine, PeriodPicker, PerCurrency, S1, S2, Select, Status, Table, TextArea, Tip, axis, dateLabel, label, money,
  monthLabel, num, pct, toneOf, useAction, usePeriod,
} from "../kit"
import { Methodology } from "./overview"

function usePeriodPage(path: string, extra: Record<string, any> = {}) {
  const per = usePeriod("month")
  const q = useBoard<any>(path, { ...per.params, ...extra }, per.ready)
  return { ...per, q }
}

// ─── adoption ───────────────────────────────────────────────────────────────
export function Adoption() {
  const [country, setCountry] = useState("")
  const { p, setP, q } = usePeriodPage("/adoption", country ? { country } : {})
  const d = q.data
  const c = d?.customers, mm = d?.merchants
  return (
    <Page title="Customers & merchants" subtitle={d ? <PeriodLine period={d.period} previous={d.previous} /> : "Adoption and growth"}
      actions={<><PeriodPicker value={p} onChange={setP} />
        <Input aria-label="Country code" placeholder="Country (e.g. ZW)" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="!w-36 h-9" /></>}>
      <Loading q={q} />
      {d && <>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Customers: the funnel</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="App installations" value="Not tracked" sub={c.appInstallationsNote} />
          <Kpi label="Registered accounts" value={num(c.registered)} sub={`${num(c.newRegistrations)} new (${pct(c.newRegistrationsChange)})`} tone={toneOf(c.newRegistrationsChange)} />
          <Kpi label="Verified (email)" value={num(c.emailVerified)} />
          <Kpi label="Verified (identity)" value={num(c.identityVerified)} />
          <Kpi label="Activated wallets" value={num(c.activatedWallets)} sub={c.activatedNote} />
          <Kpi label="Active customers" value={num(c.active)} sub={`${pct(c.activeChange)} vs previous`} tone={toneOf(c.activeChange)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Daily active" value={num(c.dailyActive)} sub="Last day of the period" />
          <Kpi label="Monthly active" value={num(c.monthlyActive)} sub="30 days to the period end" />
          <Kpi label="Retention" value={c.retention != null ? `${c.retention}%` : "—"} sub="Active again after the previous period" />
          <Kpi label="Churn" value={c.churn != null ? `${c.churn}%` : "—"} />
        </div>
        <Grid>
          <Card title="Customers by country">
            <Chart height={Math.max(180, c.byCountry.length * 30)}><BarChart data={c.byCountry.slice(0, 15)} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid horizontal={false} stroke={C.grid} /><XAxis type="number" allowDecimals={false} tickFormatter={(v) => num(v)} {...axis} /><YAxis type="category" dataKey="country" {...axis} width={70} />
              <Tooltip content={<Tip labelFmt={null} />} cursor={{ fill: C.muted }} />
              <Bar dataKey="registered" name="Registered" fill={C.s1} radius={[0, 4, 4, 0]} maxBarSize={16} /><Bar dataKey="active" name="Active" fill={C.s2} radius={[0, 4, 4, 0]} maxBarSize={16} /></BarChart></Chart>
            <Legend items={[["Registered", S1], ["Active in period", S2]]} />
          </Card>
          <Card title="Wallet adoption by currency">
            <Table rows={c.walletsByCurrency} cols={[["Currency", (r: any) => r.currency], ["Wallets", (r: any) => num(r.wallets), "r"], ["Customers", (r: any) => num(r.customers), "r"], ["Active in period", (r: any) => num(r.activeInPeriod), "r"]]} />
          </Card>
        </Grid>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2">Merchants</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Registered" value={num(mm.registered)} sub={`${num(mm.newRegistrations)} new`} />
          <Kpi label="Verified (KYB)" value={num(mm.verified)} />
          <Kpi label="Accepting payments" value={num(mm.acceptingPayments)} sub="Ever taken a payment" />
          <Kpi label="Active" value={num(mm.active)} sub="Took a payment in the period" />
          <Kpi label="Retention" value={mm.retention != null ? `${mm.retention}%` : "—"} />
          <Kpi label="Fee revenue" value={<PerCurrency rows={mm.feeRevenueByCurrency} field="revenue" />} />
        </div>
        <Grid>
          <Card title="Merchant payment volume" note="Customer money paid to merchants: not revenue."><Table rows={mm.volumeByCurrency} cols={[["Currency", (r: any) => r.currency], ["Volume", (r: any) => num(r.volume), "r"], ["Payments", (r: any) => num(r.payments), "r"]]} /></Card>
          <Card title="Merchants by country"><Table rows={mm.byCountry} cols={[["Country", (r: any) => r.country], ["Registered", (r: any) => num(r.registered), "r"], ["New", (r: any) => num(r.new), "r"]]} /></Card>
        </Grid>
        <Notes items={Object.entries(d.definitions).map(([k, v]) => `${label(k)}: ${v}`)} />
      </>}
    </Page>
  )
}

// ─── currencies & wallets ───────────────────────────────────────────────────
export function Currencies() {
  const { p, setP, params, q } = usePeriodPage("/currencies")
  const [country, setCountry] = useState("")
  const [ccy, setCcy] = useState("")
  const [group, setGroup] = useState("")
  const w = useBoard<any>("/wallets", { ...params, ...(country ? { country } : {}), ...(ccy ? { currency: ccy } : {}), ...(group ? { group } : {}) })
  const d = q.data
  return (
    <Page title="Currencies & wallets" subtitle={d?.note} actions={<PeriodPicker value={p} onChange={setP} />}>
      <Loading q={q} />
      {d && <>
        {!d.currencies.length && <Empty text="No currencies are live yet." />}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {d.currencies.map((c: any) => (
            <Card key={c.code} title={`${c.code} · ${c.name}`} note={c.walletEnabled ? "Wallets enabled" : "Holds balances but not enabled for new wallets"}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[["Customer wallet balances", c.customerWalletBalances], ["Merchant balances", c.merchantBalances], ["Safeguarded funds", c.safeguardedFunds],
                  ["Deposits", c.deposits], ["Withdrawals", c.withdrawals], ["P2P transfers", c.p2pTransfers], ["Merchant payments", c.merchantPayments],
                  ["Company revenue", c.revenue], ["Direct costs", c.directCosts], ["Gross profit", c.grossProfit]].map(([l, v]) => (
                  <div key={l}><dt className="text-xs text-muted-foreground">{l}</dt><dd className="tabular-nums font-medium">{num(v)}</dd></div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      </>}
      <Card title="Wallet and ledger activity" note="From the double-entry ledger. Filter by country, currency or type."
        actions={<div className="flex flex-wrap gap-2">
          <Input aria-label="Country" placeholder="Country" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="!w-24 h-8" />
          <Select aria-label="Currency" value={ccy} onChange={(e) => setCcy(e.target.value)} className="!w-28 h-8 !py-1"><option value="">All currencies</option>{d?.currencies.map((c: any) => <option key={c.code}>{c.code}</option>)}</Select>
          <Select aria-label="Type" value={group} onChange={(e) => setGroup(e.target.value)} className="!w-44 h-8 !py-1"><option value="">All types</option>{Object.entries(d?.groupLabels ?? {}).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</Select>
        </div>}>
        <Loading q={w} />
        {w.data && <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <Kpi label="Wallet accounts" value={num(w.data.walletAccounts)} />
            <Kpi label="Active wallets" value={num(w.data.activeWallets)} sub="Transacted in the period" />
          </div>
          <Table rows={w.data.activity} empty="No activity for these filters." cols={[["Type", (r: any) => r.label], ["Currency", (r: any) => r.currency], ["Into wallets", (r: any) => num(r.intoWallets), "r"], ["Out of wallets", (r: any) => num(r.outOfWallets), "r"], ["Counted volume", (r: any) => num(r.volume), "r"], ["Entries", (r: any) => num(r.entries), "r"]]} />
          <h3 className="font-semibold mt-6 mb-2">Financial position</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {Object.entries(w.data.financialModel).map(([k, rows]: any) => (
              <div key={k} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{w.data.financialModelLabels[k] ?? label(k)}</p>
                <div className="mt-1 text-sm font-medium"><PerCurrency rows={rows} /></div></div>
            ))}
          </div>
          <div className="mt-4"><Notes items={w.data.notes} /></div>
        </>}
      </Card>
    </Page>
  )
}

// ─── revenue ────────────────────────────────────────────────────────────────
export function Revenue() {
  const { p, setP, q } = usePeriodPage("/revenue")
  const d = q.data
  const ccy = d?.reportingCurrency ?? ""
  const c = d?.converted ?? {}
  const monthly = (d?.monthly ?? []).map((r: any) => ({ ...r, revenue: Number(r.revenue), directCosts: Number(r.directCosts) }))
  return (
    <Page title="Revenue" subtitle={d ? <PeriodLine period={d.period} /> : undefined} actions={<PeriodPicker value={p} onChange={setP} />}>
      <Loading q={q} />
      {d && <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Gross transaction volume" value={money(c.grossTransactionVolume, ccy)} sub="Not revenue" />
          <Kpi label="Company revenue" value={money(c.revenue, ccy)} />
          <Kpi label="Direct processing costs" value={money(c.directCosts, ccy)} sub="Booked in the ledger" />
          <Kpi label="Gross profit" value={money(c.grossProfit, ccy)} tone={toneOf(c.grossProfit)} />
          <Kpi label="Take rate" value={c.takeRate != null ? `${c.takeRate}%` : "—"} sub="Revenue ÷ volume" />
          <Kpi label="Revenue per active customer" value={money(c.revenuePerActiveCustomer, ccy)} sub={`Per merchant ${money(c.revenuePerActiveMerchant, ccy)}`} />
        </div>
        <Grid>
          <Card title="Revenue and direct costs by month" note={ccy}>
            <Legend items={[["Revenue", S1], ["Direct costs", S2]]} />
            {monthly.length ? <Chart><BarChart data={monthly}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={(v) => num(v)} {...axis} width={56} />
              <Tooltip content={<Tip fmt={(v: any) => money(v, ccy)} />} cursor={{ fill: C.muted }} />
              <Bar dataKey="revenue" name="Revenue" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={24} /><Bar dataKey="directCosts" name="Direct costs" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={24} /></BarChart></Chart>
              : <Empty text="No revenue in this period." />}
          </Card>
          <Card title="Revenue streams" note="Planned and in-development streams never show amounts unless the ledger has actually booked revenue.">
            <Table rows={d.streams} cols={[["Stream", (r: any) => r.label], ["Status", (r: any) => <Status value={r.status} />], ["Actual (own currency)", (r: any) => r.showsAmounts ? <PerCurrency rows={r.actual} /> : <span className="text-muted-foreground">—</span>, "r"]]} />
          </Card>
          <Card title="By currency"><Table rows={d.revenueByCurrency} cols={[["Currency", (r: any) => r.currency], ["Revenue", (r: any) => num(r.amount), "r"], ["Gross profit", (r: any) => num(d.grossProfitByCurrency.find((g: any) => g.currency === r.currency)?.amount), "r"], ["Volume", (r: any) => num(d.grossTransactionVolumeByCurrency.find((g: any) => g.currency === r.currency)?.amount), "r"]]} /></Card>
          <Card title="By country" note="Attributed to the paying customer's country of residence."><Table rows={d.byCountry} cols={[["Country", (r: any) => r.country], ["Currency", (r: any) => r.currency], ["Revenue", (r: any) => num(r.revenue), "r"]]} /></Card>
          <Card title="Direct costs by type"><Table rows={d.directCostsByType} cols={[["Type", (r: any) => label(r.type)], ["Amount", (r: any) => <PerCurrency rows={r.byCurrency} />, "r"]]} empty="No direct costs booked in the ledger." /></Card>
        </Grid>
        <Methodology m={c.methodology} />
        <Notes items={d.notes} />
      </>}
    </Page>
  )
}

// ─── financial statements ───────────────────────────────────────────────────
function yearStart() { const t = new Date(); return `${t.getUTCFullYear()}-01-01` }
function today() { return new Date().toISOString().slice(0, 10) }

export function Financials() {
  const me = useMe()
  const [start, setStart] = useState(yearStart())
  const [end, setEnd] = useState(today())
  const q = useBoard<any>("/financials", { start, end })
  const b = useBoard<any>("/settings/budgets")
  const d = q.data
  const ccy = d?.reportingCurrency ?? ""
  const quick = (k: "m" | "q" | "y") => {
    const t = new Date(); const y = t.getUTCFullYear(); const mo = t.getUTCMonth()
    if (k === "m") setStart(`${y}-${String(mo + 1).padStart(2, "0")}-01`)
    if (k === "q") setStart(`${y}-${String(Math.floor(mo / 3) * 3 + 1).padStart(2, "0")}-01`)
    if (k === "y") setStart(`${y}-01-01`)
    setEnd(today())
  }
  const months = d?.months ?? []
  const row = (l: string, key: string, strong = false) => [l, ...months.map((m: any) => m[key]), d?.totals?.[key]] as any[]
  const lines = d ? [
    row("Revenue (ledger)", "revenue", true), row("Direct costs (ledger)", "directCosts"), row("Gross profit", "grossProfit", true),
    ...Object.entries(d.opexLabels).map(([k, l]) => [`  ${l}`, ...months.map((m: any) => m.opexLines?.[k] ?? null), null]),
    row("Operating expenses", "operatingExpenses", true), row("Other income", "otherIncome"), row("EBITDA", "ebitda", true),
    row("Depreciation", "depreciation"), row("Amortisation", "amortisation"), row("Finance costs", "financeCosts"), row("Tax", "tax"),
    row("Net profit or loss", "netProfit", true),
  ] : []
  return (
    <Page title="Financial statements" subtitle={d ? `${ccy} · ${label(d.status)} · ${d.start} to ${d.end}` : undefined}
      actions={<>
        <div className="flex gap-1">{(["m", "q", "y"] as const).map((k) => <Btn key={k} small kind="outline" onClick={() => quick(k)}>{k === "m" ? "Month" : k === "q" ? "Quarter" : "Year"}</Btn>)}</div>
        <Input type="date" aria-label="From" value={start} onChange={(e) => setStart(e.target.value)} className="!w-40 h-9" />
        <Input type="date" aria-label="To" value={end} onChange={(e) => setEnd(e.target.value)} className="!w-40 h-9" />
        <Btn kind="outline" onClick={() => download(`/financials.csv?start=${start}&end=${end}`, "bukkapay-financials.csv")}><Download className="w-4 h-4" />CSV</Btn>
        <Btn kind="outline" onClick={() => window.print()}>Print / PDF</Btn>
      </>}>
      <Loading q={q} />
      {d && <>
        {d.status === "unavailable" && <Banner>No management accounts for this period, so operating costs, net profit, the balance sheet and cash flow are unavailable. Revenue and direct costs come from the ledger.</Banner>}
        {d.status === "incomplete" && <Banner>Incomplete: some months in this period have no management accounts.</Banner>}
        <Card title="Profit and loss" note="Revenue and direct costs from the ledger; everything else from the monthly management accounts.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><th className="text-left py-2 pr-4 font-medium text-muted-foreground">Line</th>{months.map((m: any) => <th key={m.month} className="text-right py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{monthLabel(m.month)}{!m.hasManagementAccounts && "*"}</th>)}<th className="text-right py-2 px-2 font-semibold">Total</th></tr></thead>
              <tbody>{lines.map(([l, ...v]) => {
                const strong = !String(l).startsWith("  ") && ["Gross profit", "Operating expenses", "EBITDA", "Net profit or loss", "Revenue (ledger)"].includes(l)
                return <tr key={l} className={`border-b border-border/50 ${strong ? "font-semibold" : ""}`}><td className="py-1.5 pr-4 whitespace-pre">{l}</td>{v.map((x: any, i: number) => <td key={i} className={`text-right px-2 tabular-nums whitespace-nowrap ${x != null && Number(x) < 0 ? "text-[var(--bad)]" : ""}`}>{x == null ? <span className="text-muted-foreground">n/a</span> : num(x)}</td>)}</tr>
              })}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">* No management accounts for that month.</p>
        </Card>
        <Grid>
          <Card title="Balance sheet" note={d.balanceSheet ? `As at the end of ${monthLabel(d.balanceSheet.asAt)}. Management-reported.` : "Needs management accounts."}>
            {d.balanceSheet ? <>
              {!d.balanceSheet.complete && <Banner>Incomplete: not every balance sheet line has been entered.</Banner>}
              <dl className="text-sm divide-y divide-border mt-2">
                {[["Cash and cash equivalents", d.balanceSheet.cashAndEquivalents], ["Receivables", d.balanceSheet.receivables], ["Other assets", d.balanceSheet.otherAssets], ["Total company assets", d.balanceSheet.totalCompanyAssets],
                  ["Liabilities", d.balanceSheet.liabilities], ["Shareholders' equity", d.balanceSheet.equity]].map(([l, v]) => <div key={l} className="flex py-1.5"><dt className="mr-auto">{l}</dt><dd className="tabular-nums">{v == null ? "n/a" : num(v)}</dd></div>)}
              </dl>
              {d.balanceSheet.balances === false && <p className="text-xs text-[var(--bad)] mt-2">Assets don't equal liabilities plus equity in the figures entered.</p>}
            </> : <Empty text="Unavailable: a balance sheet is never built from wallet transactions alone." />}
            <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs"><p className="font-medium">Client money (held for customers and merchants, off balance sheet)</p>
              <p className="mt-1">Owed: {money(d.clientMoney.owedToCustomersAndMerchants, ccy)} · Safeguarded: {money(d.clientMoney.safeguardedFunds, ccy)}</p><p className="text-muted-foreground mt-1">{d.clientMoney.note}</p></div>
          </Card>
          <Card title="Cash flow" note="From the management accounts.">
            {d.cashFlow ? <>
              {!d.cashFlow.complete && <Banner>Incomplete: some months have no cash flow figures.</Banner>}
              <dl className="text-sm divide-y divide-border mt-2">
                {[["Opening cash", d.cashFlow.openingCash], ["Operating cash flow", d.cashFlow.operating], ["Investing cash flow", d.cashFlow.investing], ["Financing cash flow", d.cashFlow.financing], ["Net cash movement", d.cashFlow.netMovement], ["Closing cash", d.cashFlow.closingCash]].map(([l, v]) => <div key={l} className="flex py-1.5"><dt className="mr-auto">{l}</dt><dd className="tabular-nums">{v == null ? "n/a" : num(v)}</dd></div>)}
              </dl>
            </> : <Empty text="Unavailable for this period." />}
          </Card>
          <Card title="Budget versus actual" note="Operating expenses against the approved budget.">
            {d.budgetVsActual ? (
              <dl className="text-sm divide-y divide-border">
                <div className="flex py-1.5"><dt className="mr-auto">Budget</dt><dd className="tabular-nums">{money(d.budgetVsActual.budget, ccy)}</dd></div>
                <div className="flex py-1.5"><dt className="mr-auto">Actual</dt><dd className="tabular-nums">{money(d.budgetVsActual.actual, ccy)}</dd></div>
                <div className="flex py-1.5"><dt className="mr-auto">Variance</dt><dd className="tabular-nums">{d.budgetVsActual.actual != null ? money(String(Number(d.budgetVsActual.budget) - Number(d.budgetVsActual.actual)), ccy) : "—"}</dd></div>
              </dl>
            ) : <Empty text="No budget has been set for this period." />}
            {can(me.data, "financials.manage") && <p className="text-xs text-muted-foreground mt-2">Budgets are set in Company settings. {b.data?.budgets?.length ?? 0} budget lines recorded.</p>}
          </Card>
        </Grid>
        <Methodology m={d.methodology} />
        <Notes items={d.notes} />
      </>}
    </Page>
  )
}

// ─── cross-border ───────────────────────────────────────────────────────────
export function CrossBorder() {
  const { p, setP, q } = usePeriodPage("/cross-border")
  const d = q.data
  const codes = d ? Array.from(new Set([...d.liveCorridors.map((c: any) => c.from), ...d.liveCorridors.map((c: any) => c.to)])).sort() as string[] : []
  return (
    <Page title="Cross-border payments" subtitle={d ? <PeriodLine period={d.period} /> : undefined} actions={<PeriodPicker value={p} onChange={setP} />}>
      <Loading q={q} />
      {d && <>
        {d.transfersPendingOver48h > 0 && <Banner>{d.transfersPendingOver48h} transfer(s) have been pending for more than 48 hours.</Banner>}
        <Card title="Corridor matrix" note="Live corridors only. Rows send, columns receive; each cell is completed transfers in the period.">
          {codes.length ? (
            <div className="overflow-x-auto"><table className="text-sm border-separate" style={{ borderSpacing: 3 }}>
              <thead><tr><th className="text-left text-xs text-muted-foreground pr-2">From \ To</th>{codes.map((c) => <th key={c} className="text-xs text-muted-foreground px-2">{c}</th>)}</tr></thead>
              <tbody>{codes.map((f) => <tr key={f}><td className="text-xs font-medium pr-2">{f}</td>{codes.map((t) => {
                const cs = d.liveCorridors.filter((c: any) => c.from === f && c.to === t)
                const n = cs.reduce((a: number, c: any) => a + c.completed, 0)
                return <td key={t} title={cs.map((c: any) => `${c.fromCurrency}→${c.toCurrency}: ${c.completed} completed`).join("\n")} className={`w-14 h-10 text-center rounded tabular-nums ${cs.length ? "bg-[color-mix(in_oklab,var(--s1)_18%,transparent)] font-medium" : "bg-muted/40 text-muted-foreground"}`}>{cs.length ? n : f === t ? "" : "·"}</td>
              })}</tr>)}</tbody>
            </table></div>
          ) : <Empty text="No cross-border corridors are live yet." />}
        </Card>
        <Card title="Live corridors">
          <Table rows={d.liveCorridors} empty="None live yet." cols={[["Corridor", (r: any) => `${r.fromName} → ${r.toName}`], ["Currencies", (r: any) => `${r.fromCurrency} → ${r.toCurrency}`], ["Status", (r: any) => <Status value={r.status === "active" ? "live" : r.status} />],
            ["Transfers", (r: any) => num(r.transfers), "r"], ["Completed", (r: any) => num(r.completed), "r"], ["Pending", (r: any) => num(r.pending), "r"], ["Failed", (r: any) => num(r.failed), "r"], ["Reversed", (r: any) => num(r.reversed), "r"],
            ["Sent", (r: any) => `${r.fromCurrency} ${num(r.sent)}`, "r"], ["Fees", (r: any) => `${r.fromCurrency} ${num(r.fees)}`, "r"], ["Success", (r: any) => r.successRate ? `${r.successRate}%` : "—", "r"], ["Avg. time", (r: any) => r.avgProcessingMinutes != null ? `${r.avgProcessingMinutes} min` : "—", "r"]]} />
        </Card>
        <Grid>
          <Card title="Planned and not live" note="Shown for completeness. No figures: these corridors aren't operating.">
            <Table rows={d.plannedCorridors} empty="None." cols={[["Corridor", (r: any) => `${r.fromName} → ${r.toName}`], ["Currencies", (r: any) => `${r.fromCurrency} → ${r.toCurrency}`], ["Status", (r: any) => <Status value={r.status} />]]} />
          </Card>
          <Card title="Revenue booked on cross-border transfers"><Table rows={d.ledgerRevenue} empty="None booked in this period." cols={[["Stream", (r: any) => label(r.stream)], ["Currency", (r: any) => r.currency], ["Amount", (r: any) => num(r.amount), "r"]]} /></Card>
        </Grid>
        <Notes items={d.notes} />
      </>}
    </Page>
  )
}

// ─── card & POS ─────────────────────────────────────────────────────────────
export function Pos() {
  const { p, setP, q } = usePeriodPage("/pos")
  const d = q.data
  return (
    <Page title="Card & POS payments" subtitle="Customers paying at existing card machines with a BukkaPay card or their phone." actions={<PeriodPicker value={p} onChange={setP} />}>
      <Loading q={q} />
      {d && <>
        {d.status !== "live" && <Banner tone="info">Card issuing is {d.status === "sandbox" ? "in sandbox (test mode)" : "not configured"}: {d.status === "sandbox" ? "figures below are test activity, not live payments." : "there are no live card payments yet."}</Banner>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="In-person attempts" value={num(d.summary.in_person.attempts)} sub={`${d.summary.in_person.successRate ?? "—"}% successful`} />
          <Kpi label="Phone-initiated" value={num(d.summary.phone.attempts)} sub={`${d.summary.phone.successRate ?? "—"}% successful`} />
          <Kpi label="Online card" value={num(d.summary.online.attempts)} sub={`${d.summary.online.successRate ?? "—"}% successful`} />
        </div>
        <Card title="By channel and currency" note="Values are cardholders' payments: not revenue and not merchant settlement.">
          <Table rows={d.channels} empty="No card activity in this period." cols={[["Channel", (r: any) => `${label(r.channel)}${r.phoneInitiated ? " (phone)" : ""}`], ["Currency", (r: any) => r.currency], ["Attempts", (r: any) => num(r.attempts), "r"], ["Successful", (r: any) => num(r.successful), "r"], ["Failed", (r: any) => num(r.failed), "r"], ["Success", (r: any) => r.successRate ? `${r.successRate}%` : "—", "r"], ["Approved value", (r: any) => num(r.approvedValue), "r"], ["Cardholder fees", (r: any) => num(r.cardholderFees), "r"], ["Merchants", (r: any) => num(r.distinctMerchants), "r"]]} />
        </Card>
        <Grid>
          <Card title="In-person value by country"><Table rows={d.byCountry} empty="None." cols={[["Country", (r: any) => r.country], ["Currency", (r: any) => r.currency], ["Payments", (r: any) => num(r.successful), "r"], ["Value", (r: any) => num(r.value), "r"]]} /></Card>
          <Card title="Active cards by network"><Table rows={d.activeCards} empty="No active cards." cols={[["Network", (r: any) => r.network.toUpperCase()], ["Form", (r: any) => label(r.form)], ["Cards", (r: any) => num(r.count), "r"]]} /></Card>
          <Card title="Card revenue and costs (ledger)"><Table rows={d.ledger} empty="None booked in this period." cols={[["Account", (r: any) => r.account], ["Currency", (r: any) => r.currency], ["Amount", (r: any) => num(r.amount), "r"]]} /></Card>
          <Card title="Decline reasons"><Table rows={d.declineReasons} empty="No declines." cols={[["Reason", (r: any) => label(r.reason)], ["Count", (r: any) => num(r.count), "r"]]} /></Card>
        </Grid>
        <Notes items={[...d.notes, d.terminalsNote]} />
      </>}
    </Page>
  )
}

// ─── FX ─────────────────────────────────────────────────────────────────────
export function Fx() {
  const { p, setP, q } = usePeriodPage("/fx")
  const d = q.data
  return (
    <Page title="FX & currency conversion" subtitle={d ? <PeriodLine period={d.period} /> : undefined} actions={<PeriodPicker value={p} onChange={setP} />}>
      <Loading q={q} />
      {d && <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="FX revenue" value={<PerCurrency rows={d.fxRevenueByCurrency} />} sub="Booked to FX revenue accounts" />
          <Kpi label="FX costs" value={<PerCurrency rows={d.fxCostsByCurrency} />} />
          <Kpi label="Conversion success rate" value="—" sub={d.successRateNote} />
        </div>
        <Card title="Conversions by currency pair" note={`Reference rate: ${d.referenceRateSource}`}>
          <Table rows={d.pairs} empty="No conversions in this period." cols={[["Pair", (r: any) => r.pair], ["Conversions", (r: any) => num(r.conversions), "r"], ["Sold", (r: any) => `${r.from} ${num(r.volumeSold)}`, "r"], ["Bought", (r: any) => `${r.to} ${num(r.volumeBought)}`, "r"], ["Avg. applied rate", (r: any) => r.avgAppliedRate ?? "—", "r"], ["Avg. reference rate", (r: any) => r.avgReferenceRate ?? "—", "r"], ["Fees", (r: any) => num(r.feesCharged), "r"], ["Spread recorded", (r: any) => num(r.spreadRecorded), "r"]]} />
        </Card>
        <Grid>
          <Card title="Currency exposure" note="FX pool position by currency."><Table rows={d.exposure} empty="No FX position." cols={[["Currency", (r: any) => r.currency], ["Position", (r: any) => num(r.position), "r"]]} /></Card>
          <Card title="Current quoted rates"><Table rows={d.currentQuotedRates} empty="No pairs configured." cols={[["Pair", (r: any) => r.pair], ["Rate", (r: any) => r.rate, "r"], ["Updated", (r: any) => dateLabel(r.updatedAt)], ["Active", (r: any) => r.active ? "Yes" : "No"]]} /></Card>
        </Grid>
        <Notes items={d.notes} />
      </>}
    </Page>
  )
}

// ─── custodians ─────────────────────────────────────────────────────────────
export function Custodians() {
  const me = useMe()
  const q = useBoard<any>("/custodians")
  const d = q.data
  const [open, setOpen] = useState(false)
  return (
    <Page title="Custodians & liquidity" subtitle="Where customer money is held, compared with what the ledger says is owed."
      actions={can(me.data, "custodians.record") ? <Btn onClick={() => setOpen(true)}>Record a statement</Btn> : undefined}>
      <Loading q={q} />
      {d && <>
        {d.alerts.length > 0 && <div className="space-y-2">{d.alerts.map((a: any, i: number) => <Banner key={i} tone={a.level === "high" ? "bad" : "warn"}>{a.message}</Banner>)}</div>}
        <Card title="Custodian arrangements">
          <Table rows={d.custodians} empty="No custodian arrangements are recorded yet." cols={[
            ["Custodian", (r: any) => <><p className="font-medium">{r.custodian}</p><p className="text-xs text-muted-foreground">{label(r.institutionType)} · {r.role}</p></>],
            ["Country", (r: any) => r.countryName], ["Currency", (r: any) => r.currency], ["Arrangement", (r: any) => <Status value={r.arrangementStatus} />],
            ["Owed (ledger)", (r: any) => num(r.ledgerLiability), "r"], ["Reported balance", (r: any) => r.latest ? num(r.latest.reportedBalance) : "—", "r"],
            ["Difference", (r: any) => r.latest ? <span className={Number(r.latest.difference) < 0 ? "text-[var(--bad)]" : ""}>{num(r.latest.difference)}</span> : "—", "r"],
            ["Source", (r: any) => r.latest ? d.sourceLabels[r.latest.source] : "—"], ["Status", (r: any) => r.latest ? <Status value={r.latest.status} /> : <Status value="no_data" text="No statement" />],
            ["Last statement", (r: any) => r.latest ? dateLabel(r.latest.statementDate) : "—"], ["Pending settlements", (r: any) => num(r.pendingSettlements), "r"],
          ]} />
        </Card>
        {d.unlinked.length > 0 && <Card title="Custodians not yet linked to a currency"><Table rows={d.unlinked} cols={[["Custodian", (r: any) => r.custodian], ["Country", (r: any) => r.country], ["Status", (r: any) => <Status value={r.status} />]]} /></Card>}
        <Notes items={d.notes} />
      </>}
      <ReconModal open={open} onClose={() => setOpen(false)} custodians={d?.custodians ?? []} />
    </Page>
  )
}

function ReconModal({ open, onClose, custodians }: { open: boolean; onClose: () => void; custodians: any[] }) {
  const a = useAction("post", ["/custodians", "/dashboard"])
  const [f, setF] = useState<any>({ source: "manual_statement", statementDate: today() })
  const opts = custodians.map((c) => ({ key: `${c.custodianId}:${c.currency}`, label: `${c.custodian} · ${c.currency}` }))
  const save = async () => {
    const [custodianId, currency] = (f.pick ?? opts[0]?.key ?? ":").split(":")
    await a.run("/custodians/reconciliations", { custodianId, currency, statementDate: f.statementDate, reportedBalance: f.reportedBalance, pendingSettlements: f.pending || null, source: f.source, documentId: f.documentId || null, notes: f.notes || null })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Record a custodian statement">
      <div className="space-y-3">
        <Field label="Custodian and currency"><Select value={f.pick ?? opts[0]?.key} onChange={(e) => setF({ ...f, pick: e.target.value })}>{opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Statement date"><Input type="date" value={f.statementDate} onChange={(e) => setF({ ...f, statementDate: e.target.value })} /></Field>
          <Field label="Reported balance"><Input inputMode="decimal" value={f.reportedBalance ?? ""} onChange={(e) => setF({ ...f, reportedBalance: e.target.value })} /></Field>
        </div>
        <Field label="Where the balance came from"><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
          <option value="manual_statement">Bank or custodian statement (attach it)</option><option value="management_reported">Management-reported (not verified)</option><option value="live_integration">Live integration</option></Select></Field>
        <Field label="Statement document ID" hint="Upload the statement in Documents first, then paste its ID. Without evidence a balance is never marked reconciled."><Input value={f.documentId ?? ""} onChange={(e) => setF({ ...f, documentId: e.target.value })} /></Field>
        <Field label="Pending settlements (optional)"><Input inputMode="decimal" value={f.pending ?? ""} onChange={(e) => setF({ ...f, pending: e.target.value })} /></Field>
        <Field label="Notes"><TextArea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <ErrorLine text={a.error} />
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} busy={a.busy} disabled={!f.reportedBalance || !opts.length}>Save</Btn></div>
      </div>
    </Modal>
  )
}
