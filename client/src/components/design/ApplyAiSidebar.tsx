import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain } from "lucide-react";
import ReviewFeedback from "@/components/ReviewFeedback";
import { AI_PASS_THRESHOLD } from "@shared/types";

type Props = {
  aiResult: any;
  showAiResult: boolean;
  isAr: boolean;
  stageLabel: string;
};

export function ApplyAiSidebar({ aiResult, showAiResult, isAr, stageLabel }: Props) {
  if (!showAiResult || !aiResult || typeof aiResult.score !== "number") {
    return (
      <Card className="irb-card border-dashed border-forest-900/15 bg-cream-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-forest-900">
            <Brain className="h-4 w-4 text-jade-600" /> {isAr ? "مراجعة AI" : "AI review"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] text-ink-soft leading-relaxed">
          {isAr
            ? `احفظ ${stageLabel} وشغّل مراجعة AI لعرض الدرجة والتوصيات هنا.`
            : `Save ${stageLabel} and run AI review to see your score and recommendations here.`}
        </CardContent>
      </Card>
    );
  }

  const score = aiResult.score as number;
  const passed = score >= AI_PASS_THRESHOLD;
  const gaps = aiResult.recommendations?.length ?? 0;

  return (
    <Card className="irb-card overflow-hidden">
      <CardHeader className="pb-3 bg-forest-900 text-cream-50">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" /> {isAr ? "مراجعة AI" : "AI review"}
          </CardTitle>
          <Badge className={passed ? "bg-jade-500 text-white" : "bg-amber-500 text-white"}>
            {passed ? (isAr ? "على المسار" : "On track") : (isAr ? "يحتاج تحسين" : "Needs work")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-end gap-3">
          <div className="font-display text-5xl font-bold text-forest-900 num leading-none">{score}</div>
          <div className="text-[12px] text-ink-muted pb-1">{isAr ? "من 100" : "of 100"}</div>
        </div>
        <p className="text-[13px] text-ink-soft leading-relaxed">
          {score >= 90
            ? (isAr ? "ممتاز — جاهز للمتابعة." : "Excellent — ready to proceed.")
            : score >= AI_PASS_THRESHOLD
              ? (isAr ? "جيد — راجع التوصيات قبل التقديم." : "Good — review recommendations before submitting.")
              : (isAr ? `أقل من ${AI_PASS_THRESHOLD} — حسّن الحقول أو اختر المتابعة رغم النتيجة.` : `Below ${AI_PASS_THRESHOLD} — improve fields or proceed despite score.`)}
        </p>
        {gaps > 0 && (
          <p className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {gaps} {isAr ? "فجوات بسيطة" : "minor gaps"} · {isAr ? "راجع التوصيات أدناه" : "see recommendations below"}
          </p>
        )}
        {aiResult.feedback && (
          <div className="text-[13px] border-t border-forest-900/10 pt-3">
            <ReviewFeedback text={aiResult.feedback} isAr={isAr} />
          </div>
        )}
        {aiResult.recommendations?.length > 0 && (
          <ol className="text-[12.5px] text-ink-soft space-y-1.5 list-decimal list-inside marker:text-jade-600">
            {aiResult.recommendations.slice(0, 5).map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
