import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FormatButton } from "@/components/FormatButton";
import { Navbar } from "@/components/Navbar";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";
import type { FormatContext } from "@shared/formatMeta";
import { cn } from "@/lib/utils";

export type ApplySectionNav = {
  id: string;
  labelEn: string;
  labelAr: string;
  number: number;
};

type Props = {
  stage: 1 | 2;
  appId: number;
  appRef?: string | null;
  subtitleEn: string;
  subtitleAr: string;
  sections: ApplySectionNav[];
  formatContext: FormatContext;
  lastSaved?: Date | null;
  saving?: boolean;
  saveError?: boolean;
  onSaveExit?: () => void;
  onManualSave?: () => void;
  manualSavePending?: boolean;
  aiSidebar?: ReactNode;
  footerActions?: ReactNode;
  children: ReactNode;
};

export function ApplyStageShell({
  stage,
  appId,
  appRef,
  subtitleEn,
  subtitleAr,
  sections,
  formatContext,
  lastSaved,
  saving,
  saveError,
  onSaveExit,
  onManualSave,
  manualSavePending,
  aiSidebar,
  footerActions,
  children,
}: Props) {
  const [, setLocation] = useLocation();
  const { lang } = useT();
  const isAr = lang === "ar";
  const refLabel = appRef || `APP-${appId}`;

  return (
    <div className="min-h-screen bg-cream-50">
      <Navbar showBack backTo="/dashboard" backLabel={isAr ? "العودة للوحة التحكم" : "Back to dashboard"} />

      <div className="border-b border-forest-900/10 bg-white/80 backdrop-blur">
        <div className="container py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-muted">
              {refLabel} · {isAr ? `المرحلة ${stage}` : `Stage ${stage}`}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 mt-1">
              {isAr ? `المرحلة ${stage} من 2` : `Stage ${stage} of 2`}
            </h1>
            <p className="text-[13.5px] text-ink-soft mt-0.5">{isAr ? subtitleAr : subtitleEn}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saving && (
              <span className="text-xs text-ink-muted inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> {isAr ? "جاري الحفظ..." : "Saving..."}
              </span>
            )}
            {!saving && !saveError && lastSaved && (
              <span className="text-xs text-ink-muted">
                {isAr ? "تم الحفظ" : "Saved"} · {lastSaved.toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {saveError && (
              <span className="text-xs text-rose-600">{isAr ? "فشل الحفظ" : "Save failed"}</span>
            )}
            {onManualSave && (
              <Button variant="outline" size="sm" className="h-9 ring-forest-900/15" onClick={onManualSave} disabled={manualSavePending}>
                <Save className="h-3.5 w-3.5 me-1" /> {isAr ? "حفظ" : "Save"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={onSaveExit ?? (() => setLocation("/dashboard"))}
            >
              {isAr ? "حفظ وخروج" : "Save & exit"}
            </Button>
          </div>
        </div>
        <div className="container pb-3">
          <Progress value={stage === 1 ? 50 : 100} className="h-1.5 bg-cream-200" />
        </div>
      </div>

      <div className="container py-8">
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Section nav */}
          <aside className="lg:col-span-2 hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-3">
                {isAr ? "الأقسام" : "Sections"}
              </div>
              {sections.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block px-3 py-2 rounded-lg text-[13px] text-ink-soft hover:bg-cream-200/70 hover:text-forest-900 transition-colors"
                >
                  {isAr ? s.labelAr : s.labelEn}
                </a>
              ))}
              <div className="pt-4 mt-4 border-t border-forest-900/10 space-y-2">
                <FormatButton context={formatContext} compact />
              </div>
            </div>
          </aside>

          {/* Main form */}
          <div className="lg:col-span-6 space-y-6">{children}</div>

          {/* AI sidebar */}
          {aiSidebar && (
            <aside className="lg:col-span-4">
              <div className="sticky top-24 space-y-4">{aiSidebar}</div>
            </aside>
          )}
        </div>

        {footerActions && (
          <div className="mt-8 pt-6 border-t border-forest-900/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <Button variant="outline" className="ring-forest-900/15" onClick={() => setLocation(stage === 1 ? "/dashboard" : `/apply/${appId}/stage1`)}>
              <ArrowLeft className="h-4 w-4 me-1" />
              {stage === 1 ? (isAr ? "لوحة التحكم" : "Dashboard") : (isAr ? "المرحلة 1" : "Stage 1")}
            </Button>
            <div className="flex flex-wrap gap-3 justify-end">{footerActions}</div>
          </div>
        )}
      </div>
    </div>
  );
}

type SectionProps = {
  id: string;
  number: number;
  titleEn: string;
  titleAr: string;
  descEn?: string;
  descAr?: string;
  children: ReactNode;
  className?: string;
};

export function ApplySection({ id, number, titleEn, titleAr, descEn, descAr, children, className }: SectionProps) {
  const { lang } = useT();
  const isAr = lang === "ar";

  return (
    <section id={id} className={cn("irb-card p-6 sm:p-8 scroll-mt-28", className)}>
      <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-muted mb-2">
        {isAr ? `القسم ${number}` : `Section ${number}`} · {isAr ? titleAr : titleEn}
      </div>
      {(descEn || descAr) && (
        <p className="text-[13.5px] text-ink-soft mb-6 leading-relaxed">{isAr ? descAr : descEn}</p>
      )}
      {children}
    </section>
  );
}
