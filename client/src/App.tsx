import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import Policy from "./pages/Policy";
import Dashboard from "./pages/Dashboard";
import ApplyStage1 from "./pages/ApplyStage1";
import ApplyStage2 from "./pages/ApplyStage2";
import SubmitApplication from "./pages/SubmitApplication";
import ApplicationDetail from "./pages/ApplicationDetail";
import AdminDashboard from "./pages/AdminDashboard";
import ReviewDashboard from "./pages/ReviewDashboard";
import VerifyIRB from "./pages/VerifyIRB";
import Declaration from "./pages/Declaration";
import Resources from "./pages/Resources";
import Support from "./pages/Support";
import Profile from "./pages/Profile";
import Statistics from "./pages/Statistics";
import VersionHistory from "./pages/VersionHistory";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/policy"} component={Policy} />
      <Route path={"/verify"} component={VerifyIRB} />
      <Route path={"/resources"} component={Resources} />
      <Route path={"/support"} component={Support} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/apply/:id/declaration"} component={Declaration} />
      <Route path={"/apply/:id/stage1"} component={ApplyStage1} />
      <Route path={"/apply/:id/stage2"} component={ApplyStage2} />
      <Route path={"/apply/:id/submit"} component={SubmitApplication} />
      <Route path={"/application/:id"} component={ApplicationDetail} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/reviews"} component={ReviewDashboard} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/statistics"} component={Statistics} />
      <Route path={"/application/:id/versions"} component={VersionHistory} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
