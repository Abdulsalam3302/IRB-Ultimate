import { CheckCircle2, AlertTriangle, Lightbulb, Sparkles } from "lucide-react";
import type { SubmissionQuality } from "@shared/submissionQuality";

/** Instant pre-submission guidance. Recommendations only; submission is never blocked here. */
export function SubmissionQualityPanel({
  quality,
  appId,
  isAr,
}: {
  quality: SubmissionQuality;
  appId: number;
  isAr: boolean;
}) {
  const open = quality.items.filter(item => item.status !== "pass");
  const passed = quality.items.length - open.length;
  const heading =
    quality.level === "excellent"
      ? isAr
        ? "طلبك متميز وجاهز للمراجعة"
        : "Your application looks excellent"
      : quality.level === "good"
        ? isAr
          ? "طلب جيد — بعض التحسينات ترفع جودته"
          : "Good application — a few improvements will strengthen it"
        : isAr
          ? "تحسينات مقترحة قبل التقديم"
          : "Suggested improvements before you submit";
  return (
    <section
      aria-labelledby="submission-quality"
      className="rounded-lg border p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2 id="submission-quality" className="font-semibold">
            {heading}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? `اجتاز ${passed} من ${quality.items.length} من فحوص الجودة الشائعة لدى لجان أخلاقيات البحث. هذه توصيات للمساعدة ولا تمنع التقديم.`
              : `${passed} of ${quality.items.length} common committee quality checks met. These are recommendations to help you — they never block submission.`}
          </p>
        </div>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quality.score}
        aria-label={isAr ? "مستوى جودة الطلب" : "Application quality"}
      >
        <div
          className={`h-full ${quality.level === "excellent" ? "bg-emerald-600" : quality.level === "good" ? "bg-sky-600" : "bg-amber-500"}`}
          style={{ width: `${quality.score}%` }}
        />
      </div>
      {open.length > 0 && (
        <ul className="space-y-3">
          {open.map(item => (
            <li key={item.id} className="flex gap-2 text-sm">
              {item.status === "attention" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
              ) : (
                <Lightbulb className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" aria-hidden />
              )}
              <div className="min-w-0">
                <a
                  className="font-medium text-primary underline"
                  href={`/apply/${appId}/stage${item.stage}#${item.field}`}
                >
                  {isAr ? item.titleAr : item.titleEn}
                </a>
                <p className="text-muted-foreground">
                  {isAr ? item.tipAr : item.tipEn}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {passed > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            {isAr ? `عناصر مكتملة (${passed})` : `Completed checks (${passed})`}
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {quality.items
              .filter(item => item.status === "pass")
              .map(item => (
                <li key={item.id} className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
                  {isAr ? item.titleAr : item.titleEn}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
