import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { ArrowLeft, Send, CheckCircle, Loader2, FileText, Brain, Users } from "lucide-react";

export default function SubmitApplication() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || "0");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { lang } = useT();
  const isAr = lang === "ar";

  const { data: app, isLoading } = trpc.application.getById.useQuery(
    { id: appId }, { enabled: isAuthenticated && appId > 0 }
  );

  const submitApp = trpc.application.submit.useMutation({
    onSuccess: (data) => {
      toast.success(isAr ? `تم تقديم الطلب! تم تعيينه لـ ${data.assignedMembers} أعضاء لجنة.` : `Application submitted! Assigned to ${data.assignedMembers} committee members.`);
      setLocation("/dashboard");
    },
    onError: (error) => { toast.error(error.message); },
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!app || app.status !== "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{isAr ? "الطلب غير جاهز للتقديم. يرجى إكمال مرحلتي المراجعة أولاً." : "Application not ready for submission. Please complete both AI review stages first."}</p>
            <Button className="mt-4" onClick={() => setLocation("/dashboard")}>{isAr ? "العودة للوحة التحكم" : "Back to Dashboard"}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container py-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center pb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Send className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{isAr ? "تقديم لمراجعة اللجنة" : "Submit for Committee Review"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{app.researchTitle}</p>
                  <p className="text-xs text-muted-foreground">{app.principalInvestigator} • {app.piInstitution}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <Brain className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">{isAr ? "درجة المرحلة 1" : "Stage 1 AI Score"}</p>
                    <p className="font-bold text-emerald-700">{app.stage1AiScore}/100</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <Brain className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">{isAr ? "درجة المرحلة 2" : "Stage 2 AI Score"}</p>
                    <p className="font-bold text-emerald-700">{app.stage2AiScore}/100</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> {isAr ? "ما الذي سيحدث بعد ذلك" : "What Happens Next"}
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{isAr ? <>يُحال الطلب إلى <strong>مراجعين بشريين مؤهلين ومُعيّنين</strong> وفق توفرهم</> : <>Your application enters the queue for <strong>qualified, appointed human reviewers</strong></>}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{isAr ? <>تحدد متطلبات اللجنة ومخاطر الدراسة وتوفر المراجعين مدة المراجعة</> : <>Timing depends on committee requirements, study risk, and reviewer availability</>}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{isAr ? <>يجب استكمال مراجعة اللجنة المطلوبة قبل القرار النهائي المخول</> : <>The required committee review must be completed before the authorized final decision</>}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{isAr ? <>تُصدر سجلات القرار بعد التحقق من استيفاء متطلبات الصلاحية المؤسسية</> : <>Decision records are issued after institutional authority requirements are verified</>}</span>
                </li>
              </ul>
            </div>

            {app.submissionCount > 1 && (
              <div className="border border-orange-200 rounded-lg p-4 bg-orange-50/50">
                <p className="text-sm text-orange-700">
                  <strong>{isAr ? "ملاحظة:" : "Note:"}</strong> {isAr ? `هذه محاولة التقديم رقم ${app.submissionCount}. إذا تم الرفض مرة أخرى، سيكون الرفض نهائياً.` : `This is submission attempt #${app.submissionCount}. If rejected again, the rejection will be permanent.`}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setLocation(`/apply/${appId}/stage2`)}>
                <ArrowLeft className="h-4 w-4 me-1" /> {isAr ? "العودة للمرحلة 2" : "Back to Stage 2"}
              </Button>
              <Button size="lg" onClick={() => submitApp.mutate({ id: appId })} disabled={submitApp.isPending}>
                {submitApp.isPending ? (
                  <><Loader2 className="h-4 w-4 me-2 animate-spin" /> {isAr ? "جاري التقديم..." : "Submitting..."}</>
                ) : (
                  <><Send className="h-4 w-4 me-2" /> {isAr ? "تقديم للمراجعة" : "Submit for Review"}</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
