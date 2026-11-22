import { Component, type ReactNode } from "react"
import { Switch, Route, Router as WouterRouter } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch() {}
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
          <p className="text-4xl">⚠️</p>
          <h2 className="text-xl font-bold">Something went wrong on this page</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{(this.state.error as any).message}</p>
          <button
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.state.error ? null : this.props.children
  }
}

import Login from "@/pages/login"
import DashboardPage from "@/pages/dashboard"
import UsersPage from "@/pages/users"
import TransactionsPage from "@/pages/transactions"
import KycPage from "@/pages/kyc"
import AuditLogsPage from "@/pages/audit-logs"
import WalletsPage from "@/pages/wallets"
import CardsPage from "@/pages/cards"
import WebsitePage from "@/pages/website"
import LegalPage from "@/pages/legal"
import PaymentLinksPage from "@/pages/payment-links"
import MerchantsPage from "@/pages/merchants"
import BroadcastPage from "@/pages/broadcast"
import AdminManagementPage from "@/pages/admin-management"
import InternationalTransfersPage from "@/pages/international-transfers"
import ApprovalsPage from "@/pages/approvals"
import LedgerPage from "@/pages/ledger"
import ReconciliationPage from "@/pages/reconciliation"
import CompliancePage from "@/pages/compliance"
import CrossBorderPage from "@/pages/cross-border"
import FeesLimitsPage from "@/pages/fees-limits"
import MerchantKybPage from "@/pages/merchant-kyb"
import NetworkCountriesPage from "@/pages/network-countries"
import NetworkCurrenciesPage from "@/pages/network-currencies"
import NetworkCustodiansPage from "@/pages/network-custodians"
import NetworkProvidersPage from "@/pages/network-providers"
import NetworkCorridorsPage from "@/pages/network-corridors"
import TravelOperatorsPage from "@/pages/travel-operators"
import TravelRoutesPage from "@/pages/travel-routes"
import SupportChatPage from "@/pages/support-chat"
import AcceptInvitePage from "@/pages/accept-invite"
import EnquiriesPage from "@/pages/enquiries"
import TreasuryPage from "@/pages/treasury"
import StokvelsPage from "@/pages/stokvels"
import NotFound from "@/pages/not-found"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

function Router() {
  return (
    <Switch>
      <Route path="/login"          component={Login} />
      <Route path="/accept-invite"  component={AcceptInvitePage} />
      <Route path="/"               component={DashboardPage} />
      <Route path="/users"          component={UsersPage} />
      <Route path="/transactions"   component={TransactionsPage} />
      <Route path="/kyc"            component={KycPage} />
      <Route path="/audit-logs"     component={AuditLogsPage} />
      <Route path="/wallets"        component={WalletsPage} />
      <Route path="/cards"          component={CardsPage} />
      <Route path="/website"        component={WebsitePage} />
      <Route path="/legal"          component={LegalPage} />
      <Route path="/payment-links"  component={PaymentLinksPage} />
      <Route path="/merchants"      component={MerchantsPage} />
      <Route path="/broadcast"         component={BroadcastPage} />
      <Route path="/admin-management"  component={AdminManagementPage} />
      <Route path="/approvals"          component={ApprovalsPage} />
      <Route path="/ledger"             component={LedgerPage} />
      <Route path="/reconciliation"     component={ReconciliationPage} />
      <Route path="/compliance"         component={CompliancePage} />
      <Route path="/cross-border"       component={CrossBorderPage} />
      <Route path="/fees"               component={FeesLimitsPage} />
      <Route path="/merchant-kyb"       component={MerchantKybPage} />
      <Route path="/network/countries"  component={NetworkCountriesPage} />
      <Route path="/network/currencies" component={NetworkCurrenciesPage} />
      <Route path="/network/custodians" component={NetworkCustodiansPage} />
      <Route path="/network/providers"  component={NetworkProvidersPage} />
      <Route path="/network/corridors"  component={NetworkCorridorsPage} />
      <Route path="/international-transfers" component={InternationalTransfersPage} />
      <Route path="/travel-operators" component={TravelOperatorsPage} />
      <Route path="/travel-routes"    component={TravelRoutesPage} />
      <Route path="/support-chat"     component={SupportChatPage} />
      <Route path="/enquiries"        component={EnquiriesPage} />
      <Route path="/treasury"         component={TreasuryPage} />
      <Route path="/stokvels"         component={StokvelsPage} />
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <PageErrorBoundary>
            <Router />
          </PageErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
