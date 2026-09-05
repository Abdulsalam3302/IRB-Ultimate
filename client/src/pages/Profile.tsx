import { MfaSettings } from "@/components/MfaSettings";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { signOutSupabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import {
  User, Mail, Calendar, Shield, FileText, Award, Download,
  Clock, CheckCircle, XCircle, ArrowRight, Loader2, Eye,
  TrendingUp, BarChart3, AlertTriangle, ExternalLink, Trash2
} from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, RESEARCH_TYPE_LABELS } from "@shared/types";
import type { ApplicationStatus, ResearchType } from "@shared/types";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Profile() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { lang } = useT();
  const isAr = lang === "ar";
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [erasureReceipt, setErasureReceipt] = useState<{ deletedDraftApplications: number; retainedRegulatoryApplications: number; queuedStorageDeletions: number; blockedStorageDeletions: number; queuedIdentityDeletions: number; blockedIdentityDeletions: number } | null>(null);
  const queryClient = useQueryClient();

  const { data: applications, isLoading: appsLoading } = trpc.application.myApplications.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const exportMyData = async () => {
    setExporting(true);
    try {
      const bundle = await utils.auth.exportMyData.fetch();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `my-irb-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(isAr ? "تم تنزيل بياناتك." : "Your data export has been downloaded.");
    } catch {
      toast.error(isAr ? "فشل تصدير البيانات." : "Data export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const deleteMyAccount = trpc.auth.deleteMyAccount.useMutation({
    onSuccess: async (result) => {
      setErasureReceipt(result);
      await queryClient.cancelQueries();
      queryClient.clear();
      utils.auth.me.setData(undefined, null);
      await signOutSupabase();
    },
    onError: () => toast.error(isAr ? "تعذّر إغلاق الحساب. يرجى المحاولة لاحقًا أو التواصل مع الدعم." : "Account closure could not be completed. Please retry later or contact support."),
  });

  // Hooks MUST run unconditionally on every render — otherwise the
  // hook order shifts between loading/loaded/unauth, which React flags
  // as "change in the order of Hooks called". Compute everything via
  // useMemo before any conditional return, then early-return below.
  const { apps, approvedApps, pendingApps, rejectedApps, stats } = useMemo(() => {
    const apps = applications || [];
    const approvedApps = apps.filter((a: any) => a.status === "approved");
    const pendingApps = apps.filter((a: any) => !["approved", "rejected", "permanently_rejected", "retracted", "hidden", "draft"].includes(a.status));
    const rejectedApps = apps.filter((a: any) => ["rejected", "permanently_rejected"].includes(a.status));
    const counted = apps.filter((a: any) => a.status !== "draft").length;
    const stats = {
      total: apps.length,
      approved: approvedApps.length,
      pending: pendingApps.length,
      rejected: rejectedApps.length,
      approvalRate: counted > 0 ? Math.round((approvedApps.length / counted) * 100) : 0,
    };
    return { apps, approvedApps, pendingApps, rejectedApps, stats };
  }, [applications]);

  if (erasureReceipt) {
    return <main className="min-h-screen flex items-center justify-center p-4" dir={isAr ? "rtl" : "ltr"}>
      <Card className="max-w-xl w-full" role="status" aria-live="polite">
        <CardHeader><CardTitle>{isAr ? "أُغلق حسابك" : "Your account has been closed"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>{isAr ? "أُلغي الوصول إلى الحساب، وأُزيلت بيانات هويتك من سجل الحساب في المنصة." : "Account access has been revoked and identifying details have been removed from the platform account record."}</p>
          <p>{isAr ? `المسودات المحذوفة: ${erasureReceipt.deletedDraftApplications}. السجلات البحثية المحتفظ بها: ${erasureReceipt.retainedRegulatoryApplications}.` : `Drafts removed: ${erasureReceipt.deletedDraftApplications}. Research records retained: ${erasureReceipt.retainedRegulatoryApplications}.`}</p>
          {(erasureReceipt.queuedStorageDeletions > 0 || erasureReceipt.blockedStorageDeletions > 0) && <p>{isAr ? "حذف الملفات الخاصة لم يكتمل بعد. سُجّل طلب الحذف للمعالجة، وقد تتطلب بعض الملفات مراجعة المشغّل. إغلاق الحساب لا يعني اكتمال حذف كل الملفات." : "Private file deletion is still pending. The deletion request has been recorded for processing; some files may require operator review. Account closure does not mean that every file has already been deleted."}</p>}
          {(erasureReceipt.queuedIdentityDeletions > 0 || erasureReceipt.blockedIdentityDeletions > 0) && <p>{isAr ? "حُظر تسجيل الدخول مجددًا بهذه الهوية. لا يزال حذف هوية تسجيل الدخول لدى المزوّد قيد المعالجة، وقد يتطلب مراجعة المشغّل." : "This identity is blocked from signing in again. Removal of the sign-in identity at the provider is still pending and may require operator review."}</p>}
          <Button disabled={deleteMyAccount.isPending} onClick={() => { window.location.href = "/"; }}>{deleteMyAccount.isPending ? (isAr ? "جارٍ مسح جلسة المتصفح…" : "Clearing browser session…") : (isAr ? "العودة إلى الرئيسية" : "Return to homepage")}</Button>
        </CardContent>
      </Card>
    </main>;
  }

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
          <CardContent className="py-8 text-center">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{isAr ? "يرجى تسجيل الدخول" : "Please Sign In"}</h2>
            <p className="text-muted-foreground mb-4">{isAr ? "تحتاج لتسجيل الدخول لعرض ملفك الشخصي." : "You need to sign in to view your profile."}</p>
            <Button className="btn-apple" onClick={() => { window.location.href = getLoginUrl(); }}>
              {isAr ? "تسجيل الدخول" : "Sign In"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo="/dashboard" backLabel={isAr ? "لوحة التحكم" : "Dashboard"} />

      <div className="container py-8 max-w-4xl">
        {/* Profile Header */}
        <Card className="mb-8 overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
          <CardContent className="-mt-12 pb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 border-4 border-background flex items-center justify-center shadow-lg">
                <User className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{user?.name || (isAr ? "باحث" : "Researcher")}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {user?.email}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {isAr ? "انضم" : "Joined"} {user?.createdAt ? new Date(user.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "long" }) : "—"}</span>
                  {user?.role === "admin" && (
                    <Badge variant="outline" className="text-primary border-primary/30">
                      <Shield className="h-3 w-3 me-1" /> {isAr ? "مسؤول" : "Admin"}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
                {isAr ? "لوحة التحكم" : "Dashboard"} <ArrowRight className="h-3.5 w-3.5 ms-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <MfaSettings />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <FileText className="h-5 w-5 text-primary mx-auto mb-1.5" />
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Applications"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
              <p className="text-xs text-muted-foreground">{isAr ? "موافق عليها" : "Approved"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">{isAr ? "قيد المراجعة" : "In Progress"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <TrendingUp className="h-5 w-5 text-blue-600 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-blue-600">{stats.approvalRate}%</p>
              <p className="text-xs text-muted-foreground">{isAr ? "معدل الموافقة" : "Approval Rate"}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs: Certificates, All Applications, Activity */}
        <Tabs defaultValue="certificates" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="certificates"><Award className="h-4 w-4 me-1" /> {isAr ? "الشهادات" : "Certificates"}</TabsTrigger>
            <TabsTrigger value="history"><FileText className="h-4 w-4 me-1" /> {isAr ? "السجل" : "History"}</TabsTrigger>
            <TabsTrigger value="activity"><BarChart3 className="h-4 w-4 me-1" /> {isAr ? "النشاط" : "Activity"}</TabsTrigger>
          </TabsList>

          {/* Certificates Tab */}
          <TabsContent value="certificates">
            {approvedApps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Award className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">{isAr ? "لا توجد شهادات بعد" : "No Certificates Yet"}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{isAr ? "ستظهر شهادات IRB المعتمدة هنا بعد الموافقة على طلباتك." : "Your approved IRB certificates will appear here once your applications are approved."}</p>
                  <Button variant="outline" onClick={() => setLocation("/dashboard")}>
                    {isAr ? "تقديم طلب" : "Submit an Application"} <ArrowRight className="h-3.5 w-3.5 ms-1" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {approvedApps.map((app: any) => (
                  <Card key={app.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-5">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                            <Award className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm">{app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                              {app.irbNumber && (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-xs">
                                  {app.irbNumber}
                                </Badge>
                              )}
                              <span>{isAr ? "تمت الموافقة" : "Approved"}: {app.approvedAt ? new Date(app.approvedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US") : "—"}</span>
                              {app.researchType && (
                                <span className="capitalize">{(RESEARCH_TYPE_LABELS as any)[app.researchType] || String(app.researchType).replace(/_/g, " ")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {app.irbNumber && app.humanDecisionByUserId && app.humanDecisionAt && (
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" asChild>
                              <a href={`/api/export/certificate/${app.id}`} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5 me-1" /> {isAr ? "الشهادة" : "Certificate"}
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setLocation(`/application/${app.id}`)}>
                            <Eye className="h-3.5 w-3.5 me-1" /> {isAr ? "عرض" : "View"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Submission History Tab */}
          <TabsContent value="history">
            {appsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : apps.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">{isAr ? "لا توجد طلبات" : "No Applications"}</h3>
                  <p className="text-sm text-muted-foreground">{isAr ? "لم تقم بتقديم أي طلبات بعد." : "You haven't submitted any applications yet."}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {apps.map((app: any) => {
                  // STATUS_LABELS is a flat Record<status, string>; the
                  // old `[isAr?"ar":"en"]` indirection always returned
                  // undefined and fell through to the raw enum. Same for
                  // STATUS_COLORS which is a full Tailwind class string.
                  const statusLabel = (STATUS_LABELS as any)[app.status] || String(app.status).replace(/_/g, " ");
                  const badgeClass = (STATUS_COLORS as any)[app.status] || "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";

                  return (
                    <Card key={app.id} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setLocation(`/application/${app.id}`)}>
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-sm truncate">{app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}</h3>
                              {app.proceedDespiteStage1 && (
                                <span title="Proceeded despite AI score"><AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" /></span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{new Date(app.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                              {app.researchType && (
                                <span className="capitalize">{(RESEARCH_TYPE_LABELS as any)[app.researchType] || String(app.researchType).replace(/_/g, " ")}</span>
                              )}
                              {app.irbNumber && <span className="text-emerald-600 font-medium">{app.irbNumber}</span>}
                              {app.stage1AiScore != null && (
                                <span className={`font-medium ${app.stage1AiScore >= 80 ? "text-emerald-600" : app.stage1AiScore >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                                  AI: {app.stage1AiScore}/100
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ms-3">
                            <Badge className={`text-xs ${badgeClass}`}>{statusLabel}</Badge>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <div className="space-y-6">
              {/* Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "النشاط الأخير" : "Recent Activity"}</CardTitle>
                </CardHeader>
                <CardContent>
                  {apps.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{isAr ? "لا يوجد نشاط بعد." : "No activity yet."}</p>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        type TimelineEvent = { appId: number; date: string; label: string; icon: typeof FileText; color: string; title: string };
                        const flat: TimelineEvent[] = [];
                        apps.slice(0, 10).forEach((app: any) => {
                          const title = app.researchTitle || `#${app.id}`;
                          if (app.approvedAt) flat.push({ appId: app.id, date: app.approvedAt, label: isAr ? "تمت الموافقة" : "Approved", icon: CheckCircle, color: "text-emerald-600", title });
                          if (app.submittedAt) flat.push({ appId: app.id, date: app.submittedAt, label: isAr ? "تم التقديم" : "Submitted", icon: FileText, color: "text-blue-600", title });
                          if (app.retractedAt) flat.push({ appId: app.id, date: app.retractedAt, label: isAr ? "تم السحب" : "Retracted", icon: XCircle, color: "text-red-600", title });
                          flat.push({ appId: app.id, date: app.createdAt, label: isAr ? "تم الإنشاء" : "Created", icon: FileText, color: "text-muted-foreground", title });
                        });
                        flat.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        return flat.slice(0, 25).map((event, idx) => (
                          <div key={`${event.appId}-${idx}`} className="flex items-start gap-3">
                            <div className={`mt-0.5 ${event.color}`}>
                              <event.icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{event.label}: <span className="font-normal text-muted-foreground truncate">{event.title}</span></p>
                              <p className="text-xs text-muted-foreground">{new Date(event.date).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Personal Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "المعلومات الشخصية" : "Personal Information"}</CardTitle>
                  <CardDescription>{isAr ? "معلوماتك المسجلة في النظام." : "Your registered information in the system."}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "الاسم الكامل" : "Full Name"}</p>
                      <p className="font-medium">{user?.name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "البريد الإلكتروني" : "Email"}</p>
                      <p className="font-medium">{user?.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "طريقة تسجيل الدخول" : "Login Method"}</p>
                      <p className="font-medium capitalize">{user?.loginMethod || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "الدور" : "Role"}</p>
                      <Badge variant="outline" className="capitalize">{user?.role || "user"}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "تاريخ الانضمام" : "Member Since"}</p>
                      <p className="font-medium">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? "آخر تسجيل دخول" : "Last Sign In"}</p>
                      <p className="font-medium">{user?.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Privacy & Data (PDPL) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "الخصوصية والبيانات" : "Privacy & Data"}</CardTitle>
                  <CardDescription>
                    {isAr
                      ? "وفقاً لنظام حماية البيانات الشخصية (PDPL)، يمكنك تنزيل نسخة من بياناتك أو حذف حسابك."
                      : "In line with the Saudi Personal Data Protection Law (PDPL), you can download a copy of your data or delete your account."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" onClick={exportMyData} disabled={exporting}>
                      {exporting ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Download className="h-4 w-4 me-2" />}
                      {isAr ? "تنزيل بياناتي (JSON)" : "Download My Data (JSON)"}
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                          <Trash2 className="h-4 w-4 me-2" /> {isAr ? "حذف حسابي" : "Delete My Account"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="text-red-600">{isAr ? "حذف الحساب نهائياً" : "Permanently Delete Account"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <p className="text-sm text-muted-foreground">
                            {isAr
                              ? "سيتم حذف مسوداتك غير المقدمة نهائياً وإخفاء هوية حسابك. الطلبات المقدمة أو المعتمدة سجلات تنظيمية ويتم الاحتفاظ بها وفق سياسة المنصة. لا يمكن التراجع عن هذا الإجراء."
                              : "Your unsubmitted drafts will be permanently deleted and your account will be anonymized. Submitted or approved applications are regulatory records and are retained per platform policy. This action cannot be undone."}
                          </p>
                          <div className="space-y-2">
                            <Label>{isAr ? "اكتب DELETE-MY-ACCOUNT للتأكيد" : "Type DELETE-MY-ACCOUNT to confirm"}</Label>
                            <Input
                              value={deleteConfirm}
                              onChange={(e) => setDeleteConfirm(e.target.value)}
                              placeholder="DELETE-MY-ACCOUNT"
                              autoComplete="off"
                            />
                          </div>
                          <Button
                            variant="destructive"
                            className="w-full"
                            disabled={deleteConfirm !== "DELETE-MY-ACCOUNT" || deleteMyAccount.isPending}
                            onClick={() => deleteMyAccount.mutate({ confirm: deleteConfirm })}
                          >
                            {deleteMyAccount.isPending ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Trash2 className="h-4 w-4 me-2" />}
                            {isAr ? "تأكيد الحذف النهائي" : "Confirm Permanent Deletion"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
