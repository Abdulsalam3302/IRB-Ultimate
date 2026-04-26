import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";

// Lazy-loaded route pages — each becomes its own chunk so first paint
// only ships the home + framework. Pages load on navigation.
const Home = lazy(() => import("./pages/Home"));
const Policy = lazy(() => import("./pages/Policy"));
const VerifyIRB = lazy(() => import("./pages/VerifyIRB"));
const Resources = lazy(() => import("./pages/Resources"));
const Support = lazy(() => import("./pages/Support"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Declaration = lazy(() => import("./pages/Declaration"));
const ApplyStage1 = lazy(() => import("./pages/ApplyStage1"));
const ApplyStage2 = lazy(() => import("./pages/ApplyStage2"));
const SubmitApplication = lazy(() => import("./pages/SubmitApplication"));
const ApplicationDetail = lazy(() => import("./pages/ApplicationDetail"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ReviewDashboard = lazy(() => import("./pages/ReviewDashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Statistics = lazy(() => import("./pages/Statistics"));
const VersionHistory = lazy(() => import("./pages/VersionHistory"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
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
