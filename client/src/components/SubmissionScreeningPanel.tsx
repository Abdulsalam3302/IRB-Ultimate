import { Stage2ReviewResult } from "@/components/Stage2ReviewResult";
import { Button } from "@/components/ui/button";
import { reviewView } from "@/lib/aiReviewPresentation";
import { stage1FieldLabel, labelStage1Text } from "@shared/stage1Fields";
export type ScreeningView = {
  status: "pending" | "running" | "completed" | "escalated";
  outcome?: "ready_for_human_decision" | "human_review_required";
  stage1?: unknown;
  stage2?: unknown;
};
export function screeningView(value: unknown): ScreeningView | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("status" in value) ||
    !["pending", "running", "completed", "escalated"].includes(
      String(value.status)
    )
  )
    return null;
  const source = value as Record<string, unknown>;
  return {
    status: source.status as ScreeningView["status"],
    outcome:
      source.outcome === "ready_for_human_decision" ||
      source.outcome === "human_review_required"
        ? source.outcome
        : undefined,
    stage1: source.stage1,
    stage2: source.stage2,
  };
}
export function SubmissionScreeningPanel({
  screening,
  isAr,
  refresh,
  refreshing,
}: {
  screening: ScreeningView;
  isAr: boolean;
  refresh: () => void;
  refreshing: boolean;
}) {
  const active =
    screening.status === "pending" || screening.status === "running";
  const status =
    screening.status === "pending"
      ? isAr
        ? "بانتظار الفحص الاسترشادي"
        : "Advisory screening queued"
      : screening.status === "running"
        ? isAr
          ? "الفحص الاسترشادي جارٍ"
          : "Advisory screening in progress"
        : screening.status === "escalated" ||
            screening.outcome === "human_review_required"
          ? isAr
            ? "مطلوب متابعة المراجعة البشرية"
            : "Human review follow-up required"
          : isAr
            ? "اكتمل الفحص الاسترشادي"
            : "Advisory screening complete";
  return (
    <section
      aria-labelledby="submission-screening-title"
      className="mb-6 rounded-xl border bg-card p-4 sm:p-5 space-y-3"
    >
      <h2 id="submission-screening-title" className="font-semibold">
        {isAr ? "حالة فحص الطلب المقدّم" : "Submitted application screening"}
      </h2>
      <p role="status" className="font-medium">
        {status}
      </p>
      <p className="text-sm text-muted-foreground">
        {active
          ? isAr
            ? "حُفظ الطلب للتقديم، ويجري الفحص في الخلفية. يمكنك مغادرة الصفحة والعودة لاحقاً؛ لا حاجة إلى إعادة التقديم."
            : "Your submission is recorded and screening runs in the background. You can leave and return later; there is no need to submit again."
          : isAr
            ? "نتائج الفحص مساعدة للمراجعين. لا تُعد موافقة أخلاقية ولا تجيز بدء البحث؛ يلزم القرار البشري المخول."
            : "Screening supports reviewers. It is not ethics approval and does not authorize research to begin; an authorized human decision is still required."}
      </p>
      {[1, 2].map(stage => {
        const result = stage === 1 ? screening.stage1 : screening.stage2;
        return result ? (
          <details key={stage}>
            <summary className="cursor-pointer text-sm font-medium">
              {isAr ? `ملاحظات المرحلة ${stage}` : `Stage ${stage} feedback`}
            </summary>
            <div className="mt-3">
              <Stage2ReviewResult
                idPrefix={`submitted-stage${stage}`}
                result={reviewView(result)}
                isAr={isAr}
                fieldLabel={
                  stage === 1 ? key => stage1FieldLabel(key, isAr) : undefined
                }
                formatText={
                  stage === 1 ? text => labelStage1Text(text, isAr) : undefined
                }
                submitted
              />
            </div>
          </details>
        ) : null;
      })}
      {active && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={refresh}
        >
          {isAr ? "تحديث الحالة" : "Refresh status"}
        </Button>
      )}
    </section>
  );
}
