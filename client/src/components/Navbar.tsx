import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DemoBanner } from "@/components/DemoBanner";
import { useT } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, ChevronRight, Search, Sun, Moon } from "lucide-react";

import { LOGO_DATA_URI } from "@shared/branding";

interface NavbarProps {
  showBack?: boolean;
  backTo?: string;
  backLabel?: string;
}

export function Navbar({ showBack, backTo = "/", backLabel }: NavbarProps) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { t, isRtl } = useT();
  const { theme, toggleTheme } = useTheme();

  const BackArrow = isRtl ? ArrowRight : ArrowLeft;
  const ForwardArrow = isRtl ? ArrowLeft : ChevronRight;

  return (
    <>
      <DemoBanner />
      <nav className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer transition-apple" onClick={() => setLocation("/")}>
          <img src={LOGO_DATA_URI} alt={t("footer.brand")} className="h-9 w-9 rounded-lg object-contain" />
          <span className="font-bold text-lg tracking-tight">{t("footer.brand")}</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {toggleTheme && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-apple"
              onClick={toggleTheme}
              title={theme === "dark" ? t("theme.light") : t("theme.dark")}
              aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}
          <LanguageToggle />
          {showBack ? (
            <Button variant="ghost" size="sm" className="transition-apple" onClick={() => setLocation(backTo)}>
              <BackArrow className="h-4 w-4 me-1" /> {backLabel || t("common.back")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/verify")} className="hidden sm:inline-flex transition-apple">
                <Search className="h-3.5 w-3.5 me-1" /> {t("nav.verify")}
              </Button>
              {isAuthenticated ? (
                <Button size="sm" className="btn-apple shadow-sm" onClick={() => setLocation("/dashboard")}>
                  {t("nav.dashboard")} <ForwardArrow className="h-4 w-4 ms-1" />
                </Button>
              ) : (
                <Button size="sm" className="btn-apple shadow-sm" onClick={() => { window.location.href = getLoginUrl(); }}>
                  {t("nav.login")} <ForwardArrow className="h-4 w-4 ms-1" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
    </>
  );
}
