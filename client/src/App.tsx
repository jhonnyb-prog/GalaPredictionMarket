import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/navigation";
import { WalletConnection } from "@/components/wallet-connection";
import { Footer } from "@/components/footer";
import { UserProvider } from "@/contexts/UserContext";
import { RoleProvider } from "@/contexts/RoleContext";
import Home from "@/pages/home";
import MarketDetail from "@/pages/market-detail";
import Portfolio from "@/pages/portfolio";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { initGA } from "../lib/analytics";
import { useAnalytics } from "../hooks/use-analytics";

function Router() {
  // Track page views when routes change
  useAnalytics();
  
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/market/:id" component={MarketDetail} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Initialize Google Analytics when app loads
  useEffect(() => {
    // Verify required environment variable is present
    if (!import.meta.env.VITE_GA_MEASUREMENT_ID) {
      console.warn('Missing required Google Analytics key: VITE_GA_MEASUREMENT_ID');
    } else {
      initGA();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <RoleProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background text-foreground flex flex-col">
              <Navigation />
              <main className="flex-1">
                <Router />
              </main>
              <Footer />
              <WalletConnection />
            </div>
            <Toaster />
          </TooltipProvider>
        </RoleProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}

export default App;
