import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useT } from "@/contexts/LanguageContext";
import { Logo } from "@/components/design/Logo";
import {
  Activity, ArrowLeft, Globe, Loader2, Shield, Users, FileText, Clock, BarChart3, Bot,
} from "lucide-react";

function formatMs(ms: number): string {
  if (!ms || ms < 1000) return `${ms || 0} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export default function AdminObservability() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { lang } = useT();
  const isAr = lang === "ar";
  const isAdmin = isAuthenticated && user?.role === "admin";

  const { data: ownerCheck, isLoading: ownerLoading } = trpc.aiSwarm.amOwner.useQuery(undefined, {
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });
  const isOwner = ownerCheck?.isOwner === true;

  const { data, isLoading, error, refetch, isFetching } = trpc.analytics.metrics.useQuery(undefined, {
    enabled: isOwner,
    refetchInterval: 60_000,
  });
  const { data: aiStatus, refetch: refetchAi } = trpc.system.aiStatus.useQuery(undefined, {
    enabled: isOwner,
    staleTime: 30_000,
    retry: false,
  });

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <Shield className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{isAr ? "الوصول مرفوض" : "Access Denied"}</h2>
            <Button onClick={() => setLocation("/dashboard")}>{isAr ? "لوحة التحكم" : "Dashboard"}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <Shield className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{isAr ? "للمالك فقط" : "Owner only"}</h2>
            <p className="text-muted-foreground mb-4">
              {isAr
                ? "لوحة المراقبة متاحة لمالك المنصة فقط."
                : "Observability is restricted to the platform owner."}
            </p>
            <Button onClick={() => setLocation("/admin")}>{isAr ? "لوحة الإدارة" : "Admin panel"}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <Logo size={32} />
            <span className="font-display font-bold text-lg hidden sm:inline">
              {isAr ? "المراقبة" : "Observability"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? "تحديث" : "Refresh")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>
              <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "الإدارة" : "Admin"}
            </Button>
          </div>
        </div>
      </nav>

      <div className="container py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "لوحة مراقبة المنصة" : "Platform monitoring"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAr
              ? "زيارات، مواقع تقريبية، الوقت المستغرق، الحسابات، والطلبات — للمالك فقط."
              : "Visits, approximate locations, time on site, accounts, and applications — owner only."}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground mt-2">v2.0.0</p>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">
              {error.message}
            </CardContent>
          </Card>
        )}

        <Card className={aiStatus?.ok ? "border-emerald-500/40" : "border-amber-500/40"}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              {isAr ? "حالة الذكاء الاصطناعي" : "AI generation status"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "فحص مباشر لمزوّد النموذج (Stage 1/2، التحسين، السرب)"
                : "Live probe of the LLM provider (Stage 1/2, enhance, swarm)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!aiStatus ? (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {isAr ? "جارٍ الفحص…" : "Checking…"}
              </p>
            ) : (
              <>
                <p className={aiStatus.ok ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-amber-700 dark:text-amber-400 font-medium"}>
                  {aiStatus.ok
                    ? (isAr ? "يعمل — جاهز للتوليد" : "OK — generation ready")
                    : (isAr ? "غير متاح" : "Unavailable")}
                </p>
                <p className="font-mono text-[12px] text-muted-foreground">
                  {[aiStatus.provider, aiStatus.model, aiStatus.baseUrl].filter(Boolean).join(" · ") || "—"}
                </p>
                {"error" in aiStatus && aiStatus.error && (
                  <p className="text-destructive text-[13px]">{aiStatus.error}</p>
                )}
                {"sample" in aiStatus && aiStatus.sample && (
                  <p className="font-mono text-[11px] text-muted-foreground">sample: {aiStatus.sample}</p>
                )}
                {aiStatus.budget && (
                  <p className="text-muted-foreground text-[12px]">
                    {isAr ? "ميزانية اليوم:" : "Today's budget:"}{" "}
                    {aiStatus.budget.userUsed}/{aiStatus.budget.userLimit} (you) ·{" "}
                    {aiStatus.budget.globalUsed}/{aiStatus.budget.globalLimit} (global)
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => { void refetchAi(); }}
                >
                  {isAr ? "إعادة الفحص" : "Re-probe"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {isLoading || !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Activity} label={isAr ? "الجلسات" : "Sessions"} value={data.sessions} />
              <MetricCard icon={BarChart3} label={isAr ? "مشاهدات الصفحات" : "Pageviews"} value={data.pageviews} />
              <MetricCard icon={Clock} label={isAr ? "متوسط الوقت" : "Avg time on site"} value={formatMs(data.avgDwellMs)} />
              <MetricCard icon={Users} label={isAr ? "الحسابات" : "Accounts"} value={data.accountsTotal} />
              <MetricCard icon={Users} label={isAr ? "حسابات (24س)" : "Accounts (24h)"} value={data.accounts24h} />
              <MetricCard icon={Users} label={isAr ? "حسابات (7ي)" : "Accounts (7d)"} value={data.accounts7d} />
              <MetricCard icon={Users} label={isAr ? "نشطون (7ي)" : "Active (7d)"} value={data.activeUsers7d} />
              <MetricCard icon={FileText} label={isAr ? "الطلبات" : "Applications"} value={data.applicationsTotal} />
              <MetricCard icon={Bot} label={isAr ? "استدعاءات الذكاء (اليوم)" : "LLM calls (today)"} value={data.llmToday} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" /> {isAr ? "المواقع (تقريبي)" : "Locations (approx.)"}
                  </CardTitle>
                  <CardDescription>
                    {isAr ? "دولة الجلسة — بدون إحداثيات دقيقة" : "Session country — no precise coordinates"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SimpleTable
                    headers={[isAr ? "الدولة" : "Country", isAr ? "جلسات" : "Sessions"]}
                    rows={data.geo.map(g => [g.country, String(g.sessions)])}
                    empty={isAr ? "لا بيانات بعد" : "No data yet"}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "أكثر المسارات زيارة" : "Top paths"}</CardTitle>
                  <CardDescription>{isAr ? "آخر 30 يوماً" : "Last 30 days"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <SimpleTable
                    headers={[isAr ? "المسار" : "Path", isAr ? "مشاهدات" : "Views"]}
                    rows={data.topPaths.map(p => [p.path, String(p.count)])}
                    empty={isAr ? "لا بيانات بعد" : "No data yet"}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "الزيارات يومياً" : "Visits by day"}</CardTitle>
                  <CardDescription>{isAr ? "آخر 14 يوماً" : "Last 14 days"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <SimpleTable
                    headers={[isAr ? "اليوم" : "Day", isAr ? "جلسات" : "Sessions", isAr ? "مشاهدات" : "Views"]}
                    rows={data.visitsByDay.map(d => [d.day, String(d.sessions), String(d.pageviews)])}
                    empty={isAr ? "لا بيانات بعد" : "No data yet"}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "طلبات حسب الحالة" : "Applications by status"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <SimpleTable
                    headers={[isAr ? "الحالة" : "Status", isAr ? "العدد" : "Count"]}
                    rows={data.applicationsByStatus.map(s => [s.status, String(s.count)])}
                    empty={isAr ? "لا بيانات بعد" : "No data yet"}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-2">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            {headers.map(h => (
              <th key={h} className="py-2 pe-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pe-3 font-mono text-[12.5px]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
