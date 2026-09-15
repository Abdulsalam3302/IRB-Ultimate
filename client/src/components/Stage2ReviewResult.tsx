import { stage2FieldLabel, STAGE2_KEYS } from "@shared/stage2Fields";
import { reviewText, type ReviewView } from "@/lib/aiReviewPresentation";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
export function Stage2ReviewResult({
  result,
  isAr,
  stale = false,
  onField,
  idPrefix = "stage2",
  fieldLabel,
  formatText,
  submitted = false,
}: {
  result: ReviewView;
  isAr: boolean;
  stale?: boolean;
  onField?: (key: string) => void;
  submitted?: boolean;
  idPrefix?: string;
  fieldLabel?: (key: string) => string;
  formatText?: (text: string) => string;
}) {
  const label = fieldLabel ?? ((key: string) => stage2FieldLabel(key, isAr));
  const text = formatText ?? ((value: string) => reviewText(value, isAr));
  return (
    <section
      id={`${idPrefix}-review-result`}
      aria-labelledby={`${idPrefix}-review-title`}
      className="rounded-xl border bg-card p-4 sm:p-5 space-y-3 scroll-mt-24"
    >
      <h2
        id={`${idPrefix}-review-title`}
        className="font-semibold flex items-center gap-2"
      >
        <Brain className="h-4 w-4" aria-hidden />
        {isAr ? "مراجعة الذكاء الاصطناعي" : "AI review"}
      </h2>
      {result.status === "unavailable" ? (
        <div role="status" className="space-y-2">
          <p className="font-medium">
            {isAr
              ? "المراجعة الآلية غير متاحة حالياً"
              : "AI review is currently unavailable"}
          </p>
          <p className="text-sm text-muted-foreground">
            {submitted
              ? isAr
                ? "لم يُنتج الفحص درجة أو نتيجة علمية جديدة. يتابع المراجعون البشريون الطلب المقدّم؛ لا حاجة إلى إعادة تقديمه بسبب تعذر المراجعة الآلية."
                : "Screening produced no new score or scientific assessment. Human reviewers can assess the submitted record; there is no need to resubmit because AI review was unavailable."
              : isAr
                ? "لم تُنتج درجة أو نتيجة علمية جديدة. يمكنك متابعة إعداد طلبك، أو إعادة المحاولة لاحقاً، أو الانتقال للتحقق من جاهزية التقديم للمراجعة البشرية."
                : "No new score or scientific assessment was produced. Continue preparing your application, retry later, or check readiness for human review."}
          </p>
        </div>
      ) : result.status === "needs_information" ? (
        <div role="status" className="space-y-2">
          <p className="text-sm">
            {isAr
              ? "أكمل المعلومات التالية قبل طلب المراجعة الآلية. لم تُحتسب درجة."
              : "Complete the following information before requesting AI review. No score was assigned."}
          </p>
          <ul className="space-y-1">
            {result.issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`}>
                <span>
                  {onField ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 whitespace-normal text-start"
                      onClick={() => onField(issue.field)}
                    >
                      {label(issue.field)}
                    </Button>
                  ) : (
                    label(issue.field)
                  )}{" "}
                  —{" "}
                  {issue.reason === "empty"
                    ? isAr
                      ? "لم يُستكمل"
                      : "not completed"
                    : isAr
                      ? "يحتوي على نص مؤقت يحتاج الاستكمال"
                      : "contains an unresolved placeholder"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-2xl font-semibold" data-testid="ai-review-score">
              {result.score}
              <span className="text-sm text-muted-foreground"> / 100</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "تقييم استرشادي؛ ليس موافقة أخلاقية"
                : "Advisory assessment; not ethics approval"}
              {result.cached
                ? isAr
                  ? " · مراجعة محفوظة لنفس المحتوى"
                  : " · saved review of the same content"
                : ""}
            </p>
          </div>
          {result.feedback && (
            <p className="text-sm whitespace-pre-wrap break-words">
              {text(result.feedback)}
            </p>
          )}
          {result.recommendations.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium text-sm">
                {isAr ? "التوصيات" : "Recommendations"} (
                {result.recommendations.length})
              </summary>
              <ul className="list-disc ps-5 space-y-2 mt-3 text-sm">
                {result.recommendations.map((recommendation, index) => (
                  <li className="break-words" key={index}>
                    {text(recommendation)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(result.fieldScores.length > 0 ||
            Object.keys(result.fieldSuggestions).length > 0) && (
            <details>
              <summary className="cursor-pointer font-medium text-sm">
                {isAr ? "ملاحظات الحقول" : "Field feedback"}
              </summary>
              <div className="space-y-3 mt-3">
                {Array.from(
                  new Set([
                    ...result.fieldScores.map(row => row.field),
                    ...Object.keys(result.fieldSuggestions),
                  ])
                ).map(key => {
                  const score = result.fieldScores.find(
                    row => row.field === key
                  );
                  const suggestion = result.fieldSuggestions[key];
                  return (
                    <div
                      key={key}
                      className="border-s-2 ps-3 text-sm space-y-1"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {onField &&
                        STAGE2_KEYS.includes(
                          key as (typeof STAGE2_KEYS)[number]
                        ) ? (
                          <button
                            type="button"
                            className="font-medium text-primary underline text-start"
                            onClick={() => onField(key)}
                          >
                            {label(key)}
                          </button>
                        ) : (
                          <span className="font-medium">{label(key)}</span>
                        )}
                        {score && (
                          <span className="text-muted-foreground">
                            {score.score}/100
                          </span>
                        )}
                      </div>
                      {score?.feedback && (
                        <p className="whitespace-pre-wrap break-words">
                          {text(score.feedback)}
                        </p>
                      )}
                      {suggestion && suggestion !== score?.feedback && (
                        <p className="whitespace-pre-wrap break-words text-muted-foreground">
                          {text(suggestion)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
      {stale && (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-200">
          {isAr
            ? "عُدلت المسودة بعد هذه المراجعة. الملاحظات لا تصف آخر تغييراتك؛ يمكنك طلب مراجعة جديدة عند الانتهاء."
            : "The draft changed after this review. Its feedback does not assess your latest edits; request another review when ready."}
        </p>
      )}
    </section>
  );
}
