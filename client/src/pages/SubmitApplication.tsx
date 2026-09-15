import { useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useT } from "@/contexts/LanguageContext";
import { Navbar } from "@/components/Navbar";
import { ArrowLeft, Send, Loader2, FileText } from "lucide-react";

export default function SubmitApplication() {
  const { id } = useParams<{ id: string }>();
  const appId = /^\d+$/.test(id || "") ? Number(id) : 0;
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const { lang } = useT();
  const isAr = lang === "ar";
  const enabled = Boolean(user && Number.isSafeInteger(appId) && appId > 0);
  const appQuery = trpc.application.getById.useQuery(
    { id: appId },
    { enabled }
  );
  const readinessQuery = trpc.application.getSubmissionReadiness.useQuery(
    { id: appId },
    { enabled }
  );
  const submitApp = trpc.application.submit.useMutation();
  const submitting = useRef(false);
  const utils = trpc.useUtils();
  const readiness = readinessQuery.data;
  const app = appQuery.data;
  const submit = async () => {
    if (submitting.current || !readiness?.canSubmit) return;
    submitting.current = true;
    try {
      const response = await submitApp.mutateAsync({ id: appId });
      toast.success(
        response.assignedMembers > 0
          ? isAr
            ? "تم تقديم الطلب وإحالته إلى المراجعين المعيّنين."
            : "Application submitted and assigned to appointed reviewers."
          : isAr
            ? "تم تقديم الطلب وأُضيف إلى قائمة انتظار المراجعة البشرية."
            : "Application submitted and queued for human review."
      );
      void utils.application.getById.invalidate({ id: appId });
      setLocation(`/application/${appId}`);
    } catch {
      toast.error(
        isAr
          ? "لم يكتمل تأكيد التقديم. حدّثنا حالة الطلب؛ تحقق منها قبل إعادة المحاولة."
          : "Submission could not be confirmed. We refreshed the application status; check it before retrying."
      );
      await readinessQuery.refetch();
    } finally {
      submitting.current = false;
    }
  };
  const loadingPage =
    loading || (enabled && (appQuery.isLoading || readinessQuery.isLoading));
  const readyToDisplay =
    app &&
    user &&
    app.applicantId === user.id &&
    readiness &&
    !appQuery.isError &&
    !readinessQuery.isError;
  const reviewLabel = (state: "completed" | "unavailable" | "not_reviewed") =>
    state === "completed"
      ? isAr
        ? "مراجعة استرشادية متوفرة"
        : "Advisory review available"
      : state === "unavailable"
        ? isAr
          ? "غير متاحة حالياً؛ لا توجد درجة جديدة"
          : "Currently unavailable; no new score"
        : isAr
          ? "لم تُطلب مراجعة آلية"
          : "AI review not requested";
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container max-w-2xl py-8">
        {loadingPage ? (
          <p role="status" className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            {isAr
              ? "جارٍ التحقق من جاهزية الطلب…"
              : "Checking application readiness…"}
          </p>
        ) : !readyToDisplay ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h1 className="text-xl font-semibold">
                {isAr
                  ? "تعذر التحقق من الطلب"
                  : "Application readiness could not be checked"}
              </h1>
              <p>
                {isAr
                  ? "تحقق من تسجيل الدخول ثم أعد المحاولة. لم يُقدَّم أي طلب من هذه الصفحة."
                  : "Check that you are signed in, then retry. This page has not submitted an application."}
              </p>
              {enabled && (
                <Button
                  onClick={() => {
                    void appQuery.refetch();
                    void readinessQuery.refetch();
                  }}
                >
                  {isAr ? "إعادة المحاولة" : "Retry"}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                <h1 className="text-2xl">
                  {isAr
                    ? "تقديم الطلب للمراجعة البشرية"
                    : "Submit for human review"}
                </h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-3 rounded-lg bg-muted/50 p-4">
                <FileText
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-medium break-words">{app.researchTitle}</p>
                  <p className="text-sm text-muted-foreground break-words">
                    {app.principalInvestigator} · {app.piInstitution}
                  </p>
                </div>
              </div>
              {readiness.alreadySubmitted ? (
                <div role="status" className="space-y-3">
                  <h2 className="font-semibold">
                    {isAr
                      ? "تم تقديم هذا الطلب بالفعل"
                      : "This application has already been submitted"}
                  </h2>
                  <Button onClick={() => setLocation(`/application/${appId}`)}>
                    {isAr ? "متابعة حالة الطلب" : "View application status"}
                  </Button>
                </div>
              ) : (
                <>
                  <section aria-labelledby="submission-readiness">
                    <h2
                      id="submission-readiness"
                      className="font-semibold mb-2"
                    >
                      {readiness.canSubmit
                        ? isAr
                          ? "المعلومات والإقرارات المطلوبة مكتملة"
                          : "Required information and declarations are complete"
                        : isAr
                          ? "أكمل المطلوب قبل التقديم"
                          : "Complete these requirements before submitting"}
                    </h2>
                    {readiness.missingFields.length > 0 && (
                      <ul className="space-y-2 list-disc ps-5">
                        {readiness.missingFields.map(item => (
                          <li key={item.field}>
                            <a
                              className="text-primary underline"
                              href={
                                item.field.startsWith("declaration_")
                                  ? `/apply/${appId}/declaration`
                                  : `/apply/${appId}/stage${item.stage}#${item.field}`
                              }
                            >
                              {isAr ? item.labelAr : item.labelEn}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {readiness.blockers.map(blocker => (
                      <p key={blocker.code} className="text-sm mt-2">
                        {isAr ? blocker.messageAr : blocker.messageEn}
                      </p>
                    ))}
                    {!readiness.canSubmit &&
                      !readiness.missingFields.length &&
                      !readiness.blockers.length && (
                        <p>
                          {isAr
                            ? "الطلب غير جاهز في حالته الحالية. راجع تفاصيله أو حدّث الحالة."
                            : "The application is not ready in its current state. Review its details or refresh its status."}
                        </p>
                      )}
                  </section>
                  <details className="rounded-lg border p-4">
                    <summary className="cursor-pointer font-medium">
                      {isAr
                        ? "المراجعة الآلية الاختيارية"
                        : "Optional AI review"}
                    </summary>
                    <ul className="mt-3 space-y-2 text-sm">
                      <li>
                        {isAr ? "المرحلة الأولى: " : "Stage 1: "}
                        {reviewLabel(readiness.ai.stage1)}
                      </li>
                      <li>
                        {isAr ? "المرحلة الثانية: " : "Stage 2: "}
                        {reviewLabel(readiness.ai.stage2)}
                      </li>
                    </ul>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {isAr
                        ? "ملاحظات الذكاء الاصطناعي استرشادية. لا تُعدّ درجة النجاح شرطاً للتقديم، ولا تُعدّ نتيجة الذكاء الاصطناعي موافقة أخلاقية."
                        : "AI feedback is advisory. A passing score is not required to submit, and an AI result is not ethics approval."}
                    </p>
                  </details>
                  <section className="space-y-3 text-sm">
                    <h2 className="font-semibold text-base">
                      {isAr ? "بعد التقديم" : "After submission"}
                    </h2>
                    <p>
                      {isAr
                        ? "يُضاف الطلب إلى قائمة انتظار المراجعة البشرية، ويُحال إلى مراجعين مؤهلين ومعيّنين بحسب توفرهم. قد تُطلب منك توضيحات أو تعديلات."
                        : "Your application enters the human review queue and is assigned to qualified, appointed reviewers as they become available. You may be asked for clarification or revisions."}
                    </p>
                    <p>
                      {isAr
                        ? "تعتمد المدة على مخاطر الدراسة ومتطلبات اللجنة وتوفر المراجعين. يتطلب القرار النهائي صلاحية مؤسسية مخولة؛ التقديم بحد ذاته لا يجيز بدء البحث."
                        : "Timing depends on study risk, committee requirements and reviewer availability. The final decision requires verified institutional authority; submitting does not authorize research to begin."}
                    </p>
                    <p className="text-muted-foreground">
                      {isAr
                        ? "راجع إجاباتك قبل التقديم. تُحفظ نسخة للمراجعة، وتتاح التعديلات اللاحقة عند إعادة الطلب إليك."
                        : "Check your answers before submitting. A review record is retained, and subsequent edits are available when the application is returned to you."}
                    </p>
                  </section>
                  <div className="flex flex-wrap gap-3 justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      disabled={submitApp.isPending}
                      onClick={() => setLocation(`/apply/${appId}/stage2`)}
                    >
                      <ArrowLeft className="h-4 w-4 me-1" />
                      {isAr ? "تعديل البروتوكول" : "Edit protocol"}
                    </Button>
                    <Button
                      onClick={() => void submit()}
                      disabled={
                        !readiness.canSubmit ||
                        submitApp.isPending ||
                        readinessQuery.isFetching
                      }
                    >
                      {submitApp.isPending ? (
                        <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 me-2" />
                      )}
                      {submitApp.isPending
                        ? isAr
                          ? "جارٍ التقديم…"
                          : "Submitting…"
                        : isAr
                          ? "تقديم الطلب للمراجعة"
                          : "Submit application for review"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
