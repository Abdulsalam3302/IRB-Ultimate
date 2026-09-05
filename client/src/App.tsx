import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AnalyticsBeacon } from "./components/AnalyticsBeacon";
import { DemoBanner } from "./components/DemoBanner";
import { RouteMetadata } from "./components/RouteMetadata";
import { WebMcpProvider } from "./components/WebMcpProvider";

// Lazy-loaded route pages — each becomes its own chunk so first paint
// only ships the home + framework. Pages load on navigation.
const Home = lazy(() => import("./pages/Home"));
const Policy = lazy(() => import("./pages/Policy"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
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
const AdminObservability = lazy(() => import("./pages/AdminObservability"));
const ReviewDashboard = lazy(() => import("./pages/ReviewDashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Statistics = lazy(() => import("./pages/Statistics"));
const VersionHistory = lazy(() => import("./pages/VersionHistory"));
const Registry = lazy(() => import("./pages/Registry"));
const GuidelineDoc = lazy(() => import("./pages/GuidelineDoc"));
const FormatWizard = lazy(() => import("./pages/FormatWizard"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ChatApplication = lazy(() => import("./pages/ChatApplication"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Loading / جارٍ التحميل</span></div>
    </div>
  );
}

function Router() {
  return (
    <>
      <RouteMetadata />
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/policy"} component={Policy} />
          <Route path={"/disclaimer"} component={Disclaimer} />
          <Route path={"/verify"} component={VerifyIRB} />
          {/* QR codes on certificates deep-link to /verify/<irb-number> */}
          <Route path={"/verify/:irbNumber"} component={VerifyIRB} />
          <Route path={"/resources"} component={Resources} />
          <Route path={"/support"} component={Support} />
          <Route path={"/dashboard"} component={Dashboard} />
          <Route path={"/chat-apply"} component={ChatApplication} />
          <Route path={"/apply/:id/declaration"} component={Declaration} />
          <Route path={"/apply/:id/stage1"} component={ApplyStage1} />
          <Route path={"/apply/:id/stage2"} component={ApplyStage2} />
          <Route path={"/apply/:id/submit"} component={SubmitApplication} />
          <Route path={"/application/:id"} component={ApplicationDetail} />
          <Route path={"/admin"} component={AdminDashboard} />
          <Route path={"/admin/observability"} component={AdminObservability} />
          <Route path={"/reviews"} component={ReviewDashboard} />
          <Route path={"/profile"} component={Profile} />
          <Route path={"/statistics"} component={Statistics} />
          <Route path={"/registry"} component={Registry} />
          <Route path={"/resources/guideline/:slug"} component={GuidelineDoc} />
          <Route path={"/format/:slug"} component={FormatWizard} />
          <Route path={"/application/:id/versions"} component={VersionHistory} />
          <Route path={"/auth"} component={Auth} />
          <Route path={"/auth/callback"} component={AuthCallback} />
          <Route path={"/sign-in"} component={Auth} />
          <Route path={"/login"} component={Auth} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      <AnalyticsBeacon />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <LanguageProvider>
          <TooltipProvider>
            <DemoBanner />
            <Toaster />
            <WebMcpProvider>
              <Router />
            </WebMcpProvider>
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
