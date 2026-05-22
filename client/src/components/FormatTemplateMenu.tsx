import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Sparkles } from "lucide-react";
import { FORMATTABLE_SLUGS } from "@shared/templateFields";

type Props = {
  appId: number;
  lang: "en" | "ar";
  label?: string;
  compact?: boolean;
};

const SLUG_LABELS: Record<string, { en: string; ar: string }> = {
  "irb-application-form": { en: "IRB Application", ar: "طلب IRB" },
  "informed-consent": { en: "Informed Consent", ar: "الموافقة المستنيرة" },
  "research-protocol": { en: "Research Protocol", ar: "بروتوكول البحث" },
  "data-collection-instrument": { en: "Data Collection", ar: "جمع البيانات" },
};

export function FormatTemplateMenu({ appId, lang, label, compact }: Props) {
  const isAr = lang === "ar";
  const btnLabel = label ?? (isAr ? "تنسيق" : "Format");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={compact ? "outline" : "default"} size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {btnLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          {isAr ? "توليد من بيانات طلبك" : "Generate from your application"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATTABLE_SLUGS.map(slug => {
          const titles = SLUG_LABELS[slug] ?? { en: slug, ar: slug };
          return (
            <div key={slug}>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/export/application/${appId}/format/${slug}.pdf?lang=${lang}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 me-2" />
                  {isAr ? titles.ar : titles.en} — PDF
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`/api/export/application/${appId}/format/${slug}.docx?lang=${lang}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 me-2" />
                  {isAr ? titles.ar : titles.en} — DOCX
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
