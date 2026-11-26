import { useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts"
import { Download, Printer, Sparkles } from "lucide-react"
import { can, download, useBoard, useMe } from "../api"
import {
  Banner, C, Btn, Card, Chart, Empty, Grid, Kpi, Legend, Loading, Notes, Page, PeriodLine, PeriodPicker,
  PerCurrency, S1, S2, S3, Status, Table, Tip, axis, dateTime, label, money, monthLabel, num, pct, toN, toneOf, usePeriod,
} from "../kit"

export function Executive() {
  const me = useMe()
  const { p, setP, params, ready } = usePeriod("month")
  const q = useBoard<any>("/dashboard", params, ready)
  const d = q.data
  const ccy = d?.reportingCurrency ?? ""
  const m = (v: any) => money(v, ccy)
  const k = d?.kpis ?? {}
  const series = (d?.series ?? []) as any[]
  const groups = Object.values((d?.paymentMethods ?? []).reduce((acc: any, r: any) => {
    acc[r.group] = acc[r.group] ?? { group: r.label, entries: 0 }
    acc[r.group].entries += r.entries
    return acc
  }, {})).sort((a: any, b: any) => b.entries - a.entries) as any[]
  return (
    <Page title="Executive dashboard"
      subtitle={d ? <><PeriodLine period={d.period} previous={d.previous} /> · Updated {dateTime(d.generatedAt)}</> : "Company performance from verified data"}
      actions={<>
        <PeriodPicker value={p} onChange={setP} />
        {can(me.data, "reports.view") && <Btn kind="outline" onClick={() => download("/export.csv?months=12", "bukkapay-board-metrics.csv")}><Download className="w-4 h-4" />CSV</Btn>}
        <Btn kind="outline" onClick={() => window.print()}><Printer className="w-4 h-4" />Print</Btn>
      </>}>
      <Loading q={q} />
      {d && <>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-1">Data: {d.dataSources.join(" · ")}</span>
          {d.reconciliationStatus && <span className="rounded-full bg-muted px-2.5 py-1 inline-flex items-center gap-1.5">Custodian reconciliation: <Status value={d.reconciliationStatus === "reconciled" ? "reconciled" : "unreconciled"} text={label(d.reconciliationStatus)} /></span>}
          {d.statementsStatus && <span className="rounded-full bg-muted px-2.5 py-1">Accounts: {label(d.statementsStatus)}</span>}
          <span className="rounded-full bg-muted px-2.5 py-1">Amounts in {ccy}, each period converted at its own rate</span>
        </div>
        {d.fxMethodology?.unconverted?.length > 0 && <Banner>Not converted (no exchange rate for the period): {Array.from(new Set(d.fxMethodology.unconverted.map((u: any) => u.currency))).join(", ")}. Those amounts are left out of converted totals and shown in their own currency below.</Banner>}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Registered customers" value={num(k.registeredCustomers)} sub={`${num(k.newCustomers)} new ${k.newCustomersChange != null ? `(${pct(k.newCustomersChange)})` : ""}`} tone={toneOf(k.newCustomersChange)} />
          <Kpi label="Active customers" value={num(k.activeCustomers)} sub={k.activeCustomersChange != null ? `${pct(k.activeCustomersChange)} vs previous` : `${num(k.monthlyActiveCustomers)} in the last 30 days`} tone={toneOf(k.activeCustomersChange)} />
          <Kpi label="Active wallets" value={num(k.activeWallets)} />
          <Kpi label="Merchants" value={num(k.totalMerchants)} sub={`${num(k.activeMerchants)} took payments`} />
          <Kpi label="Transaction volume" value={m(k.transactionVolume)} sub="Customer money moved: not revenue" />
          <Kpi label="Company revenue" value={m(k.revenue)} sub={k.revenueChange != null ? `${pct(k.revenueChange)} vs previous` : "Fees and spreads earned"} tone={toneOf(k.revenueChange)} />
          <Kpi label="Gross profit" value={m(k.grossProfit)} tone={toneOf(k.grossProfit)} sub="Revenue less direct costs" />
          <Kpi label="Operating expenses" value={k.operatingExpenses != null ? m(k.operatingExpenses) : can(me.data, "financials.view") ? "Not entered" : "—"} />
          <Kpi label="Net profit or loss" value={k.netProfit != null ? m(k.netProfit) : "—"} tone={toneOf(k.netProfit)} sub={k.netProfit == null ? "Needs management accounts" : undefined} />
          <Kpi label="Available company cash" value={k.availableCash != null ? m(k.availableCash) : "—"} sub={k.availableCash == null ? "Needs management accounts" : "Latest month-end"} />
          <Kpi label="Countries" value={`${num(k.operationalCountries)} operational`} sub={`${num(k.pilotCountries)} in pilot`} />
          <Kpi label="Supported currencies" value={k.supportedCurrencies?.length ? k.supportedCurrencies.join(" · ") : "—"} />
        </div>
        <Card title="Customer wallet liabilities" note="Money BukkaPay holds for customers, by currency. A liability, never income, and never added across currencies.">
          <div className="flex flex-wrap gap-3">
            {(k.customerWalletLiabilities ?? []).map((c: any) => <div key={c.currency} className="rounded-xl bg-muted px-4 py-3"><p className="text-xs text-muted-foreground">{c.currency}</p><p className="text-lg font-semibold tabular-nums">{num(c.amount)}</p></div>)}
            {!k.customerWalletLiabilities?.length && <Empty text="No wallet balances yet." />}
          </div>
        </Card>
        <Grid>
          <Card title="Customer growth" note="Customers at each month-end.">
            <Chart><AreaChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis allowDecimals={false} tickFormatter={(v) => num(v)} {...axis} width={52} />
              <Tooltip content={<Tip />} /><Area dataKey="users" name="Customers" stroke={C.s1} strokeWidth={2} fill={C.s1} fillOpacity={0.12} /></AreaChart></Chart>
          </Card>
          <Card title="Monthly active customers" note="Made at least one payment in the month.">
            <Chart><LineChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis allowDecimals={false} tickFormatter={(v) => num(v)} {...axis} width={52} />
              <Tooltip content={<Tip />} /><Line dataKey="mau" name="Active customers" stroke={C.s1} strokeWidth={2} dot={{ r: 4 }} /></LineChart></Chart>
          </Card>
          <Card title="Merchant growth">
            <Legend items={[["Active", S1], ["New", S2]]} />
            <Chart><LineChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis allowDecimals={false} tickFormatter={(v) => num(v)} {...axis} width={52} />
              <Tooltip content={<Tip />} /><Line dataKey="activeMerchants" name="Active" stroke={C.s1} strokeWidth={2} dot={{ r: 4 }} /><Line dataKey="newMerchants" name="New" stroke={C.s2} strokeWidth={2} dot={{ r: 4 }} /></LineChart></Chart>
          </Card>
          <Card title="Transaction volume" note={`${ccy}. Customer money moved: never counted as revenue.`}>
            <Chart><AreaChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={(v) => num(v)} {...axis} width={56} />
              <Tooltip content={<Tip fmt={m} />} /><Area dataKey="tpv" name="Volume" stroke={C.s2} strokeWidth={2} fill={C.s2} fillOpacity={0.12} /></AreaChart></Chart>
          </Card>
          <Card title="Company revenue" note={`${ccy}. Fees and spreads booked in the ledger.`}>
            <Chart><BarChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={(v) => num(v)} {...axis} width={56} />
              <Tooltip content={<Tip fmt={m} />} cursor={{ fill: C.muted }} /><Bar dataKey="revenue" name="Revenue" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={28} /></BarChart></Chart>
          </Card>
          <Card title="Profit and loss" note="Net profit by month (needs management accounts). Green is profit, orange is loss.">
            {series.some((r) => r.netProfit != null) ? (
              <Chart><BarChart data={series}><CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="month" tickFormatter={monthLabel} {...axis} /><YAxis tickFormatter={(v) => num(v)} {...axis} width={56} />
                <Tooltip content={<Tip fmt={m} />} cursor={{ fill: C.muted }} />
                <Bar dataKey="netProfit" name="Net" radius={[4, 4, 4, 4]} maxBarSize={28}>{series.map((r) => <Cell key={r.month} fill={(r.netProfit ?? 0) >= 0 ? C.good : C.bad} />)}</Bar></BarChart></Chart>
            ) : <Empty text="No management accounts have been entered yet, so profit and loss can't be shown." />}
          </Card>
          <Card title="Wallets by currency" note="Number of customer wallets in each currency (counts can be compared; balances can't).">
            <CurrencyDistribution rows={d.currencies} />
          </Card>
          <Card title="Payment methods" note="Ledger entries by type of activity in the period.">
            {groups.length ? (
              <Chart height={Math.max(180, groups.length * 30)}><BarChart data={groups} layout="vertical" margin={{ left: 12 }}><CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" allowDecimals={false} tickFormatter={(v) => num(v)} {...axis} /><YAxis type="category" dataKey="group" {...axis} width={150} />
                <Tooltip content={<Tip labelFmt={null} />} cursor={{ fill: C.muted }} /><Bar dataKey="entries" name="Entries" fill={C.s2} radius={[0, 4, 4, 0]} maxBarSize={18} /></BarChart></Chart>
            ) : <Empty text="No activity in this period." />}
          </Card>
          <Card title="Country performance" note="Customers by country of residence, with active customers in the period.">
            <Table rows={(d.byCountry ?? []).slice(0, 12)} cols={[["Country", (r: any) => r.country], ["Registered", (r: any) => num(r.registered), "r"], ["New", (r: any) => num(r.new), "r"], ["Active", (r: any) => num(r.active), "r"]]} />
          </Card>
          <Card title="Revenue streams" note="Status is set by the company; amounts are what the ledger booked, in each currency.">
            <Table rows={d.revenueStreams ?? []} cols={[["Stream", (r: any) => r.label], ["Status", (r: any) => <Status value={r.status} />], ["Actual", (r: any) => r.showsAmounts ? <PerCurrency rows={r.actual} /> : <span className="text-muted-foreground">Not live</span>, "r"]]} />
          </Card>
        </Grid>
        <Methodology m={d.fxMethodology} />
      </>}
    </Page>
  )
}

function CurrencyDistribution({ rows }: { rows: any[] }) {
  const data = (rows ?? []).map((c) => ({ currency: c.code, walletEnabled: c.walletEnabled, balance: c.customerWalletBalances }))
  if (!data.length) return <Empty text="No supported currencies with wallets yet." />
  return <Table rows={data} cols={[["Currency", (r: any) => r.currency], ["Wallets enabled", (r: any) => r.walletEnabled ? "Yes" : "No"], ["Customer balances", (r: any) => `${r.currency} ${num(r.balance)}`, "r"]]} />
}

export function Methodology({ m }: { m?: any }) {
  const [open, setOpen] = useState(false)
  if (!m) return null
  return (
    <Card title="Currency methodology" note={m.method} actions={<Btn small kind="ghost" onClick={() => setOpen(!open)}>{open ? "Hide rates" : `Show ${m.ratesUsed?.length ?? 0} rates`}</Btn>}>
      {open && <Table rows={m.ratesUsed ?? []} empty="No conversions were needed." cols={[["Currency", (r: any) => r.currency], [`Rate to ${m.reportingCurrency}`, (r: any) => r.rate, "r"], ["Rate date", (r: any) => r.rateDate], ["Source", (r: any) => <span className="break-all text-xs">{r.source}</span>]]} />}
    </Card>
  )
}

export function Health() {
  const q = useBoard<any>("/health")
  return (
    <Page title="Company health" subtitle="A scorecard built only from data that exists. Anything without data says so.">
      <Loading q={q} />
      {q.data && <>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {q.data.sections.map((s: any) => (
            <Card key={s.area} title={s.area}>
              <ul className="space-y-3">
                {s.items.map((i: any) => (
                  <li key={i.name} className="flex items-start gap-3">
                    <div className="mr-auto min-w-0"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.note}</p></div>
                    <div className="text-right shrink-0"><Status value={i.status} text={q.data.statusLabels[i.status]} />{i.value && <p className="text-xs tabular-nums mt-1">{i.value}</p>}</div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Notes items={q.data.notes} />
      </>}
    </Page>
  )
}

export function Insights() {
  const [ai, setAi] = useState(false)
  const q = useBoard<any>("/insights", { ai })
  return (
    <Page title="Insights" subtitle="Observations calculated from approved figures. Not audited financial reporting."
      actions={q.data?.aiEnabled ? <Btn onClick={() => setAi(true)} busy={ai && q.isFetching}><Sparkles className="w-4 h-4" />Write an AI summary</Btn> : undefined}>
      <Loading q={q} />
      {q.data && <>
        <div className="space-y-3">
          {!q.data.observations.length && <Empty text="Not enough history yet for observations." />}
          {q.data.observations.map((o: any, i: number) => (
            <Card key={i}>
              <div className="flex items-start gap-3">
                <Status value={o.kind === "fact" ? "completed" : o.kind === "missing" ? "no_data" : "needs_attention"} text={o.kind === "fact" ? "Fact" : o.kind === "missing" ? "Missing" : "Projection"} />
                <div className="min-w-0"><p className="text-sm font-medium">{o.topic}</p><p className="text-sm mt-0.5">{o.text}</p>
                  {Object.keys(o.basis ?? {}).length > 0 && <p className="text-xs text-muted-foreground mt-1">Based on: {Object.entries(o.basis).map(([a, b]) => `${a}: ${num(toN(b))}`).join(" · ")}</p>}</div>
              </div>
            </Card>
          ))}
        </div>
        {!q.data.aiEnabled && <Notes items={["AI summaries are switched off. They can be enabled by the company with a configured provider; they only ever see approved aggregates, never customer records."]} />}
        {q.data.ai && <Card title="AI summary" note={q.data.ai.note}>{q.data.ai.text ? <div className="text-sm whitespace-pre-wrap leading-relaxed">{q.data.ai.text}</div> : <Empty text={q.data.ai.note} />}</Card>}
        <Notes items={[q.data.disclaimer]} />
      </>}
    </Page>
  )
}

