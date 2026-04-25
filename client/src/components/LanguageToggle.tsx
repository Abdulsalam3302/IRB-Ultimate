import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageToggle({ variant = "ghost", size = "sm" }: { variant?: "ghost" | "outline" | "default"; size?: "sm" | "default" | "icon" }) {
  const { lang, setLang, t } = useLanguage();

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      className="gap-1.5"
    >
      <Globe className="h-4 w-4" />
      <span>{t("nav.language")}</span>
    </Button>
  );
}
