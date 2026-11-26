import type { ComponentType } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Redirect, Route, Switch } from "wouter"
import "../index.css"
import "./boardroom.css"
import { initTheme } from "../lib/theme"
import { can, getToken, useMe } from "./api"
import { AcceptPage, ForgotPage, LoginPage, MfaSetupPage, OwnerPage, ResetPage } from "./auth-pages"
import { Layout, NoAccess, allowed } from "./shell"
import { Executive, Health, Insights } from "./pages/overview"
import { Adoption, CrossBorder, Currencies, Custodians, Financials, Fx, Pos, Revenue } from "./pages/money"
import { Countries, Milestones, Risks } from "./pages/strategy"
import { Fundraising, Investors, MyInvestment, UseOfFunds } from "./pages/capital"
import { Announcements, Documents, Meetings, ReportDetail, Reports, Resolutions } from "./pages/governance"
import { Account, Audit, Settings, Users } from "./pages/admin"

document.documentElement.classList.add("boardroom")
initTheme()
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 } } })

// Each page also needs its permission on the server: hiding it here is only convenience.
const PAGES: [string, ComponentType, string | null][] = [
  ["/health", Health, "risks.view"], ["/insights", Insights, "insights.view"],
  ["/adoption", Adoption, "adoption.view"], ["/currencies", Currencies, "analytics.view"], ["/revenue", Revenue, "revenue.view"],
  ["/financials", Financials, "financials.view"], ["/cross-border", CrossBorder, "crossborder.view"], ["/pos", Pos, "pos.view"],
  ["/fx", Fx, "fx.view"], ["/custodians", Custodians, "custodians.view"], ["/countries", Countries, "countries.view"],
  ["/milestones", Milestones, "milestones.view"], ["/risks", Risks, "risks.view"], ["/my-investment", MyInvestment, "investments.own"],
  ["/fundraising", Fundraising, "fundraising.view"], ["/investors", Investors, "investors.view"], ["/use-of-funds", UseOfFunds, "use_of_funds.view"],
  ["/meetings", Meetings, "governance.view"], ["/resolutions", Resolutions, "resolutions.view"], ["/reports/:id", ReportDetail, "reports.view"],
  ["/reports", Reports, "reports.view"], ["/documents", Documents, "documents.view"], ["/announcements", Announcements, "announcements.view"],
  ["/users", Users, "users.manage"], ["/audit", Audit, "audit.view"], ["/settings", Settings, "financials.manage"], ["/account", Account, null],
]

function Guard({ perm, Page }: { perm: string | null; Page: ComponentType }) {
  const me = useMe()
  if (me.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (perm && !can(me.data, perm)) return <NoAccess />
  return <Page />
}

function Home() {
  const me = useMe()
  if (me.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (can(me.data, "dashboard.view")) return <Executive />
  const first = allowed(me.data).find((i) => i.path !== "/")
  return first ? <Redirect to={first.path} /> : <NoAccess />
}

function Signed() {
  if (!getToken()) return <Redirect to="/login" />
  return (
    <Layout>
      <Switch>
        <Route path="/"><Home /></Route>
        {PAGES.map(([path, Page, perm]) => <Route key={path} path={path}><Guard perm={perm} Page={Page} /></Route>)}
        <Route><NoAccess /></Route>
      </Switch>
    </Layout>
  )
}

function App() {
  return (
    <QueryClientProvider client={qc}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/accept" component={AcceptPage} />
        <Route path="/forgot" component={ForgotPage} />
        <Route path="/reset" component={ResetPage} />
        <Route path="/owner" component={OwnerPage} />
        <Route path="/mfa">{getToken() ? <MfaSetupPage /> : <Redirect to="/login" />}</Route>
        <Route><Signed /></Route>
      </Switch>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
