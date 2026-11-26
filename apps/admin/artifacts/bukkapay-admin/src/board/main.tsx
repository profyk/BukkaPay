import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Route, Switch, Redirect } from "wouter"
import "../index.css"
import { initTheme } from "../lib/theme"
import { getToken } from "./api"
import { AcceptPage, LoginPage, OwnerPage } from "./auth"
import Dashboard from "./dashboard"

initTheme()
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 60_000 } } })

function App() {
  return (
    <QueryClientProvider client={qc}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/accept" component={AcceptPage} />
        <Route path="/owner" component={OwnerPage} />
        <Route>{getToken() ? <Dashboard /> : <Redirect to="/login" />}</Route>
      </Switch>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
