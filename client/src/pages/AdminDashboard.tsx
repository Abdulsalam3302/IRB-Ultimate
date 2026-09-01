import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  Shield, ArrowLeft, Users, FileText, BarChart3, CheckCircle, XCircle,
  Clock, UserPlus, Trash2, Eye, Loader2, Award, Activity,
  TrendingUp, AlertTriangle, History, Download, Calendar, ArrowRight,
  Ban, EyeOff, RotateCcw, RefreshCw, Filter, MessageSquare, LogOut
} from "lucide-react";
import { Logo } from "@/components/design/Logo";
import { AiSwarmConsole } from "@/components/AiSwarmConsole";
import { STATUS_LABELS, STATUS_COLORS } from "@shared/types";
import type { ApplicationStatus } from "@shared/types";
import { Bot } from "lucide-react";

export default function AdminDashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const isAdmin = isAuthenticated && user?.role === "admin";
  // Owner-only AI Swarm console. The query is admin-gated client-side and
  // owner-verified server-side; non-owners simply never see the tab.
  const { data: ownerCheck } = trpc.aiSwarm.amOwner.useQuery(undefined, {
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });
  const isOwner = ownerCheck?.isOwner === true;

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="py-8 text-center">
          <Shield className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{isAr ? "الوصول مرفوض" : "Access Denied"}</h2>
          <p className="text-muted-foreground mb-4">{isAr ? "يتطلب صلاحية المسؤول." : "Admin access required."}</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setLocation("/dashboard")}>{isAr ? "الذهاب للوحة التحكم" : "Go to Dashboard"}</Button>
            {isAuthenticated && (
              <Button
                variant="outline"
                onClick={async () => { try { await logout(); } finally { window.location.href = "/"; } }}
              >
                <LogOut className="h-4 w-4 me-1" /> {t("nav.logout")}
              </Button>
            )}
          </div>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <Logo size={32} />
            <span className="font-display font-bold text-lg hidden sm:inline">{isAr ? "إدارة IRB" : "IRB Admin"}</span>
          </div>
          <div className="flex items-center gap-3">
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin/observability")}>
                <Activity className="h-4 w-4 me-1" /> {isAr ? "المراقبة" : "Observability"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "لوحة المستخدم" : "User Dashboard"}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <NotificationCenter />
            <LanguageToggle />
            <Button
              variant="ghost"
              size="sm"
              title={t("nav.logout")}
              onClick={async () => { try { await logout(); } finally { window.location.href = "/"; } }}
            >
              <LogOut className="h-3.5 w-3.5 me-1" /> {t("nav.logout")}
            </Button>
          </div>
        </div>
      </nav>

      <div className="container py-8">
        <h1 className="text-2xl font-bold mb-6">{isAr ? "لوحة الإدارة" : "Administration Panel"}</h1>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className={`grid w-full grid-cols-4 ${isOwner ? "sm:grid-cols-9" : "sm:grid-cols-8"} max-w-6xl`}>
            <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 me-1" /> {isAr ? "نظرة عامة" : "Overview"}</TabsTrigger>
            <TabsTrigger value="applications"><FileText className="h-4 w-4 me-1" /> {isAr ? "الطلبات" : "Applications"}</TabsTrigger>
            <TabsTrigger value="committee"><Users className="h-4 w-4 me-1" /> {isAr ? "اللجنة" : "Committee"}</TabsTrigger>
            <TabsTrigger value="safety"><AlertTriangle className="h-4 w-4 me-1" /> {isAr ? "السلامة" : "Safety"}</TabsTrigger>
            <TabsTrigger value="tickets"><MessageSquare className="h-4 w-4 me-1" /> {t("admin.tickets")}</TabsTrigger>
            <TabsTrigger value="reports"><Download className="h-4 w-4 me-1" /> {isAr ? "التقارير" : "Reports"}</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-4 w-4 me-1" /> {isAr ? "السجل" : "Audit"}</TabsTrigger>
            <TabsTrigger value="users"><Shield className="h-4 w-4 me-1" /> {isAr ? "المستخدمون" : "Users"}</TabsTrigger>
            {isOwner && (
              <TabsTrigger value="aiswarm"><Bot className="h-4 w-4 me-1" /> {isAr ? "سرب الذكاء" : "AI Swarm"}</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="applications"><ApplicationsTab /></TabsContent>
          <TabsContent value="committee"><CommitteeTab /></TabsContent>
          <TabsContent value="safety"><SafetyTab /></TabsContent>
          <TabsContent value="tickets"><SupportTicketsTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          {isOwner && <TabsContent value="aiswarm"><AiSwarmConsole /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}

// ─── Safety tab — NCBE adverse-event queue + amendment decisions ────────────
function SafetyTab() {
  const { lang } = useT();
  const isAr = lang === "ar";
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: aes, isLoading: aesLoading } = trpc.adverseEvents.all.useQuery();
  const { data: ams, isLoading: amsLoading } = trpc.amendments.all.useQuery();
  const [aeNotes, setAeNotes] = useState<Record<number, string>>({});
  const [amNotes, setAmNotes] = useState<Record<number, string>>({});

  const updateAe = trpc.adverseEvents.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم تحديث الحدث." : "Adverse event updated.");
      utils.adverseEvents.all.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const decideAm = trpc.amendments.adminDecide.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم تسجيل القرار." : "Decision recorded.");
      utils.amendments.all.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const severityBadge: Record<string, string> = {
    mild: "bg-emerald-100 text-emerald-700",
    moderate: "bg-yellow-100 text-yellow-700",
    serious: "bg-orange-100 text-orange-700",
    life_threatening: "bg-red-100 text-red-700",
    fatal: "bg-red-200 text-red-900",
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> {isAr ? "الأحداث السلبية" : "Adverse Events"}
          </CardTitle>
          <CardDescription>
            {isAr ? "جميع الأحداث السلبية المبلغ عنها عبر الدراسات النشطة." : "All adverse events reported across active studies."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !aes || aes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{isAr ? "لا توجد أحداث سلبية." : "No adverse events reported."}</p>
          ) : (
            <div className="space-y-4">
              {aes.map((ae: any) => (
                <div key={ae.id} className="p-4 rounded-lg border space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`text-xs capitalize ${severityBadge[ae.severity] || ""}`}>{String(ae.severity).replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{String(ae.status).replace(/_/g, " ")}</Badge>
                    <button className="text-xs text-primary hover:underline" onClick={() => setLocation(`/application/${ae.applicationId}`)}>
                      {isAr ? "طلب" : "Application"} #{ae.applicationId}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {isAr ? "حدث في" : "Occurred"}: {ae.occurredAt ? new Date(ae.occurredAt).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <p className="text-sm">{ae.description}</p>
                  {ae.actionTaken && <p className="text-xs text-muted-foreground">{isAr ? "الإجراء:" : "Action taken:"} {ae.actionTaken}</p>}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Input
                      className="text-sm"
                      placeholder={isAr ? "ملاحظات الإدارة..." : "Admin notes…"}
                      value={aeNotes[ae.id] ?? ae.adminNotes ?? ""}
                      onChange={(e) => setAeNotes(prev => ({ ...prev, [ae.id]: e.target.value }))}
                    />
                    <Select
                      value={ae.status}
                      onValueChange={(status) => updateAe.mutate({ id: ae.id, status: status as any, adminNotes: aeNotes[ae.id] ?? ae.adminNotes ?? undefined })}
                    >
                      <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["reported", "under_review", "acknowledged", "escalated", "closed"].map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" /> {isAr ? "تعديلات البروتوكول" : "Protocol Amendments"}
          </CardTitle>
          <CardDescription>
            {isAr ? "طلبات التعديل المقدمة على الدراسات — الموافقة أو الرفض." : "Amendment requests against studies — approve or reject."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {amsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !ams || ams.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{isAr ? "لا توجد تعديلات." : "No amendments submitted."}</p>
          ) : (
            <div className="space-y-4">
              {ams.map((am: any) => (
                <div key={am.id} className="p-4 rounded-lg border space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{am.type}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{String(am.status).replace(/_/g, " ")}</Badge>
                    <button className="text-xs text-primary hover:underline" onClick={() => setLocation(`/application/${am.applicationId}`)}>
                      {isAr ? "طلب" : "Application"} #{am.applicationId}
                    </button>
                    <span className="text-xs text-muted-foreground">{new Date(am.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm font-medium">{am.title}</p>
                  <p className="text-xs text-muted-foreground">{am.rationale}</p>
                  {["submitted", "under_review"].includes(am.status) && (
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Input
                        className="text-sm"
                        placeholder={isAr ? "ملاحظات القرار..." : "Decision notes…"}
                        value={amNotes[am.id] ?? ""}
                        onChange={(e) => setAmNotes(prev => ({ ...prev, [am.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={decideAm.isPending}
                          onClick={() => decideAm.mutate({ id: am.id, decision: "approved", adminNotes: amNotes[am.id] || undefined })}
                        >
                          <CheckCircle className="h-3.5 w-3.5 me-1" /> {isAr ? "موافقة" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={decideAm.isPending}
                          onClick={() => decideAm.mutate({ id: am.id, decision: "rejected", adminNotes: amNotes[am.id] || undefined })}
                        >
                          <XCircle className="h-3.5 w-3.5 me-1" /> {isAr ? "رفض" : "Reject"}
                        </Button>
                      </div>
                    </div>
                  )}
                  {am.adminNotes && <p className="text-xs text-blue-700">{isAr ? "ملاحظات:" : "Notes:"} {am.adminNotes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewTab() {
  const { data: stats } = trpc.admin.stats.useQuery();
  const { data: apps } = trpc.admin.allApplications.useQuery();
  const { data: members } = trpc.admin.allCommitteeMembers.useQuery();
  const { data: statusDist } = trpc.admin.statusDistribution.useQuery();
  const { data: typeDist } = trpc.admin.researchTypeDistribution.useQuery();
  const { lang } = useT();
  const isAr = lang === "ar";
  const [period, setPeriod] = useState<"day" | "week" | "month" | "quarter" | "year">("month");
  const { data: periodData } = trpc.admin.periodAnalytics.useQuery({ granularity: period });

  const pendingAdmin = apps?.filter((a: any) => a.status === "pending_admin") || [];
  const activeMembers = members?.filter((m: any) => m.isActive) || [];

  const chartData = useMemo(() => {
    if (!periodData || !Array.isArray(periodData) || periodData.length === 0) return null;
    const labels = periodData.map((m: any) => String(m.period ?? m.month ?? ""));
    const totals = periodData.map((m: any) => Number(m.total) || 0);
    const approved = periodData.map((m: any) => Number(m.approved) || 0);
    const rejected = periodData.map((m: any) => Number(m.rejected) || 0);
    const retracted = periodData.map((m: any) => Number(m.retracted) || 0);
    const chatbot = periodData.map((m: any) => Number(m.chatbot) || 0);
    const traditional = periodData.map((m: any) => Number(m.traditional) || 0);
    const avgHours = periodData.map((m: any) => m.avgReviewHours ? Math.round(Number(m.avgReviewHours)) : 0);
    const maxVal = Math.max(...totals, 1);
    return { months: labels, totals, approved, rejected, retracted, chatbot, traditional, avgHours, maxVal };
  }, [periodData]);

  // Status distribution for donut chart
  const statusChartData = useMemo(() => {
    if (!statusDist || !Array.isArray(statusDist)) return [];
    const colors: Record<string, string> = {
      approved: "#10b981", rejected: "#ef4444", permanently_rejected: "#991b1b",
      under_review: "#3b82f6", pending_admin: "#f59e0b", submitted: "#8b5cf6",
      draft: "#9ca3af", stage1_pending: "#06b6d4", stage2_pending: "#0891b2",
      stage1_failed: "#f97316", retracted: "#dc2626", hidden: "#6b7280",
      declaration_pending: "#a855f7", resubmission_required: "#eab308",
    };
    return statusDist.map((s: any) => ({
      status: s.status,
      count: Number(s.count),
      color: colors[s.status] || "#9ca3af",
      label: (STATUS_LABELS as any)[s.status] || String(s.status).replace(/_/g, " "),
    }));
  }, [statusDist, isAr]);

  const totalForDonut = statusChartData.reduce((sum, s) => sum + s.count, 0);

  // Research type distribution
  const typeChartData = useMemo(() => {
    if (!typeDist || !Array.isArray(typeDist)) return [];
    const typeColors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#f97316"];
    return typeDist.map((t: any, i: number) => ({
      type: (t.researchType || "unknown").replace(/_/g, " "),
      count: Number(t.count),
      color: typeColors[i % typeColors.length],
    }));
  }, [typeDist]);

  const totalForType = typeChartData.reduce((sum, t) => sum + t.count, 0);

  // Reviewer performance
  const reviewerData = useMemo(() => {
    if (!members) return [];
    return members
      .filter((m: any) => m.isActive && m.totalAssignments > 0)
      .map((m: any) => ({
        name: m.userName || "Unknown",
        assignments: m.totalAssignments,
        responses: m.totalResponses,
        approvals: m.totalApprovals,
        rejections: m.totalRejections,
        responseRate: m.totalAssignments > 0 ? Math.round((m.totalResponses / m.totalAssignments) * 100) : 0,
        avgHours: m.averageResponseTimeMs ? Math.round(m.averageResponseTimeMs / 3600000 * 10) / 10 : 0,
      }))
      .sort((a: any, b: any) => b.assignments - a.assignments);
  }, [members]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Applications"}</p>
                <p className="text-3xl font-bold">{stats?.total ?? "—"}</p>
              </div>
              <FileText className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? "تمت الموافقة" : "Approved"}</p>
                <p className="text-3xl font-bold text-emerald-600">{stats?.approved ?? "—"}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-500/5 rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? "قيد المراجعة" : "Pending Review"}</p>
                <p className="text-3xl font-bold text-yellow-600">{stats?.pending ?? "—"}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-bl-full" />
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isAr ? "أعضاء اللجنة" : "Committee Members"}</p>
                <p className="text-3xl font-bold">{activeMembers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{isAr ? "التقديمات" : "Submissions"}</p>
          <p className="text-2xl font-bold">{stats?.submissions ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{isAr ? "مسحوبات" : "Retractions"}</p>
          <p className="text-2xl font-bold text-red-700">{stats?.retracted ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{isAr ? "طلب عبر المحادثة" : "Chatbot apply"}</p>
          <p className="text-2xl font-bold text-violet-600">{stats?.chatbot ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{isAr ? "النموذج التقليدي" : "Traditional form"}</p>
          <p className="text-2xl font-bold">{stats?.traditional ?? "—"}</p>
        </CardContent></Card>
      </div>

      {/* Rate Cards */}
      {stats && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <TrendingUp className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-600">{stats.approved && stats.total ? Math.round((stats.approved / stats.total) * 100) : 0}%</p>
              <p className="text-xs text-muted-foreground">{isAr ? "معدل الموافقة" : "Approval Rate"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <XCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-red-500">{stats.rejected ?? 0}</p>
              <p className="text-xs text-muted-foreground">{isAr ? "مرفوض" : "Rejected"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Activity className="h-6 w-6 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-500">{stats.pending ?? 0}</p>
              <p className="text-xs text-muted-foreground">{isAr ? "قيد المعالجة" : "In Pipeline"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData && chartData.months.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {isAr ? "اتجاهات الطلبات" : "Application Trends"}
            </CardTitle>
            <CardDescription>{isAr ? "يومي / أسبوعي / شهري / ربع سنوي / سنوي" : "Daily, weekly, monthly, quarterly, or annual"}</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {([
                ["day", isAr ? "يومي" : "Daily"],
                ["week", isAr ? "أسبوعي" : "Weekly"],
                ["month", isAr ? "شهري" : "Monthly"],
                ["quarter", isAr ? "ربع سنوي" : "Quarterly"],
                ["year", isAr ? "سنوي" : "Annually"],
              ] as const).map(([key, label]) => (
                <Button key={key} size="sm" variant={period === key ? "default" : "outline"} onClick={() => setPeriod(key)}>
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/70 inline-block" /> {isAr ? "إجمالي" : "Total"}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> {isAr ? "موافق" : "Approved"}</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> {isAr ? "مرفوض" : "Rejected"}</span>
              </div>
              {/* Bar chart */}
              <div className="flex items-end gap-2 h-48 border-b border-l border-border pl-8 pb-6 relative">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-muted-foreground">
                  <span>{chartData.maxVal}</span>
                  <span>{Math.round(chartData.maxVal / 2)}</span>
                  <span>0</span>
                </div>
                {chartData.months.map((month, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end gap-[2px] h-36">
                      <div className="flex-1 bg-primary/70 rounded-t-sm transition-all duration-500" style={{ height: `${(chartData.totals[i] / chartData.maxVal) * 100}%`, minHeight: chartData.totals[i] > 0 ? '4px' : '0' }} title={`Total: ${chartData.totals[i]}`} />
                      <div className="flex-1 bg-emerald-500 rounded-t-sm transition-all duration-500" style={{ height: `${(chartData.approved[i] / chartData.maxVal) * 100}%`, minHeight: chartData.approved[i] > 0 ? '4px' : '0' }} title={`Approved: ${chartData.approved[i]}`} />
                      <div className="flex-1 bg-red-500 rounded-t-sm transition-all duration-500" style={{ height: `${(chartData.rejected[i] / chartData.maxVal) * 100}%`, minHeight: chartData.rejected[i] > 0 ? '4px' : '0' }} title={`Rejected: ${chartData.rejected[i]}`} />
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">{month}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column: Status Distribution + Research Type Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Status Distribution Donut */}
        {statusChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isAr ? "توزيع الحالات" : "Status Distribution"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {/* SVG Donut */}
                <div className="relative w-32 h-32 flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {(() => {
                      let cumulative = 0;
                      return statusChartData.map((s, i) => {
                        const pct = totalForDonut > 0 ? (s.count / totalForDonut) * 100 : 0;
                        const offset = cumulative;
                        cumulative += pct;
                        return (
                          <circle key={i} cx="18" cy="18" r="14" fill="none" stroke={s.color} strokeWidth="4"
                            strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={`${-offset}`}
                            className="transition-all duration-700" />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold">{totalForDonut}</span>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex-1 space-y-1 max-h-32 overflow-y-auto">
                  {statusChartData.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="truncate">{s.label}</span>
                      </span>
                      <span className="font-medium ml-2">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Research Type Distribution */}
        {typeChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isAr ? "أنواع البحث" : "Research Types"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {typeChartData.map((t, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize">{t.type}</span>
                      <span className="text-muted-foreground">{t.count} ({totalForType > 0 ? Math.round((t.count / totalForType) * 100) : 0}%)</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${totalForType > 0 ? (t.count / totalForType) * 100 : 0}%`, backgroundColor: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Average Review Time Chart */}
      {chartData && chartData.avgHours.some(h => h > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {isAr ? "متوسط وقت المراجعة (ساعات)" : "Average Review Time (Hours)"}
            </CardTitle>
            <CardDescription>{isAr ? "متوسط الوقت من التقديم إلى الموافقة" : "Average time from submission to approval per month"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32 border-b border-l border-border pl-8 pb-6 relative">
              {(() => {
                const maxH = Math.max(...chartData.avgHours, 1);
                return (
                  <>
                    <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-muted-foreground">
                      <span>{maxH}h</span>
                      <span>{Math.round(maxH / 2)}h</span>
                      <span>0</span>
                    </div>
                    {chartData.months.map((month, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex justify-center h-20">
                          <div className="w-3/4 bg-blue-500/70 rounded-t-sm transition-all duration-500 self-end" style={{ height: `${(chartData.avgHours[i] / maxH) * 100}%`, minHeight: chartData.avgHours[i] > 0 ? '4px' : '0' }} title={`${chartData.avgHours[i]}h`} />
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate w-full text-center">{month}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewer Performance Table */}
      {reviewerData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {isAr ? "أداء المراجعين" : "Reviewer Performance"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-start py-2 font-medium">{isAr ? "المراجع" : "Reviewer"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "المهام" : "Assigned"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "الردود" : "Responded"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "موافقة" : "Approved"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "رفض" : "Rejected"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "معدل الاستجابة" : "Response Rate"}</th>
                    <th className="text-center py-2 font-medium">{isAr ? "متوسط الوقت" : "Avg Time"}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewerData.map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 font-medium">{r.name}</td>
                      <td className="text-center py-2.5">{r.assignments}</td>
                      <td className="text-center py-2.5">{r.responses}</td>
                      <td className="text-center py-2.5 text-emerald-600">{r.approvals}</td>
                      <td className="text-center py-2.5 text-red-500">{r.rejections}</td>
                      <td className="text-center py-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${r.responseRate}%`, backgroundColor: r.responseRate >= 80 ? '#10b981' : r.responseRate >= 50 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-xs">{r.responseRate}%</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 text-muted-foreground">{r.avgHours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Admin Decisions */}
      {pendingAdmin.length > 0 && (
        <Card className="border-yellow-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-5 w-5" /> {isAr ? `في انتظار قرارك (${pendingAdmin.length})` : `Awaiting Your Decision (${pendingAdmin.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingAdmin.map((app: any) => (
                <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/30">
                  <div>
                    <p className="font-medium text-sm">{app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}</p>
                    <p className="text-xs text-muted-foreground">{app.applicantName} • {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US") : "—"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => window.location.href = `/application/${app.id}`}>
                    <Eye className="h-3 w-3 me-1" /> {isAr ? "مراجعة" : "Review"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ApplicationsTab() {
  const { data: apps, isLoading, refetch } = trpc.admin.allApplications.useQuery();
  const { data: members } = trpc.admin.allCommitteeMembers.useQuery();
  const [decisionNotes, setDecisionNotes] = useState("");
  const [assignMemberId, setAssignMemberId] = useState("");
  const [, setLocation] = useLocation();
  const { lang } = useT();
  const isAr = lang === "ar";

  const finalDecision = trpc.admin.finalDecision.useMutation({
    onSuccess: (data) => {
      if (data.irbNumber) {
        toast.success(isAr ? `تمت الموافقة! رقم IRB: ${data.irbNumber}` : `Approved! IRB Number: ${data.irbNumber}`);
      } else {
        toast.success(isAr ? "تم تسجيل القرار." : "Decision recorded.");
      }
      setDecisionNotes("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const directApproval = trpc.admin.directApproval.useMutation({
    onSuccess: (data) => {
      toast.success(isAr ? `تمت الموافقة المباشرة! رقم IRB: ${data.irbNumber}` : `Direct Approval! IRB Number: ${data.irbNumber}`);
      setDecisionNotes("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const manualAssign = trpc.admin.manualAssign.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم تعيين عضو اللجنة." : "Committee member assigned.");
      setAssignMemberId("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const retractApp = trpc.admin.retractApplication.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم سحب الموافقة." : "Application retracted."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const hideApp = trpc.admin.hideApplication.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم إخفاء الطلب." : "Application hidden."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteApp = trpc.admin.deleteApplication.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم حذف الطلب." : "Application deleted."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const expireReassign = trpc.admin.expireAndReassignReviews.useMutation({
    onSuccess: (data) => {
      toast.success(isAr ? `انتهت ${data.expired} مراجعة، أعيد تعيين ${data.reassigned}` : `Expired ${data.expired} reviews, reassigned ${data.reassigned}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [retractReason, setRetractReason] = useState("");
  const [hideReason, setHideReason] = useState("");

  const filteredApps = apps?.filter((a: any) => statusFilter === "all" || a.status === statusFilter) || [];

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">{isAr ? `جميع الطلبات (${filteredApps.length})` : `All Applications (${filteredApps.length})`}</h2>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Filter className="h-3 w-3 me-1" />
              <SelectValue placeholder={isAr ? "تصفية" : "Filter"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
              <SelectItem value="draft">{isAr ? "مسودة" : "Draft"}</SelectItem>
              <SelectItem value="under_review">{isAr ? "قيد المراجعة" : "Under Review"}</SelectItem>
              <SelectItem value="pending_admin">{isAr ? "بانتظار الإدارة" : "Pending Admin"}</SelectItem>
              <SelectItem value="approved">{isAr ? "معتمد" : "Approved"}</SelectItem>
              <SelectItem value="rejected">{isAr ? "مرفوض" : "Rejected"}</SelectItem>
              <SelectItem value="retracted">{isAr ? "مسحوب" : "Retracted"}</SelectItem>
              <SelectItem value="hidden">{isAr ? "مخفي" : "Hidden"}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => expireReassign.mutate()} disabled={expireReassign.isPending}>
            <RotateCcw className="h-3 w-3 me-1" /> {isAr ? "انتهاء وإعادة تعيين" : "Expire & Reassign"}
          </Button>
        </div>
      </div>

      {filteredApps.map((app: any) => (
        <Card key={app.id} className={`hover:shadow-sm transition-shadow ${(app.proceedDespiteStage1 || app.proceedDespiteStage2) ? 'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' : ''}`}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {(app.proceedDespiteStage1 || app.proceedDespiteStage2) && (
                    <Badge className="bg-red-600 text-white text-xs animate-pulse">
                      <AlertTriangle className="h-3 w-3 me-1" /> RED FLAG
                    </Badge>
                  )}
                  <span className="font-semibold text-sm">{app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}</span>
                  {app.irbNumber && <Badge variant="outline" className="font-mono text-xs">{app.irbNumber}</Badge>}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <Badge className={`text-xs ${STATUS_COLORS[app.status as ApplicationStatus] || ""}`}>
                    {STATUS_LABELS[app.status as ApplicationStatus] || app.status}
                  </Badge>
                  <span>{app.applicantName} ({app.applicantEmail})</span>
                  <span>•</span>
                  <span>{new Date(app.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                  {app.stage1AiScore !== null && (
                    <span className={`font-medium ${app.stage1AiScore >= 90 ? 'text-emerald-700' : app.stage1AiScore >= 70 ? 'text-emerald-600' : app.stage1AiScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      AI1: {app.stage1AiScore}
                    </span>
                  )}
                  {app.stage2AiScore !== null && (
                    <span className={`font-medium ${app.stage2AiScore >= 90 ? 'text-emerald-700' : app.stage2AiScore >= 70 ? 'text-emerald-600' : app.stage2AiScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      AI2: {app.stage2AiScore}
                    </span>
                  )}
                </div>
                {(app.proceedDespiteStage1 || app.proceedDespiteStage2) && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {app.proceedDespiteStage1 && <span className="me-3">⚠ Bypassed Stage 1 AI: "{app.proceedDespiteStage1Reason?.substring(0, 80)}..."</span>}
                    {app.proceedDespiteStage2 && <span>⚠ Bypassed Stage 2 AI: "{app.proceedDespiteStage2Reason?.substring(0, 80)}..."</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${app.id}`)}>
                  <Eye className="h-3 w-3" />
                </Button>

                {/* Direct Approval for any non-final application */}
                {app.status !== "approved" && app.status !== "permanently_rejected" && app.status !== "pending_admin" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                        <Award className="h-3 w-3 me-1" /> {isAr ? "موافقة مباشرة" : "Direct Approve"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{isAr ? "الموافقة المباشرة" : "Direct Approval"}: {app.researchTitle}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground">
                          {isAr
                            ? "سيتم الموافقة على هذا الطلب مباشرة وإصدار شهادة IRB فوراً، متجاوزاً مراجعة اللجنة."
                            : "This will directly approve the application and issue an IRB certificate immediately, bypassing committee review."}
                        </p>
                        <div className="space-y-2">
                          <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                          <Textarea
                            placeholder={isAr ? "سبب الموافقة المباشرة..." : "Reason for direct approval..."}
                            value={decisionNotes}
                            onChange={(e) => setDecisionNotes(e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => directApproval.mutate({
                            applicationId: app.id,
                            notes: decisionNotes,
                            // SA-10: typed-confirmation. The server requires
                            // this exact string so a CSRF auto-submit can't
                            // mint an IRB without knowing the target id.
                            confirm: `APPROVE-${app.id}`,
                          })}
                          disabled={directApproval.isPending}
                        >
                          {directApproval.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Award className="h-4 w-4 me-2" />}
                          {isAr ? "تأكيد الموافقة المباشرة" : "Confirm Direct Approval"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {app.status === "pending_admin" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm">{isAr ? "قرار" : "Decision"}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{isAr ? "القرار النهائي:" : "Final Decision:"} {app.researchTitle}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                          <Textarea
                            placeholder={isAr ? "أضف أي ملاحظات أو تعليقات..." : "Add any notes or feedback..."}
                            value={decisionNotes}
                            onChange={(e) => setDecisionNotes(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button
                            className="flex-1"
                            // SA-10 parity: server requires DECIDE-<id> so a
                            // CSRF auto-submit can't approve without the id.
                            onClick={() => finalDecision.mutate({ applicationId: app.id, decision: "approved", notes: decisionNotes, confirm: `DECIDE-${app.id}` })}
                            disabled={finalDecision.isPending}
                          >
                            <CheckCircle className="h-4 w-4 me-2" /> {isAr ? "موافقة" : "Approve"}
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => finalDecision.mutate({ applicationId: app.id, decision: "rejected", notes: decisionNotes, confirm: `DECIDE-${app.id}` })}
                            disabled={finalDecision.isPending}
                          >
                            <XCircle className="h-4 w-4 me-2" /> {isAr ? "رفض" : "Reject"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {(app.status === "under_review" || app.status === "submitted") && members && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline"><UserPlus className="h-3 w-3 me-1" /> {isAr ? "تعيين" : "Assign"}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{isAr ? "تعيين يدوي" : "Manual Assignment"}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <Select value={assignMemberId} onValueChange={setAssignMemberId}>
                          <SelectTrigger><SelectValue placeholder={isAr ? "اختر عضو" : "Select member"} /></SelectTrigger>
                          <SelectContent>
                            {members.filter((m: any) => m.isActive).map((m: any) => (
                              <SelectItem key={m.id} value={String(m.id)}>{m.userName} — {m.specialization || (isAr ? "عام" : "General")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          className="w-full"
                          onClick={() => manualAssign.mutate({ applicationId: app.id, committeeMemberId: parseInt(assignMemberId) })}
                          disabled={!assignMemberId || manualAssign.isPending}
                        >
                          {isAr ? "تعيين العضو" : "Assign Member"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Retract: only approved apps */}
                {app.status === "approved" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                        <Ban className="h-3 w-3 me-1" /> {isAr ? "سحب" : "Retract"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-red-600">{isAr ? "سحب الموافقة" : "Retract Approval"}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground">
                          {isAr ? "سيتم سحب موافقة IRB وإصدار شهادة سحب. هذا الإجراء لا يمكن التراجع عنه." : "This will retract the IRB approval and issue a retraction certificate. This action cannot be undone."}
                        </p>
                        <div className="space-y-2">
                          <Label>{isAr ? "سبب السحب *" : "Retraction Reason *"}</Label>
                          <Textarea
                            placeholder={isAr ? "اذكر سبب سحب الموافقة..." : "State the reason for retraction..."}
                            value={retractReason}
                            onChange={(e) => setRetractReason(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="destructive" className="w-full"
                          onClick={() => { retractApp.mutate({ applicationId: app.id, reason: retractReason }); setRetractReason(""); }}
                          disabled={!retractReason.trim() || retractApp.isPending}
                        >
                          {retractApp.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Ban className="h-4 w-4 me-2" />}
                          {isAr ? "تأكيد السحب" : "Confirm Retraction"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Hide: any non-hidden app */}
                {app.status !== "hidden" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-muted-foreground">
                        <EyeOff className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{isAr ? "إخفاء الطلب" : "Hide Application"}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <p className="text-sm text-muted-foreground">
                          {isAr ? "سيتم إخفاء هذا الطلب من نتائج التحقق العامة." : "This application will be hidden from public verification results."}
                        </p>
                        <div className="space-y-2">
                          <Label>{isAr ? "السبب (اختياري)" : "Reason (optional)"}</Label>
                          <Textarea value={hideReason} onChange={(e) => setHideReason(e.target.value)} />
                        </div>
                        <Button
                          className="w-full" variant="outline"
                          onClick={() => { hideApp.mutate({ applicationId: app.id, reason: hideReason }); setHideReason(""); }}
                          disabled={hideApp.isPending}
                        >
                          <EyeOff className="h-4 w-4 me-2" /> {isAr ? "إخفاء" : "Hide"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Delete: any app */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-destructive">{isAr ? "حذف الطلب" : "Delete Application"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <p className="text-sm text-muted-foreground">
                        {isAr ? "هل أنت متأكد من حذف هذا الطلب؟ سيتم إخفاؤه نهائياً." : "Are you sure you want to delete this application? It will be permanently hidden."}
                      </p>
                      <Button
                        variant="destructive" className="w-full"
                        onClick={() => deleteApp.mutate({ applicationId: app.id })}
                        disabled={deleteApp.isPending}
                      >
                        <Trash2 className="h-4 w-4 me-2" /> {isAr ? "تأكيد الحذف" : "Confirm Delete"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {(!apps || apps.length === 0) && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{isAr ? "لا توجد طلبات بعد." : "No applications yet."}</CardContent></Card>
      )}
    </div>
  );
}

function CommitteeTab() {
  const { data: members, isLoading, refetch } = trpc.admin.allCommitteeMembers.useQuery();
  const { data: allUsers } = trpc.admin.allUsers.useQuery();
  const [newMember, setNewMember] = useState({ userId: "", specialization: "", title: "", institution: "" });
  const { lang } = useT();
  const isAr = lang === "ar";

  const addMember = trpc.admin.addCommitteeMember.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم إضافة عضو اللجنة." : "Committee member added.");
      setNewMember({ userId: "", specialization: "", title: "", institution: "" });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMember = trpc.admin.removeCommitteeMember.useMutation({
    onSuccess: () => {
      toast.success(isAr ? "تم إلغاء تنشيط العضو." : "Member deactivated.");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const existingUserIds = new Set(members?.map((m: any) => m.userId) || []);
  const availableUsers = allUsers?.filter((u: any) => !existingUserIds.has(u.id)) || [];

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><UserPlus className="h-5 w-5" /> {isAr ? "إضافة عضو لجنة" : "Add Committee Member"}</CardTitle>
          <CardDescription>{isAr ? "اختر مستخدم مسجل لإضافته إلى لجنة IRB." : "Select a registered user to add to the IRB committee."}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>{isAr ? "المستخدم *" : "User *"}</Label>
              <Select value={newMember.userId} onValueChange={(v) => setNewMember({ ...newMember, userId: v })}>
                <SelectTrigger><SelectValue placeholder={isAr ? "اختر مستخدم" : "Select user"} /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email || `User #${u.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isAr ? "التخصص" : "Specialization"}</Label>
              <Input placeholder={isAr ? "مثال: أخلاقيات حيوية" : "e.g., Bioethics"} value={newMember.specialization} onChange={(e) => setNewMember({ ...newMember, specialization: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{isAr ? "اللقب" : "Title"}</Label>
              <Input placeholder={isAr ? "مثال: د.، أ.د." : "e.g., Dr., Prof."} value={newMember.title} onChange={(e) => setNewMember({ ...newMember, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{isAr ? "المؤسسة" : "Institution"}</Label>
              <Input placeholder={isAr ? "جامعة أو مستشفى" : "University or hospital"} value={newMember.institution} onChange={(e) => setNewMember({ ...newMember, institution: e.target.value })} />
            </div>
          </div>
          <Button
            onClick={() => addMember.mutate({
              userId: parseInt(newMember.userId),
              specialization: newMember.specialization || undefined,
              title: newMember.title || undefined,
              institution: newMember.institution || undefined,
            })}
            disabled={!newMember.userId || addMember.isPending}
          >
            <UserPlus className="h-4 w-4 me-2" /> {isAr ? "إضافة عضو" : "Add Member"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? `أعضاء اللجنة (${members?.length || 0})` : `Committee Members (${members?.length || 0})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {members?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{isAr ? "لا يوجد أعضاء لجنة بعد." : "No committee members yet."}</p>
          ) : (
            <div className="space-y-3">
              {members?.map((m: any) => (
                <div key={m.id} className={`flex items-center justify-between p-4 rounded-lg border ${m.isActive ? "" : "opacity-50"}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.title ? `${m.title} ` : ""}{m.userName || "Unknown"}</span>
                      {!m.isActive && <Badge variant="outline" className="text-xs">{isAr ? "غير نشط" : "Inactive"}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      {m.specialization && <span>{m.specialization}</span>}
                      {m.institution && <span>{m.institution}</span>}
                      <span>{m.userEmail}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{isAr ? "معين:" : "Assigned:"} <strong>{m.totalAssignments}</strong></span>
                      <span>{isAr ? "استجاب:" : "Responded:"} <strong>{m.totalResponses}</strong></span>
                      <span>{isAr ? "وافق:" : "Approved:"} <strong className="text-emerald-600">{m.totalApprovals}</strong></span>
                      <span>{isAr ? "رفض:" : "Rejected:"} <strong className="text-red-600">{m.totalRejections}</strong></span>
                      {m.averageResponseTimeMs > 0 && (
                        <span>{isAr ? "متوسط الاستجابة:" : "Avg Response:"} <strong>{Math.round(m.averageResponseTimeMs / 3600000)}h</strong></span>
                      )}
                    </div>
                  </div>
                  {m.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeMember.mutate({ id: m.id })}
                      disabled={removeMember.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTab() {
  const { data: stats } = trpc.admin.stats.useQuery();
  const { data: apps } = trpc.admin.allApplications.useQuery();
  const { data: members } = trpc.admin.allCommitteeMembers.useQuery();
  const { lang } = useT();
  const isAr = lang === "ar";

  // RFC 4180 CSV escaping. Without this, a research title that contains a
  // comma, double-quote, or newline corrupts the row alignment and the
  // spreadsheet shifts every column to the right.
  const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (s.length === 0) return "";
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvRow = (...cells: unknown[]): string => cells.map(csvEscape).join(",") + "\n";
  // UTF-8 BOM helps Excel recognise the encoding for non-ASCII titles.
  const CSV_BOM = "﻿";

  const generateCSV = (type: "applications" | "committee" | "summary") => {
    let csv = CSV_BOM;
    const now = new Date().toISOString().split("T")[0];

    if (type === "applications" && apps) {
      csv += csvRow("ID","Title","Status","Applicant","Email","Research Type","IRB Number","AI Score 1","AI Score 2","Created","Submitted","Approved");
      apps.forEach((a: any) => {
        csv += csvRow(
          a.id, a.researchTitle, a.status, a.applicantName, a.applicantEmail,
          a.researchType, a.irbNumber, a.stage1AiScore ?? "", a.stage2AiScore ?? "",
          a.createdAt, a.submittedAt, a.approvedAt
        );
      });
    } else if (type === "committee" && members) {
      csv += csvRow("ID","Name","Email","Specialization","Institution","Assignments","Responses","Approvals","Rejections","Avg Response (hrs)","Active");
      members.forEach((m: any) => {
        csv += csvRow(
          m.id, m.userName, m.userEmail, m.specialization, m.institution,
          m.totalAssignments, m.totalResponses, m.totalApprovals, m.totalRejections,
          m.averageResponseTimeMs ? Math.round(m.averageResponseTimeMs / 3600000) : 0,
          m.isActive
        );
      });
    } else if (type === "summary" && stats) {
      csv += csvRow("Metric","Value");
      csv += csvRow("Total Applications", stats.total);
      csv += csvRow("Approved", stats.approved);
      csv += csvRow("Rejected", stats.rejected);
      csv += csvRow("Pending", stats.pending);
      csv += csvRow("Approval Rate", `${stats.total ? Math.round((stats.approved / stats.total) * 100) : 0}%`);
      csv += csvRow("Report Date", now);
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `irb-${type}-report-${now}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(isAr ? "تم تنزيل التقرير" : "Report downloaded");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {isAr ? "تصدير التقارير" : "Export Reports"}
          </CardTitle>
          <CardDescription>{isAr ? "قم بتنزيل تقارير مفصلة بتنسيق CSV للتحليل." : "Download detailed reports in CSV format for analysis."}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => generateCSV("summary")}>
              <CardContent className="py-6 text-center">
                <BarChart3 className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold mb-1">{isAr ? "تقرير ملخص" : "Summary Report"}</h3>
                <p className="text-xs text-muted-foreground mb-3">{isAr ? "إحصائيات عامة ومعدلات" : "Overall statistics and rates"}</p>
                <Button size="sm" variant="outline">
                  <Download className="h-3 w-3 me-1" /> CSV
                </Button>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => generateCSV("applications")}>
              <CardContent className="py-6 text-center">
                <FileText className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">{isAr ? "تقرير الطلبات" : "Applications Report"}</h3>
                <p className="text-xs text-muted-foreground mb-3">{isAr ? "جميع الطلبات مع التفاصيل" : "All applications with details"}</p>
                <Button size="sm" variant="outline">
                  <Download className="h-3 w-3 me-1" /> CSV
                </Button>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => generateCSV("committee")}>
              <CardContent className="py-6 text-center">
                <Users className="h-8 w-8 text-purple-600 mx-auto mb-3" />
                <h3 className="font-semibold mb-1">{isAr ? "تقرير اللجنة" : "Committee Report"}</h3>
                <p className="text-xs text-muted-foreground mb-3">{isAr ? "أداء أعضاء اللجنة" : "Committee member performance"}</p>
                <Button size="sm" variant="outline">
                  <Download className="h-3 w-3 me-1" /> CSV
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Summary */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? "ملخص الأداء" : "Performance Summary"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{stats.total}</p>
                <p className="text-sm text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Applications"}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-600">{stats.total ? Math.round((stats.approved / stats.total) * 100) : 0}%</p>
                <p className="text-sm text-muted-foreground">{isAr ? "معدل الموافقة" : "Approval Rate"}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{members?.filter((m: any) => m.isActive).length || 0}</p>
                <p className="text-sm text-muted-foreground">{isAr ? "أعضاء نشطون" : "Active Members"}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">{isAr ? "قيد المعالجة" : "In Pipeline"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditTab() {
  const { data: logs, isLoading } = trpc.admin.auditLog.useQuery();
  const { lang } = useT();
  const isAr = lang === "ar";

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{isAr ? "سجل التدقيق" : "Audit Log"}</CardTitle>
        <CardDescription>{isAr ? "النشاط الأخير في النظام والقرارات" : "Recent system activity and decisions"}</CardDescription>
      </CardHeader>
      <CardContent>
        {!logs?.length ? (
          <p className="text-center text-muted-foreground py-8">{isAr ? "لا توجد سجلات بعد." : "No audit entries yet."}</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs font-mono">{log.action}</Badge>
                    {log.applicationId && <span className="text-xs text-muted-foreground">{isAr ? "طلب" : "App"} #{log.applicationId}</span>}
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
                  </div>
                  {log.details && <p className="text-xs text-muted-foreground mt-1">{log.details}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsersTab() {
  const { data: allUsers, isLoading, refetch } = trpc.admin.allUsers.useQuery();
  const { data: ownerCheck } = trpc.aiSwarm.amOwner.useQuery(undefined, { staleTime: 5 * 60_000 });
  const isOwner = ownerCheck?.isOwner === true;
  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Role updated successfully"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const purgeTest = trpc.admin.purgeTestAccounts.useMutation({
    onSuccess: (r: any) => { toast.success(`Removed ${r.users} test account(s) and ${r.applications} application(s).`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [search, setSearch] = useState("");
  const { lang } = useT();
  const isAr = lang === "ar";

  // Export the current user list to a real .xlsx (SpreadsheetML) the user can
  // open in Excel. Reflects any active search filter.
  const exportUsersExcel = () => {
    const rows = filteredUsers as any[];
    const headers = ["ID", "Name", "Email", "Role", "Login Method", "Joined", "Last Login"];
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const cell = (v: unknown) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
    const row = (cells: unknown[]) => `<Row>${cells.map(cell).join("")}</Row>`;
    const body = rows.map(u => row([
      u.id,
      u.name || "",
      u.email || "",
      u.isOwner ? "Owner" : u.role === "admin" ? "Admin" : "User",
      u.loginMethod || "",
      u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "",
      u.lastSignedIn ? new Date(u.lastSignedIn).toISOString().replace("T", " ").slice(0, 19) : "",
    ])).join("");
    const xml =
      `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Worksheet ss:Name="Users"><Table>${row(headers)}${body}</Table></Worksheet></Workbook>`;
    const blob = new Blob(["﻿", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `irb-users-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    if (!search.trim()) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter((u: any) =>
      (u.name?.toLowerCase().includes(q)) ||
      (u.email?.toLowerCase().includes(q)) ||
      (u.role?.toLowerCase().includes(q))
    );
  }, [allUsers, search]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="text-lg">{isAr ? "إدارة المستخدمين" : "User Management"}</CardTitle>
            <CardDescription>{isAr ? `${allUsers?.length || 0} مستخدم مسجل` : `${allUsers?.length || 0} registered users`}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder={isAr ? "بحث بالاسم أو البريد..." : "Search by name or email..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={exportUsersExcel} disabled={!filteredUsers.length}>
              <Download className="h-4 w-4 me-1" />
              {isAr ? "تصدير Excel" : "Export Excel"}
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                onClick={() => {
                  if (confirm(isAr ? "حذف جميع حسابات الاختبار (@example.com) وبياناتها نهائيًا؟" : "Permanently delete all test accounts (@example.com) and their data?")) {
                    purgeTest.mutate();
                  }
                }}
                disabled={purgeTest.isPending}
              >
                {purgeTest.isPending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Trash2 className="h-4 w-4 me-1" />}
                {isAr ? "حذف حسابات الاختبار" : "Purge test accounts"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">{isAr ? "المعرف" : "ID"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "الاسم" : "Name"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "البريد الإلكتروني" : "Email"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "الدور" : "Role"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "تاريخ التسجيل" : "Joined"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "آخر دخول" : "Last Login"}</th>
                <th className="text-start p-3 font-medium">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u: any) => (
                <tr key={u.id} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-mono text-xs">{u.id}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {(u.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{u.name || "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{u.email || "—"}</td>
                  <td className="p-3">
                    <Badge
                      variant={u.isOwner ? "default" : u.role === "admin" ? "default" : "secondary"}
                      className={`text-xs ${u.isOwner ? "bg-forest-900 hover:bg-forest-900" : ""}`}
                    >
                      {u.isOwner ? (isAr ? "المالك" : "Owner") : u.role === "admin" ? (isAr ? "مسؤول" : "Admin") : (isAr ? "مستخدم" : "User")}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(u.lastSignedIn).toLocaleString(isAr ? "ar-SA" : "en-US")}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {/* Promote/demote is OWNER-ONLY and never applies to the
                          owner row itself. Admins see no role controls. */}
                      {!isOwner || u.isOwner ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : u.role === "user" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            if (confirm(isAr ? `ترقية ${u.name || u.email} إلى مسؤول؟` : `Promote ${u.name || u.email} to admin?`)) {
                              updateRole.mutate({ userId: u.id, role: "admin" });
                            }
                          }}
                          disabled={updateRole.isPending}
                        >
                          <ArrowRight className="h-3 w-3 me-1" />
                          {isAr ? "ترقية" : "Promote"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-destructive border-destructive/30"
                          onClick={() => {
                            if (confirm(isAr ? `تخفيض ${u.name || u.email} إلى مستخدم عادي؟` : `Demote ${u.name || u.email} to regular user?`)) {
                              updateRole.mutate({ userId: u.id, role: "user" });
                            }
                          }}
                          disabled={updateRole.isPending}
                        >
                          <ArrowLeft className="h-3 w-3 me-1" />
                          {isAr ? "تخفيض" : "Demote"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {search ? (isAr ? "لا توجد نتائج للبحث." : "No users match your search.") : (isAr ? "لا يوجد مستخدمون بعد." : "No users yet.")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SupportTicketsTab() {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const { data: tickets, isLoading, refetch } = trpc.admin.supportTickets.useQuery();
  const updateStatus = trpc.support.updateStatus.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم تحديث التذكرة" : "Ticket updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const statusColor: Record<string, string> = {
    open: "bg-amber-100 text-amber-800",
    in_progress: "bg-blue-100 text-blue-800",
    resolved: "bg-emerald-100 text-emerald-800",
    closed: "bg-gray-100 text-gray-700",
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const list = tickets ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> {t("admin.tickets")}
        </CardTitle>
        <CardDescription>
          {isAr ? "تذاكر الدعم المقدمة من المستخدمين عبر صفحة الدعم." : "Support tickets submitted via the Support page."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">{isAr ? "لا توجد تذاكر بعد." : "No support tickets yet."}</p>
        ) : (
          <div className="space-y-4">
            {list.map((ticket: any) => (
              <div key={ticket.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{ticket.subject}</div>
                    <div className="text-sm text-muted-foreground">
                      {ticket.name} · {ticket.email} · {ticket.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor[ticket.status] || ""}>{ticket.status.replace(/_/g, " ")}</Badge>
                    <Select
                      value={ticket.status}
                      onValueChange={(v) => updateStatus.mutate({ id: ticket.id, status: v as any })}
                    >
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">{isAr ? "مفتوحة" : "Open"}</SelectItem>
                        <SelectItem value="in_progress">{isAr ? "قيد المعالجة" : "In progress"}</SelectItem>
                        <SelectItem value="resolved">{isAr ? "محلولة" : "Resolved"}</SelectItem>
                        <SelectItem value="closed">{isAr ? "مغلقة" : "Closed"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
                <div className="text-xs text-muted-foreground">
                  #{ticket.id} · {new Date(ticket.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US")}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
