import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
export default function Stage2SampleSizeCalculator({
  isAr,
  onApply,
}: {
  isAr: boolean;
  onApply: (value: string) => void;
}) {
  const [form, setForm] = useState({
    studyType: "cross_sectional",
    confidenceLevel: 95,
    marginOfError: 5,
    populationSize: 0,
    expectedProportion: 50,
  });
  const [error, setError] = useState(false);
  const calc = trpc.application.calculateSampleSize.useMutation();
  return (
    <form
      aria-label={isAr ? "حاسبة حجم العينة" : "Sample size calculator"}
      className="space-y-3"
      onSubmit={async event => {
        event.preventDefault();
        if (calc.isPending) return;
        setError(false);
        try {
          await calc.mutateAsync(form);
        } catch {
          setError(true);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        {isAr
          ? "تقدير مساعد يعتمد على الافتراضات المدخلة. راجع طريقة الحساب مع مختص قبل اعتمادها."
          : "An estimate based on your assumptions. Confirm the calculation method with a qualified specialist before using it."}
      </p>
      <Label htmlFor="calc-study">{isAr ? "نوع الدراسة" : "Study type"}</Label>
      <select
        id="calc-study"
        className="w-full rounded-md border p-2 bg-background"
        value={form.studyType}
        onChange={event => setForm({ ...form, studyType: event.target.value })}
      >
        {[
          ["cross_sectional", "Cross-sectional", "مقطعية"],
          ["cohort", "Cohort", "أتراب"],
          ["case_control", "Case-control", "حالات وشواهد"],
          ["rct", "Randomized trial", "تجربة عشوائية"],
          ["survey", "Survey", "مسح"],
        ].map(([value, en, ar]) => (
          <option key={value} value={value}>
            {isAr ? ar : en}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="calc-confidence">
            {isAr ? "مستوى الثقة" : "Confidence level"}
          </Label>
          <select
            id="calc-confidence"
            className="w-full rounded-md border p-2 bg-background"
            value={form.confidenceLevel}
            onChange={event =>
              setForm({ ...form, confidenceLevel: Number(event.target.value) })
            }
          >
            {[90, 95, 99].map(value => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calc-margin">
            {isAr ? "هامش الخطأ (%)" : "Margin of error (%)"}
          </Label>
          <Input
            id="calc-margin"
            type="number"
            min={1}
            max={20}
            required
            value={form.marginOfError}
            onChange={event =>
              setForm({ ...form, marginOfError: Number(event.target.value) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calc-population">
            {isAr ? "حجم المجتمع (اختياري)" : "Population size (optional)"}
          </Label>
          <Input
            id="calc-population"
            type="number"
            min={0}
            value={form.populationSize || ""}
            onChange={event =>
              setForm({ ...form, populationSize: Number(event.target.value) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calc-proportion">
            {isAr ? "النسبة المتوقعة (%)" : "Expected proportion (%)"}
          </Label>
          <Input
            id="calc-proportion"
            type="number"
            min={1}
            max={99}
            required
            value={form.expectedProportion}
            onChange={event =>
              setForm({
                ...form,
                expectedProportion: Number(event.target.value),
              })
            }
          />
        </div>
      </div>
      <Button type="submit" disabled={calc.isPending}>
        {calc.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isAr ? "احسب" : "Calculate"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {isAr
            ? "تعذر إجراء الحساب. تحقق من المدخلات وحاول مجدداً."
            : "The calculation could not be completed. Check your inputs and retry."}
        </p>
      )}
      {calc.data && (
        <div className="rounded-lg border p-3 space-y-2 text-sm">
          <p className="font-semibold">
            {isAr ? "الحجم المقترح:" : "Proposed size:"}{" "}
            {calc.data.recommendedSize}
          </p>
          <p>{calc.data.explanation}</p>
          <p className="break-words font-mono">{calc.data.formula}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onApply(
                `${calc.data!.recommendedSize} (${calc.data!.explanation})`
              )
            }
          >
            {isAr ? "استخدام هذا التقدير" : "Use this estimate"}
          </Button>
        </div>
      )}
    </form>
  );
}
