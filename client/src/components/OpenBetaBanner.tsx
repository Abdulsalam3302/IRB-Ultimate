import { FlaskConical } from "lucide-react";
import { useT } from "@/contexts/LanguageContext";
import { Link } from "wouter";

/** Always-on open-beta notice for the public beta release. */
export function OpenBetaBanner() {
  const { t } = useT();

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="container flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <FlaskConical className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span>{t("beta.banner")}</span>
        <Link href="/disclaimer" className="underline underline-offset-2 font-medium hover:text-amber-800 dark:hover:text-amber-50">
          {t("beta.learnMore")}
        </Link>
      </div>
    </div>
  );
}
