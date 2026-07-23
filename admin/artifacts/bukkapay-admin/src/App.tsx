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
import PaymentLinksPage from "@/pages/payment-links"
import MerchantsPage from "@/pages/merchants"
import BroadcastPage from "@/pages/broadcast"
import AdminManagementPage from "@/pages/admin-management"
import PricingPage from "@/pages/pricing"
import CorridorsPage from "@/pages/corridors"
import InternationalTransfersPage from "@/pages/international-transfers"
import TravelOperatorsPage from "@/pages/travel-operators"
import TravelRoutesPage from "@/pages/travel-routes"
import SupportChatPage from "@/pages/support-chat"
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
      <Route path="/"               component={DashboardPage} />
      <Route path="/users"          component={UsersPage} />
      <Route path="/transactions"   component={TransactionsPage} />
      <Route path="/kyc"            component={KycPage} />
      <Route path="/audit-logs"     component={AuditLogsPage} />
      <Route path="/wallets"        component={WalletsPage} />
      <Route path="/payment-links"  component={PaymentLinksPage} />
      <Route path="/merchants"      component={MerchantsPage} />
      <Route path="/broadcast"         component={BroadcastPage} />
      <Route path="/admin-management"  component={AdminManagementPage} />
      <Route path="/pricing"           component={PricingPage} />
      <Route path="/corridors"         component={CorridorsPage} />
      <Route path="/international-transfers" component={InternationalTransfersPage} />
      <Route path="/travel-operators" component={TravelOperatorsPage} />
      <Route path="/travel-routes"    component={TravelRoutesPage} />
      <Route path="/support-chat"     component={SupportChatPage} />
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
