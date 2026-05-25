import { Button } from "@/components/ui/button";
import { FormatButton } from "@/components/FormatButton";
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
  appId?: number;
};

export function ResourceTemplateCard({
  slug,
  titleEn,
  titleAr,
  descEn,
  descAr,
  icon,
  appId,
}: Props) {
  const { lang } = useT();
  const isAr = lang === "ar";
  const formattable = isFormattableSlug(slug);

  return (
    <div className="irb-card p-0 overflow-hidden flex flex-col h-full">
      <div className="p-5 pb-4 flex-1">
        <span className="w-10 h-10 rounded-xl bg-forest-50 text-forest-900 flex items-center justify-center">
          {icon}
        </span>
        <h3 className="font-display text-lg font-bold text-forest-900 mt-3 leading-tight tracking-tight">
          {isAr ? titleAr : titleEn}
        </h3>
        <p className="text-[13px] text-ink-soft mt-1.5 leading-relaxed line-clamp-2">
          {isAr ? descAr : descEn}
        </p>
      </div>

      <div className="mt-auto border-t border-forest-900/10 p-4 space-y-3 bg-cream-50/40">
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-[11px] ring-forest-900/15" asChild>
            <a href={`/api/export/resource/${slug}.pdf?lang=en`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3 w-3 me-1" /> PDF EN
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] ring-forest-900/15" asChild>
            <a href={`/api/export/resource/${slug}.docx?lang=en`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3 w-3 me-1" /> DOCX EN
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] ring-forest-900/15" asChild>
            <a href={`/api/export/resource/${slug}.pdf?lang=ar`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3 w-3 me-1" /> PDF AR
            </a>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] ring-forest-900/15" asChild>
            <a href={`/api/export/resource/${slug}.docx?lang=ar`} target="_blank" rel="noopener noreferrer">
              <Download className="h-3 w-3 me-1" /> DOCX AR
            </a>
          </Button>
        </div>
        {formattable && (
          <FormatButton
            context={{ kind: "slug", slug: slug as FormattableSlug, appId }}
            wizardCta
          />
        )}
      </div>
    </div>
  );
}
