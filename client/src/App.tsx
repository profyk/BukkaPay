import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { getCurrentUser } from "./lib/auth";
import Home from "@/pages/home";
import Wallet from "@/pages/wallet";
import ScanPay from "@/pages/scan-pay";
import QRPay from "@/pages/qr-pay";
import Transfer from "@/pages/transfer";
import Request from "@/pages/request";
import Pay from "@/pages/pay";
import TapPay from "@/pages/tap-pay";
import TopUp from "@/pages/topup";
import Buy from "@/pages/buy";
import Loyalty from "@/pages/loyalty";
import Analytics from "@/pages/analytics";
import Referral from "@/pages/referral";
import Gamification from "@/pages/gamification";
import SupportChat from "@/pages/support-chat";
import FeaturesHub from "@/pages/features-hub";
import Stokvel from "@/pages/stokvel";
import Profile from "@/pages/profile";
import Notifications from "@/pages/notifications";
import Search from "@/pages/search";
import MyID from "@/pages/my-id";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import NotFound from "@/pages/not-found";

function Router({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/pay/:id" component={Pay} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/scan-pay" component={ScanPay} />
      <Route path="/qr-pay" component={QRPay} />
      <Route path="/transfer" component={Transfer} />
      <Route path="/request" component={Request} />
      <Route path="/pay/:id" component={Pay} />
      <Route path="/tap-pay" component={TapPay} />
      <Route path="/topup" component={TopUp} />
      <Route path="/buy" component={Buy} />
      <Route path="/loyalty" component={Loyalty} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/referral" component={Referral} />
      <Route path="/gamification" component={Gamification} />
      <Route path="/support-chat" component={SupportChat} />
      <Route path="/features" component={FeaturesHub} />
      <Route path="/stokvel" component={Stokvel} />
      <Route path="/profile" component={Profile} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/search" component={Search} />
      <Route path="/my-id" component={MyID} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const user = getCurrentUser();
      setIsAuthenticated(!!user);
      setIsLoading(false);
    };

    checkAuth();

    window.addEventListener("authStateChanged", checkAuth);
    return () => window.removeEventListener("authStateChanged", checkAuth);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="max-w-md mx-auto bg-background min-h-screen shadow-2xl border-x border-border relative overflow-hidden">
        <Router isAuthenticated={isAuthenticated} />
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;
