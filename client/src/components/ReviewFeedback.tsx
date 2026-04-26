import { Button } from "@/components/ui/button";
import { ClipboardCopy, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Renders a Stage 1/2 AI feedback string. Detects two embedded tokens:
 *   EXAMPLE: …       — copy-pasteable template; renders in a bordered
 *                      callout with a "Use this" button that drops the
 *                      example into the matching field.
 *   FASTEST FIX:     — only used in the overall feedback; the bullets
 *                      that follow are surfaced as a numbered checklist.
 */

interface Props {
  text: string;
  isAr?: boolean;
  /** When provided, the "Use this" button copies the example into this field. */
  fieldKey?: string;
  onApplyExample?: (fieldKey: string, value: string) => void;
}

interface Parsed {
  diagnosis: string;
  example?: string;
  fastestFix?: string[];
}

function parseFeedback(text: string): Parsed {
  if (!text) return { diagnosis: "" };

  // Pull out the "FASTEST FIX:" tail if present (overall feedback only).
  let body = text;
  let fastestFix: string[] | undefined;
  const ffIdx = body.search(/FASTEST FIX:\s*/i);
  if (ffIdx >= 0) {
    const tail = body.slice(ffIdx).replace(/^FASTEST FIX:\s*/i, "");
    body = body.slice(0, ffIdx).trim();
    fastestFix = tail
      .split(/\n+/)
      .map(line => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  // Pull out the EXAMPLE: block if present.
  let example: string | undefined;
  const exIdx = body.search(/\nEXAMPLE:\s*/i) >= 0
    ? body.search(/\nEXAMPLE:\s*/i)
    : body.search(/^EXAMPLE:\s*/i);
  if (exIdx >= 0) {
    const tail = body.slice(exIdx).replace(/^\s*EXAMPLE:\s*/im, "").trim();
    body = body.slice(0, exIdx).trim();
    example = tail.split(/\n{2,}/)[0]?.trim();
  }

  return { diagnosis: body.trim(), example, fastestFix };
}

export default function ReviewFeedback({
  text,
  isAr,
  fieldKey,
  onApplyExample,
}: Props) {
  const parsed = parseFeedback(text);

  const useThis = () => {
    if (!parsed.example) return;
    if (fieldKey && onApplyExample) {
      onApplyExample(fieldKey, parsed.example);
      toast.success(isAr ? "تم تطبيق المثال" : "Example applied to field");
    } else {
      navigator.clipboard.writeText(parsed.example);
      toast.success(isAr ? "تم نسخ المثال" : "Example copied to clipboard");
    }
  };

  // Detect the server-side outage marker emitted by aiReview.ts when
  // the LLM call fails. Render a clear "service unavailable" panel
  // instead of a confusing zero score.
  const isUnavailable = text?.startsWith("[AI_UNAVAILABLE]");
  if (isUnavailable) {
    const msg = text.replace(/^\[AI_UNAVAILABLE\]\s*/, "");
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
          {isAr ? "خدمة الذكاء الاصطناعي غير متوفرة مؤقتًا" : "AI service temporarily unavailable"}
        </p>
        <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {parsed.diagnosis && (
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {parsed.diagnosis}
        </p>
      )}

      {parsed.example && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {isAr ? "مثال يصلح للنسخ" : "Copy-pasteable example"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs border-emerald-300 dark:border-emerald-700"
              onClick={useThis}
            >
              <ClipboardCopy className="h-3 w-3 me-1" />
              {fieldKey && onApplyExample
                ? isAr ? "استخدم هذا" : "Use this"
                : isAr ? "نسخ" : "Copy"}
            </Button>
          </div>
          <p className="text-sm leading-relaxed font-mono whitespace-pre-line">
            {parsed.example}
          </p>
        </div>
      )}

      {parsed.fastestFix && parsed.fastestFix.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1.5">
            {isAr ? "أسرع طريقة للإصلاح" : "Fastest fix"}
          </p>
          <ol className="text-sm space-y-1 list-decimal list-inside marker:text-amber-700 dark:marker:text-amber-400">
            {parsed.fastestFix.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
