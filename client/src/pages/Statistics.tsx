import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useT } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  CheckCircle, FileText, Clock, TrendingUp, BarChart3,
  ArrowLeft, Shield, Users, Award, Activity, Globe
} from "lucide-react";
import { RESEARCH_TYPE_LABELS } from "@shared/types";
import type { ResearchType } from "@shared/types";

export default function Statistics() {
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const { data: stats, isLoading } = trpc.publicStats.getStats.useQuery();

  const formatHours = (hours: number) => {
    if (!hours || hours === 0) return isAr ? "غير متاح" : "N/A";
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.round(hours / 24 * 10) / 10;
    return `${days} ${isAr ? "يوم" : "days"}`;
  };

  const approvalRate = stats && stats.totalApplications > 0
    ? Math.round((stats.totalApproved / stats.totalApplications) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">{isAr ? "إحصائيات المنصة" : "Platform Statistics"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "الرئيسية" : "Home"}
            </Button>
            <LanguageToggle />
          </div>
        </div>
      </nav>

      <div className="container py-8 max-w-6xl">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Globe className="h-4 w-4" />
            {isAr ? "شفافية ومساءلة" : "Transparency & Accountability"}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {isAr ? "إحصائيات المنصة العامة" : "Public Platform Statistics"}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {isAr
              ? "نؤمن بالشفافية الكاملة. فيما يلي بيانات مجمعة حول أداء منصة المراجعة الأخلاقية للأبحاث."
              : "We believe in full transparency. Below are aggregated metrics about the performance of the IRB Review Platform."}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats?.totalApproved || 0}</p>
                      <p className="text-sm text-muted-foreground">{isAr ? "موافقات IRB" : "IRBs Approved"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-200/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats?.totalApplications || 0}</p>
                      <p className="text-sm text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Applications"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-200/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <Clock className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{formatHours(stats?.avgProcessingHours || 0)}</p>
                      <p className="text-sm text-muted-foreground">{isAr ? "متوسط وقت المعالجة" : "Avg. Processing Time"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background border-purple-200/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{approvalRate}%</p>
                      <p className="text-sm text-muted-foreground">{isAr ? "معدل الموافقة" : "Approval Rate"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Research Type Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    {isAr ? "توزيع أنواع البحث" : "Research Type Distribution"}
                  </CardTitle>
                  <CardDescription>{isAr ? "تصنيف الطلبات حسب نوع البحث" : "Applications categorized by research type"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.researchTypes && stats.researchTypes.length > 0 ? (
                    <div className="space-y-3">
                      {stats.researchTypes.map((rt: any, i: number) => {
                        const total = stats.researchTypes.reduce((s: number, r: any) => s + Number(r.count), 0);
                        const pct = total > 0 ? Math.round((Number(rt.count) / total) * 100) : 0;
                        const label = RESEARCH_TYPE_LABELS[rt.type as ResearchType] || rt.type;
                        const colors = [
                          "bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-purple-500",
                          "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-orange-500", "bg-gray-500"
                        ];
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{label}</span>
                              <span className="text-sm text-muted-foreground">{rt.count} ({pct}%)</span>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${colors[i % colors.length]}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">{isAr ? "لا توجد بيانات بعد" : "No data available yet"}</p>
                  )}
                </CardContent>
              </Card>

              {/* Monthly Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    {isAr ? "الاتجاهات الشهرية" : "Monthly Trends"}
                  </CardTitle>
                  <CardDescription>{isAr ? "الطلبات والموافقات خلال الـ 12 شهرًا الماضية" : "Applications and approvals over the past 12 months"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.monthlyTrends && stats.monthlyTrends.length > 0 ? (
                    <div className="space-y-2">
                      {stats.monthlyTrends.map((m: any, i: number) => {
                        const maxTotal = Math.max(...stats.monthlyTrends.map((x: any) => Number(x.total)));
                        const totalPct = maxTotal > 0 ? Math.round((Number(m.total) / maxTotal) * 100) : 0;
                        const approvedPct = Number(m.total) > 0 ? Math.round((Number(m.approved) / Number(m.total)) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{m.month}</span>
                            <div className="flex-1 h-6 bg-muted/30 rounded overflow-hidden relative">
                              <div
                                className="h-full bg-blue-200 dark:bg-blue-900/50 rounded transition-all duration-500"
                                style={{ width: `${totalPct}%` }}
                              />
                              <div
                                className="h-full bg-emerald-500 rounded absolute top-0 left-0 transition-all duration-500"
                                style={{ width: `${totalPct * approvedPct / 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-20 text-end shrink-0">
                              {m.approved}/{m.total}
                            </span>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded bg-blue-200 dark:bg-blue-900/50" />
                          {isAr ? "إجمالي" : "Total"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded bg-emerald-500" />
                          {isAr ? "موافق عليه" : "Approved"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">{isAr ? "لا توجد بيانات بعد" : "No data available yet"}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Trust Section */}
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="py-8">
                <div className="text-center max-w-2xl mx-auto">
                  <Award className="h-10 w-10 text-primary mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">
                    {isAr ? "ملتزمون بالتميز الأخلاقي" : "Committed to Ethical Excellence"}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {isAr
                      ? "تعمل منصتنا وفقًا لإرشادات اللجنة الوطنية للأخلاقيات الحيوية في المملكة العربية السعودية (NBCE)، وإعلان هلسنكي، ومعايير ICH-GCP. كل طلب يخضع لمراجعة AI ومراجعة لجنة علمية."
                      : "Our platform operates under the guidelines of the National Bioethics Committee of Saudi Arabia (NBCE), the Declaration of Helsinki, and ICH-GCP standards. Every application undergoes AI pre-screening and scientific committee review."}
                  </p>
                  <div className="flex items-center justify-center gap-4 flex-wrap">
                    <Badge variant="outline" className="px-3 py-1">NBCE</Badge>
                    <Badge variant="outline" className="px-3 py-1">{isAr ? "إعلان هلسنكي" : "Helsinki Declaration"}</Badge>
                    <Badge variant="outline" className="px-3 py-1">ICH-GCP</Badge>
                    <Badge variant="outline" className="px-3 py-1">{isAr ? "رؤية 2030" : "Vision 2030"}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
