import { AlertTriangle } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";

const DEMO_MODE = import.meta.env.VITE_PUBLIC_DEMO_BANNER === "1";

export function DemoBanner() {
  const { t } = useT();
  if (!DEMO_MODE) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="container flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span>{t("demo.banner")}</span>
      </div>
    </div>
  );
}
