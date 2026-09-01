import { Info } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";

/** Always-visible official standing notice. */
export function PlatformNotice() {
  const { t } = useT();

  return (
    <div
      role="note"
      className="border-b border-forest-900/10 bg-cream-100/80 dark:bg-forest-950/40 px-4 py-2 text-center text-[12px] leading-relaxed text-ink-soft"
    >
      <div className="container flex items-start justify-center gap-2 max-w-4xl mx-auto">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-forest-700" aria-hidden />
        <span>{t("platform.notice")}</span>
      </div>
    </div>
  );
}
