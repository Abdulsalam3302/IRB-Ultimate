import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useT } from "@/contexts/LanguageContext";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/design/Logo";
import {
  Plus, FileText, Clock, CheckCircle, XCircle, ArrowRight,
  Shield, AlertTriangle, Eye, Download, Brain,
  Users, Award, Loader2, Search, BookOpen,
  MessageSquare, RefreshCw, ArrowLeft, User, LogOut, Sparkles
} from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, RESEARCH_TYPE_LABELS } from "@shared/types";
import type { ApplicationStatus, ResearchType } from "@shared/types";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";

  const { data: applications, isLoading: appsLoading, refetch } = trpc.application.myApplications.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 30000 }
  );

  const createApp = trpc.application.create.useMutation({
    onSuccess: (data) => {
      setLocation(`/apply/${data.id}/declaration`);
    },
  });

  // Search + status filter — live, client-side. Cheap because the
  // applicant rarely has more than ~50 applications. Filter chips
  // below let users narrow by lifecycle bucket without scanning.
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBucket, setFilterBucket] = useState<"all" | "active" | "approved" | "drafts" | "rejected" | "retracted">("all");

  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    const q = searchQuery.trim().toLowerCase();
    return applications.filter(a => {
      // bucket filter
      if (filterBucket === "active" && !["under_review", "pending_admin", "submitted"].includes(a.status)) return false;
      if (filterBucket === "approved" && a.status !== "approved") return false;
      if (filterBucket === "drafts" && !["draft", "declaration_pending", "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed"].includes(a.status)) return false;
      if (filterBucket === "rejected" && !["rejected", "permanently_rejected"].includes(a.status)) return false;
      if (filterBucket === "retracted" && a.status !== "retracted") return false;
      // search
      if (!q) return true;
      const haystack = [
        a.researchTitle, a.principalInvestigator, a.piInstitution, a.piDepartment,
        a.irbNumber, a.researchType, String(a.id),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [applications, searchQuery, filterBucket]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center">
            <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{isAr ? "يرجى تسجيل الدخول" : "Sign In Required"}</h2>
            <p className="text-muted-foreground mb-6">{isAr ? "يرجى تسجيل الدخول للوصول إلى لوحة التحكم." : "Please sign in to access your dashboard."}</p>
            <Button onClick={() => { window.location.href = getLoginUrl(); }}>{t("common.signIn")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved": return <CheckCircle className="h-5 w-5 text-emerald-600" />;
      case "rejected":
      case "permanently_rejected": return <XCircle className="h-5 w-5 text-red-600" />;
      case "under_review":
      case "pending_admin": return <Clock className="h-5 w-5 text-yellow-600" />;
      case "submitted": return <ArrowRight className="h-5 w-5 text-indigo-600" />;
      default: return <FileText className="h-5 w-5 text-blue-600" />;
    }
  };

  const getStatusProgress = (status: string): number => {
    const map: Record<string, number> = {
      draft: 5, declaration_pending: 10, stage1_pending: 20, stage1_failed: 15,
      stage2_pending: 40, stage2_failed: 35, submitted: 55,
      under_review: 70, pending_admin: 85, approved: 100,
      rejected: 50, resubmission_required: 30, permanently_rejected: 100,
    };
    return map[status] || 0;
  };

  const getPhaseLabel = (status: string): string => {
    if (isAr) {
      const map: Record<string, string> = {
        draft: "المسودة - الإقرار",
        declaration_pending: "مرحلة الإقرار",
        stage1_pending: "مراجعة AI - المرحلة 1",
        stage1_failed: "فشل المرحلة 1 - يحتاج مراجعة",
        stage2_pending: "مراجعة AI - المرحلة 2",
        stage2_failed: "فشل المرحلة 2 - يحتاج مراجعة",
        submitted: "جاهز للتقديم",
        under_review: "مراجعة اللجنة",
        pending_admin: "الموافقة النهائية",
        approved: "تمت الموافقة",
        rejected: "مرفوض - يمكن إعادة التقديم",
        resubmission_required: "يتطلب إعادة التقديم",
        permanently_rejected: "مرفوض نهائياً",
      };
      return map[status] || status;
    }
    const map: Record<string, string> = {
      draft: "Draft - Declaration",
      declaration_pending: "Declaration Phase",
      stage1_pending: "AI Review - Stage 1",
      stage1_failed: "Stage 1 Failed - Needs Revision",
      stage2_pending: "AI Review - Stage 2",
      stage2_failed: "Stage 2 Failed - Needs Revision",
      submitted: "Ready for Submission",
      under_review: "Committee Review",
      pending_admin: "Final Admin Approval",
      approved: "Approved & Certified",
      rejected: "Rejected - Can Resubmit",
      resubmission_required: "Resubmission Required",
      permanently_rejected: "Permanently Rejected",
    };
    return map[status] || status;
  };

  const getActionButton = (app: any) => {
    switch (app.status) {
      case "draft":
        return (
          <Button size="sm" onClick={() => setLocation(`/apply/${app.id}/declaration`)}>
            {isAr ? "بدء الإقرار" : "Start Declaration"} <ArrowRight className="h-3 w-3 ms-1" />
          </Button>
        );
      case "declaration_pending":
        return (
          <Button size="sm" onClick={() => setLocation(`/apply/${app.id}/stage1`)}>
            {isAr ? "متابعة المرحلة 1" : "Continue Stage 1"} <ArrowRight className="h-3 w-3 ms-1" />
          </Button>
        );
      case "stage1_failed":
        return (
          <Button size="sm" onClick={() => setLocation(`/apply/${app.id}/stage1`)}>
            {isAr ? "متابعة المرحلة 1" : "Continue Stage 1"} <ArrowRight className="h-3 w-3 ms-1" />
          </Button>
        );
      case "stage2_pending":
      case "stage2_failed":
        return (
          <Button size="sm" onClick={() => setLocation(`/apply/${app.id}/stage2`)}>
            {isAr ? "متابعة المرحلة 2" : "Continue Stage 2"} <ArrowRight className="h-3 w-3 ms-1" />
          </Button>
        );
      case "submitted":
        return (
          <Button size="sm" onClick={() => setLocation(`/apply/${app.id}/submit`)}>
            {isAr ? "تقديم للمراجعة" : "Submit for Review"} <ArrowRight className="h-3 w-3 ms-1" />
          </Button>
        );
      case "rejected":
      case "resubmission_required":
        return (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/export/certificate/${app.id}`, "_blank")}>
              <Download className="h-3 w-3 me-1" /> {isAr ? "شهادة الرفض" : "Rejection certificate"}
            </Button>
            {app.submissionCount < 2 ? (
              <Button size="sm" variant="outline" onClick={() => setLocation(`/apply/${app.id}/stage1`)}>
                <AlertTriangle className="h-3 w-3 me-1" /> {isAr ? "إعادة التقديم" : "Resubmit"}
              </Button>
            ) : null}
          </div>
        );
      case "permanently_rejected":
      case "retracted":
        return (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/export/certificate/${app.id}`, "_blank")}>
              <Download className="h-3 w-3 me-1" /> {isAr ? "الشهادة" : "Certificate"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${app.id}`)}>
              <Eye className="h-3 w-3 me-1" /> {isAr ? "عرض" : "View"}
            </Button>
          </div>
        );
      case "approved":
        return (
          <div className="flex gap-2">
            {app.certificateUrl && (
              <Button size="sm" variant="outline" onClick={() => window.open(app.certificateUrl, "_blank")}>
                <Download className="h-3 w-3 me-1" /> {isAr ? "الشهادة" : "Certificate"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${app.id}`)}>
              <Eye className="h-3 w-3 me-1" /> {isAr ? "عرض" : "View"}
            </Button>
          </div>
        );
      default:
        return (
          <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${app.id}`)}>
            <Eye className="h-3 w-3 me-1" /> {isAr ? "عرض التفاصيل" : "View Details"}
          </Button>
        );
    }
  };

  const stats = {
    total: applications?.length || 0,
    approved: applications?.filter(a => a.status === "approved").length || 0,
    pending: applications?.filter(a => ["under_review", "pending_admin", "submitted"].includes(a.status)).length || 0,
    drafts: applications?.filter(a => ["draft", "declaration_pending", "stage1_pending", "stage1_failed", "stage2_pending", "stage2_failed"].includes(a.status)).length || 0,
    rejected: applications?.filter(a => a.status === "rejected" || a.status === "permanently_rejected").length || 0,
    retracted: applications?.filter(a => a.status === "retracted").length || 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setLocation("/")}>
            <Logo size={32} />
            <span className="font-display font-bold text-lg hidden sm:inline">{isAr ? "لوحة التحكم" : "Dashboard"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/verify")}>
              <Search className="h-3.5 w-3.5 me-1" /> {t("nav.verify")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/resources")}>
              <BookOpen className="h-3.5 w-3.5 me-1" /> {t("nav.resources")}
            </Button>
            {user?.role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
                {isAr ? "لوحة الإدارة" : "Admin Panel"}
              </Button>
            )}
            <Separator orientation="vertical" className="h-6" />
            <NotificationCenter />
            <LanguageToggle />
            <Button variant="ghost" size="sm" onClick={() => setLocation("/profile")} className="text-muted-foreground">
              <User className="h-3.5 w-3.5 me-1" /> {user?.name}
            </Button>
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

      <div className="container py-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{isAr ? "طلباتي" : "My Applications"}</h1>
            <p className="text-muted-foreground mt-1">{isAr ? "تتبع وإدارة طلبات IRB الخاصة بك في الوقت الفعلي" : "Track and manage your IRB applications in real-time"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 me-1" /> {isAr ? "تحديث" : "Refresh"}
            </Button>
            <Button onClick={() => createApp.mutate()} disabled={createApp.isPending}>
              <Plus className="h-4 w-4 me-2" />
              {createApp.isPending ? (isAr ? "جاري الإنشاء..." : "Creating...") : (isAr ? "طلب جديد" : "New Application")}
            </Button>
            <Button variant="outline" onClick={() => setLocation("/chat-apply")}>
              <Sparkles className="h-4 w-4 me-2" />
              {isAr ? "طلب عبر مساعد الذكاء الاصطناعي" : "Chatbot AI Application"}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {applications && applications.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Applications"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.approved}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "تمت الموافقة" : "Approved"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "قيد المراجعة" : "In Review"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.drafts}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "قيد التقدم" : "In Progress"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "مرفوضة" : "Rejected"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-bold text-orange-700">{stats.retracted}</div>
                <div className="text-xs text-muted-foreground">{isAr ? "مسحوبة" : "Retracted"}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search + filter chips — only when the user has any apps */}
        {applications && applications.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? "ابحث بالعنوان، المحقق، IRB#..." : "Search by title, PI, IRB number, institution..."}
                className="ps-9"
                aria-label={isAr ? "البحث في الطلبات" : "Search applications"}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: "all", label: isAr ? "الكل" : "All", count: applications.length },
                { key: "active", label: isAr ? "نشطة" : "In review", count: applications.filter(a => ["under_review","pending_admin","submitted"].includes(a.status)).length },
                { key: "approved", label: isAr ? "معتمدة" : "Approved", count: applications.filter(a => a.status === "approved").length },
                { key: "drafts", label: isAr ? "مسودات" : "Drafts", count: applications.filter(a => ["draft","declaration_pending","stage1_pending","stage1_failed","stage2_pending","stage2_failed"].includes(a.status)).length },
                { key: "rejected", label: isAr ? "مرفوضة" : "Rejected", count: applications.filter(a => ["rejected","permanently_rejected"].includes(a.status)).length },
                { key: "retracted", label: isAr ? "مسحوبة" : "Retracted", count: applications.filter(a => a.status === "retracted").length },
              ].map(b => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setFilterBucket(b.key as any)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filterBucket === b.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {b.label}
                  <span className="ms-1 opacity-60">{b.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Applications List */}
        {appsLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="py-5">
                  <div className="flex items-start gap-4 animate-pulse">
                    <div className="mt-1 shrink-0 h-5 w-5 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 bg-muted rounded" />
                      <div className="flex gap-2">
                        <div className="h-3 w-16 bg-muted rounded" />
                        <div className="h-3 w-24 bg-muted rounded" />
                        <div className="h-3 w-20 bg-muted rounded" />
                      </div>
                      <div className="h-2 w-full bg-muted/60 rounded mt-3" />
                    </div>
                    <div className="h-8 w-24 bg-muted rounded shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !applications?.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{isAr ? "لا توجد طلبات بعد" : "No Applications Yet"}</h3>
              <p className="text-muted-foreground mb-6">{isAr ? "ابدأ أول طلب IRB لبدء عملية المراجعة." : "Start your first IRB application to begin the review process."}</p>
              <Button onClick={() => createApp.mutate()} disabled={createApp.isPending}>
                <Plus className="h-4 w-4 me-2" /> {isAr ? "إنشاء طلب" : "Create Application"}
              </Button>
            </CardContent>
          </Card>
        ) : filteredApplications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">{isAr ? "لا نتائج مطابقة" : "No matches"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? (isAr ? `لا توجد طلبات مطابقة لـ "${searchQuery}".` : `No applications match "${searchQuery}".`)
                  : (isAr ? "لا توجد طلبات في هذه الفئة." : "No applications in this filter.")}
              </p>
              <Button variant="outline" size="sm" onClick={() => { setSearchQuery(""); setFilterBucket("all"); }}>
                {isAr ? "مسح الفلتر" : "Clear filters"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredApplications.map((app) => (
              <Card key={app.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="py-5">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 shrink-0">{getStatusIcon(app.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold truncate text-base">
                              {app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}
                            </h3>
                            {app.irbNumber && (
                              <Badge variant="outline" className="font-mono text-xs border-primary text-primary">{app.irbNumber}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-xs ${STATUS_COLORS[app.status as ApplicationStatus] || "bg-gray-100 text-gray-700"}`}>
                              {STATUS_LABELS[app.status as ApplicationStatus] || app.status}
                            </Badge>
                            {app.researchType && (
                              <span className="text-xs text-muted-foreground">
                                {RESEARCH_TYPE_LABELS[app.researchType as ResearchType] || app.researchType.replace(/_/g, " ")}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {isAr ? "أُنشئ" : "Created"} {new Date(app.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                            </span>
                            {app.submissionCount > 1 && (
                              <Badge variant="outline" className="text-xs">{isAr ? `المحاولة #${app.submissionCount}` : `Attempt #${app.submissionCount}`}</Badge>
                            )}
                          </div>
                          {/* Distinguish "queued for committee" vs the
                              "final admin decision" meaning of pending_admin
                              by checking whether the app has been approved
                              yet. submittedAt + no approvedAt + pending_admin
                              ⇒ awaiting committee assignment. */}
                          {app.status === "pending_admin" && app.submittedAt && !app.approvedAt && (
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1.5 leading-relaxed">
                              {isAr
                                ? "ملاحظة: تم تقديم طلبك بنجاح. ينتظر تعيين لجنة المراجعة من قبل الإدارة. ستتلقى إشعارًا فور بدء المراجعة."
                                : "Submitted successfully — awaiting committee assignment by the admin team. You'll be notified the moment your reviewers are assigned."}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">{getActionButton(app)}</div>
                      </div>

                      {/* Phase Tracker */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span className="font-medium">{getPhaseLabel(app.status)}</span>
                          <span>{getStatusProgress(app.status)}%</span>
                        </div>
                        <Progress value={getStatusProgress(app.status)} className="h-1.5" />
                      </div>

                      {/* AI Scores */}
                      {(app.stage1AiScore !== null || app.stage2AiScore !== null) && (
                        <div className="flex items-center gap-4 mt-3">
                          {app.stage1AiScore !== null && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Brain className="h-3 w-3 text-primary" />
                              <span className="text-muted-foreground">{isAr ? "المرحلة 1:" : "Stage 1:"}</span>
                              <span className={`font-semibold ${app.stage1Passed ? "text-emerald-600" : "text-red-600"}`}>
                                {app.stage1AiScore}/100
                              </span>
                            </div>
                          )}
                          {app.stage2AiScore !== null && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Brain className="h-3 w-3 text-primary" />
                              <span className="text-muted-foreground">{isAr ? "المرحلة 2:" : "Stage 2:"}</span>
                              <span className={`font-semibold ${app.stage2Passed ? "text-emerald-600" : "text-red-600"}`}>
                                {app.stage2AiScore}/100
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status-specific messages */}
                      {app.status === "under_review" && (
                        <div className="mt-3 p-2.5 rounded-lg bg-purple-50 border border-purple-100 text-xs text-purple-700 flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{isAr ? "يتم مراجعة طلبك من قبل اللجنة. لدى المراجعين 24 ساعة للرد." : "Your application is being reviewed by the committee. Reviewers have 24 hours to respond."}</span>
                        </div>
                      )}
                      {app.status === "pending_admin" && (
                        <div className="mt-3 p-2.5 rounded-lg bg-yellow-50 border border-yellow-100 text-xs text-yellow-700 flex items-center gap-2">
                          <Award className="h-3.5 w-3.5 shrink-0" />
                          <span>{isAr ? "اكتملت مراجعة اللجنة. في انتظار الموافقة النهائية من المسؤول." : "Committee review complete. Awaiting final admin approval."}</span>
                        </div>
                      )}
                      {(app.status === "rejected" || app.status === "resubmission_required") && (
                        <div className="mt-3 p-2.5 rounded-lg bg-orange-50 border border-orange-100 text-xs text-orange-700 flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {app.rejectionReason || (isAr ? "يحتاج طلبك إلى مراجعة." : "Your application needs revision.")}
                            {app.submissionCount < 2 && (isAr ? " يمكنك إعادة التقديم مرة واحدة أخرى." : " You may resubmit once more.")}
                          </span>
                        </div>
                      )}
                      {app.status === "approved" && (
                        <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {isAr ? "تمت الموافقة في" : "Approved on"} {app.approvedAt ? new Date(app.approvedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US") : "N/A"}.
                            {app.irbNumber && ` ${isAr ? "الشهادة:" : "Certificate:"} ${app.irbNumber}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Links */}
        <div className="mt-8 grid sm:grid-cols-3 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/verify")}>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Search className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("nav.verify")}</p>
                <p className="text-xs text-muted-foreground">{isAr ? "تحقق من صحة الشهادة" : "Check certificate authenticity"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/resources")}>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("nav.resources")}</p>
                <p className="text-xs text-muted-foreground">{isAr ? "النماذج والإرشادات" : "Templates & guidelines"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/support")}>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{t("nav.support")}</p>
                <p className="text-xs text-muted-foreground">{isAr ? "احصل على مساعدة أو أبلغ عن مشكلة" : "Get help or report issues"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
