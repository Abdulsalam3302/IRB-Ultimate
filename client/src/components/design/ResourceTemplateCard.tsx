import { Button } from "@/components/ui/button";
import { FormatButton } from "@/components/FormatButton";
import { Logo } from "@/components/design/Logo";
import { isFormattableSlug } from "@shared/templateFields";
import type { FormattableSlug } from "@shared/templateFields";
import { Download } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";

type Props = {
  slug: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  icon: React.ReactNode;
  refTag?: string;
  appId?: number;
};

export function ResourceTemplateCard({
  slug,
  titleEn,
  titleAr,
  descEn,
  descAr,
  icon,
  refTag = "NBCE",
  appId,
}: Props) {
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const formattable = isFormattableSlug(slug);

  return (
    <div className="irb-card p-0 overflow-hidden flex flex-col h-full">
      <div className="p-6 pb-5 flex-1">
        <div className="flex items-start justify-between gap-3">
          <span className="w-11 h-11 rounded-xl bg-forest-50 text-forest-900 flex items-center justify-center">
            {icon}
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">{slug}</span>
        </div>
        <h3 className="font-display text-[20px] font-bold text-forest-900 mt-4 leading-tight tracking-tight">
          {isAr ? titleAr : titleEn}
        </h3>
        <p className="text-[13px] text-ink-soft mt-2 leading-relaxed">{isAr ? descAr : descEn}</p>
        <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.14em]">
          <span className="px-1.5 py-0.5 rounded bg-cream-200 text-forest-900">{refTag}</span>
          <span className="px-1.5 py-0.5 rounded bg-cream-200 text-ink-soft">PDF / DOCX</span>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 border-t border-forest-900/10">
        {/* A · Blank */}
        <div className="p-5 bg-cream-50/60 sm:border-e border-forest-900/10 border-b sm:border-b-0">
          <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-muted">
            A · {t("format.blankSection")}
          </div>
          <p className="text-[12.5px] text-forest-900 font-medium mt-1.5 leading-snug">
            {isAr ? "نموذج فارغ للتعبئة اليدوية." : "Empty form · fill on paper or in Word."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="h-9 text-[12px] ring-forest-900/15" asChild>
              <a href={`/api/export/resource/${slug}.pdf?lang=${lang}`} target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3 me-1" /> PDF
              </a>
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-[12px] ring-forest-900/15" asChild>
              <a href={`/api/export/resource/${slug}.docx?lang=${lang}`} target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3 me-1" /> DOCX
              </a>
            </Button>
          </div>
        </div>

        {/* B · Wizard */}
        {formattable ? (
          <div className="p-5 bg-forest-900 text-cream-50 relative overflow-hidden">
            <div className="absolute -right-6 -top-8 opacity-10 pointer-events-none">
              <Logo size={96} tone="cream" withText={false} />
            </div>
            <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-cream-50/55 relative">
              B · {t("format.filledSection")}
            </div>
            <p className="text-[12.5px] font-medium mt-1.5 leading-snug relative">
              {t("format.prefilledHint")}
            </p>
            <div className="mt-3 relative">
              <FormatButton
                context={{ kind: "slug", slug: slug as FormattableSlug, appId }}
                wizardCta
              />
            </div>
            <div className="mt-3 flex items-center gap-1 text-[10.5px] text-cream-50/60 font-mono uppercase tracking-[0.14em] relative">
              <span className="inline-flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-jade-400" /> stamped
              </span>
              <span>·</span>
              <span>{t("format.stampNote").split(".")[0]}</span>
            </div>
          </div>
        ) : (
          <div className="p-5 bg-cream-100 flex items-center justify-center text-[12px] text-ink-muted text-center">
            {isAr ? "للقراءة فقط — لا يوجد معالج تنسيق" : "Read-only — no format wizard"}
          </div>
        )}
      </div>
    </div>
  );
}
