import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sparkles, FileText } from "lucide-react";
import { useLocation } from "wouter";
import {
  getRelevantFormatSlugs,
  formatWizardPath,
  SLUG_META,
  type FormatContext,
} from "@shared/formatMeta";
import { useT } from "@/contexts/LanguageContext";

type Props = {
  context: FormatContext;
  compact?: boolean;
  /** Full-width jade CTA for resource card wizard panel */
  wizardCta?: boolean;
};

/** Navigates to the Format wizard — only shows templates relevant to context. */
export function FormatButton({ context, compact, wizardCta }: Props) {
  const [, setLocation] = useLocation();
  const { t, lang } = useT();
  const isAr = lang === "ar";
  const slugs = getRelevantFormatSlugs(context);
  const appId = "appId" in context ? context.appId : context.kind === "slug" ? context.appId : undefined;

  const go = (slug: (typeof slugs)[number]) => {
    setLocation(formatWizardPath(slug, appId));
  };

  if (slugs.length === 1) {
    return (
      <Button
        variant={wizardCta ? "default" : compact ? "outline" : "default"}
        size={wizardCta ? "default" : "sm"}
        className={
          wizardCta
            ? "w-full h-9 gap-1.5 bg-forest-900 hover:bg-forest-800 text-cream-50 font-semibold text-[12px]"
            : "gap-1.5"
        }
        onClick={() => go(slugs[0]!)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {wizardCta ? (isAr ? "تنسيق · فتح المعالج" : "Format · open wizard") : t("format.button")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={compact ? "outline" : "default"} size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {t("format.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">{t("format.chooseTemplate")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {slugs.map(slug => {
          const meta = SLUG_META[slug];
          return (
            <DropdownMenuItem key={slug} onClick={() => go(slug)} className="cursor-pointer">
              <FileText className="h-3.5 w-3.5 me-2 shrink-0" />
              <span>{isAr ? meta.titleAr : meta.titleEn}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
