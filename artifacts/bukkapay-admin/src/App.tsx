import { Switch, Route, Router as WouterRouter } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

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
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
