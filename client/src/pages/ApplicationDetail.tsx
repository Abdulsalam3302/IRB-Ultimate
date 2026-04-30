import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { Loader2, Download, Clock, CheckCircle, XCircle, History } from "lucide-react";
import { STATUS_LABELS, STATUS_COLORS, RESEARCH_TYPE_LABELS, IRB_CATEGORY_LABELS } from "@shared/types";
import type { ApplicationStatus, ResearchType, IrbCategory } from "@shared/types";
import RelatedLiterature from "@/components/RelatedLiterature";

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { lang } = useT();
  const isAr = lang === "ar";
  // Smart back target — admins came from /admin, regular users from /dashboard.
  // Reviewers landing here came from /reviews. Pick by role.
  const backTo = user?.role === "admin" ? "/admin" : "/dashboard";
  const backLabel = user?.role === "admin"
    ? (isAr ? "لوحة الإدارة" : "Admin Panel")
    : (isAr ? "لوحة التحكم" : "Dashboard");

  const { data: app, isLoading } = trpc.application.getById.useQuery(
    { id: appId }, { enabled: isAuthenticated && appId > 0 }
  );
  const { data: reviews } = trpc.review.getByApplication.useQuery(
    { applicationId: appId }, { enabled: isAuthenticated && appId > 0 }
  );
  const authors = app?.authors;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!app) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="py-8 text-center">
          <p className="text-muted-foreground">{isAr ? "الطلب غير موجود." : "Application not found."}</p>
          <Button className="mt-4" onClick={() => setLocation("/dashboard")}>{isAr ? "العودة" : "Back"}</Button>
        </CardContent></Card>
      </div>
    );
  }

  const infoRow = (label: string, value: string | null | undefined) => (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-end max-w-[60%]">{value || "—"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar showBack backTo={backTo} backLabel={backLabel} />
      <div className="container py-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{app.researchTitle || `${isAr ? "طلب" : "Application"} #${app.id}`}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge className={STATUS_COLORS[app.status as ApplicationStatus] || "bg-gray-100 text-gray-700"}>
                {STATUS_LABELS[app.status as ApplicationStatus] || app.status}
              </Badge>
              {app.irbNumber && <Badge variant="outline" className="font-mono">{app.irbNumber}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/application/${app.id}/versions`)}>
              <History className="h-4 w-4 me-1" /> {isAr ? "سجل الإصدارات" : "Version History"}
            </Button>
            {/* Always-fresh PDF, regenerated on demand by the server.
                Hits /api/export/certificate/:id which renders via headless
                Chromium against the redesigned formal certificate template.
                Available for any approved app — even if certificateUrl
                wasn't persisted at approval time. */}
            {app.status === "approved" && (
              <Button onClick={() => window.open(`/api/export/certificate/${app.id}`, "_blank")}>
                <Download className="h-4 w-4 me-2" /> {isAr ? "تحميل الشهادة (PDF)" : "Download Certificate (PDF)"}
              </Button>
            )}
            {app.certificateUrl && app.status !== "approved" && (
              <Button variant="outline" onClick={() => window.open(app.certificateUrl!, "_blank")}>
                <Download className="h-4 w-4 me-2" /> {isAr ? "الشهادة (نسخة قديمة)" : "Certificate (legacy)"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">{isAr ? "المعلومات الأساسية" : "Basic Information"}</CardTitle></CardHeader>
              <CardContent>
                {infoRow(isAr ? "نوع البحث" : "Research Type", RESEARCH_TYPE_LABELS[app.researchType as ResearchType] || app.researchType)}
                {infoRow(isAr ? "فئة IRB" : "IRB Category", IRB_CATEGORY_LABELS[app.irbCategory as IrbCategory] || app.irbCategory)}
                {infoRow(isAr ? "الباحث الرئيسي" : "Principal Investigator", app.principalInvestigator)}
                {infoRow(isAr ? "البريد الإلكتروني" : "Email", app.piEmail)}
                {infoRow(isAr ? "المؤسسة" : "Institution", app.piInstitution)}
                {infoRow(isAr ? "القسم" : "Department", app.piDepartment)}
                {infoRow(isAr ? "مصدر التمويل" : "Funding Source", app.fundingSource)}
                {infoRow(isAr ? "المدة المتوقعة" : "Duration", app.estimatedDuration)}
              </CardContent>
            </Card>

            {/* Research-type-specific info */}
            {(app.questionnaireFileUrl || app.retrospectiveDataSource || app.clinicalTrialDetails || app.labHeadName) && (
              <Card>
                <CardHeader><CardTitle className="text-lg">{isAr ? "معلومات خاصة بنوع البحث" : "Research-Type Specific Information"}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {app.questionnaireFileUrl && (
                    <div>
                      <p className="text-sm font-medium mb-1">{isAr ? "ملف الاستبيان" : "Questionnaire File"}</p>
                      <a href={app.questionnaireFileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{isAr ? "تحميل الملف" : "Download File"}</a>
                    </div>
                  )}
                  {app.retrospectiveDataSource && (
                    <div>
                      <p className="text-sm font-medium mb-1">{isAr ? "مصدر البيانات" : "Data Source"}</p>
                      <p className="text-sm text-muted-foreground">{app.retrospectiveDataSource}</p>
                    </div>
                  )}
                  {app.clinicalTrialDetails && (
                    <div>
                      <p className="text-sm font-medium mb-1">{isAr ? "تفاصيل التجربة السريرية" : "Clinical Trial Details"}</p>
                      <p className="text-sm text-muted-foreground">{app.clinicalTrialDetails}</p>
                    </div>
                  )}
                  {app.labHeadName && (
                    <div>
                      <p className="text-sm font-medium mb-1">{isAr ? "رئيس المختبر" : "Lab Head"}</p>
                      <p className="text-sm text-muted-foreground">{app.labHeadName} — {app.labHeadEmail} — {app.labHeadPhone}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Authors */}
            {authors && authors.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">{isAr ? "المؤلفون" : "Research Authors"}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {authors.map((a: any, i: number) => (
                      <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{i + 1}</div>
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.email} • {a.institution} • {a.department}</p>
                          <p className="text-xs text-muted-foreground">{a.country} {a.phone ? `• ${a.phone}` : ""}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {app.researchObjectives && (
              <Card>
                <CardHeader><CardTitle className="text-lg">{isAr ? "تفاصيل البحث" : "Research Details"}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: isAr ? "الأهداف" : "Objectives", value: app.researchObjectives },
                    { label: isAr ? "المنهجية" : "Methodology", value: app.methodology },
                    { label: isAr ? "حجم العينة" : "Sample Size", value: app.sampleSize },
                    { label: isAr ? "السكان المستهدفون" : "Target Population", value: app.targetPopulation },
                    { label: isAr ? "معايير الإدراج" : "Inclusion Criteria", value: app.inclusionCriteria },
                    { label: isAr ? "معايير الاستبعاد" : "Exclusion Criteria", value: app.exclusionCriteria },
                    { label: isAr ? "جمع البيانات" : "Data Collection", value: app.dataCollectionMethods },
                    { label: isAr ? "الموافقة المستنيرة" : "Informed Consent", value: app.informedConsentProcess },
                    { label: isAr ? "تقييم المخاطر" : "Risk Assessment", value: app.riskAssessment },
                    { label: isAr ? "تقييم الفوائد" : "Benefit Assessment", value: app.benefitAssessment },
                    { label: isAr ? "السرية" : "Confidentiality", value: app.confidentialityMeasures },
                    { label: isAr ? "تضارب المصالح" : "Conflict of Interest", value: app.conflictOfInterest },
                  ].filter(f => f.value).map((f, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium mb-1">{f.label}</p>
                      <p className="text-sm text-muted-foreground">{f.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="text-lg">{isAr ? "درجات المراجعة" : "AI Review Scores"}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">{isAr ? "المرحلة 1 (التصنيف)" : "Stage 1 (Classification)"}</span>
                  <Badge variant={app.stage1Passed ? "default" : "destructive"}>{app.stage1AiScore ?? "—"}/100</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{isAr ? "المرحلة 2 (الأخلاقيات)" : "Stage 2 (Ethics)"}</span>
                  <Badge variant={app.stage2Passed ? "default" : "destructive"}>{app.stage2AiScore ?? "—"}/100</Badge>
                </div>
              </CardContent>
            </Card>

            {reviews && reviews.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">{isAr ? "مراجعات اللجنة" : "Committee Reviews"}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {reviews.map((r: any) => (
                    <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="mt-0.5">
                        {r.status === "approved" ? <CheckCircle className="h-4 w-4 text-emerald-600" /> :
                         r.status === "rejected" ? <XCircle className="h-4 w-4 text-red-600" /> :
                         r.status === "expired" ? <Clock className="h-4 w-4 text-gray-400" /> :
                         <Clock className="h-4 w-4 text-yellow-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{r.memberName}</span>
                          <Badge variant="outline" className="text-xs capitalize">{r.status}</Badge>
                        </div>
                        {r.comments && <p className="text-xs text-muted-foreground mt-1">{r.comments}</p>}
                        {r.respondedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {isAr ? "الرد:" : "Responded:"} {new Date(r.respondedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {app.rejectionReason && (
              <Card className="border-red-200">
                <CardHeader><CardTitle className="text-lg text-red-700">{isAr ? "سبب الرفض" : "Rejection Reason"}</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-red-600">{app.rejectionReason}</p></CardContent>
              </Card>
            )}

            <RelatedLiterature applicationId={app.id} />

            <Card>
              <CardHeader><CardTitle className="text-lg">{isAr ? "الجدول الزمني" : "Timeline"}</CardTitle></CardHeader>
              <CardContent>
                {infoRow(isAr ? "تاريخ الإنشاء" : "Created", new Date(app.createdAt).toLocaleString())}
                {app.submittedAt && infoRow(isAr ? "تاريخ التقديم" : "Submitted", new Date(app.submittedAt).toLocaleString())}
                {app.approvedAt && infoRow(isAr ? "تاريخ الموافقة" : "Approved", new Date(app.approvedAt).toLocaleString())}
                {infoRow(isAr ? "رقم التقديم" : "Submission #", String(app.submissionCount))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
