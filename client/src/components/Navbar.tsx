import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PlatformNotice } from "@/components/PlatformNotice";
import { useT } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Logo } from "@/components/design/Logo";
import { ArrowLeft, ArrowRight, ChevronRight, Search, Sun, Moon, LogOut } from "lucide-react";

interface NavbarProps {
  showBack?: boolean;
  backTo?: string;
  backLabel?: string;
}

export function Navbar({ showBack, backTo = "/", backLabel }: NavbarProps) {
  const { isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { t, isRtl } = useT();
  const { theme, toggleTheme } = useTheme();

  const BackArrow = isRtl ? ArrowRight : ArrowLeft;
  const ForwardArrow = isRtl ? ArrowLeft : ChevronRight;

  return (
    <>
      <PlatformNotice />
      <nav className="sticky top-0 z-50 glass border-b border-forest-900/10">
      <div className="container flex h-16 items-center justify-between gap-4">
        <div className="cursor-pointer transition-apple shrink-0" onClick={() => setLocation("/")}>
          <Logo size={32} />
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
              <Button variant="ghost" size="sm" onClick={() => setLocation("/registry")} className="hidden md:inline-flex transition-apple">
                {t("nav.registry")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/resources")} className="hidden md:inline-flex transition-apple">
                {t("nav.resources")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/policy")} className="hidden lg:inline-flex transition-apple">
                {t("nav.policy")}
              </Button>
              {isAuthenticated ? (
                <>
                  <Button size="sm" className="bg-forest-900 hover:bg-forest-800 text-cream-50 shadow-sm" onClick={() => setLocation("/dashboard")}>
                    {t("nav.dashboard")} <ForwardArrow className="h-4 w-4 ms-1" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="transition-apple"
                    title={t("nav.logout")}
                    onClick={async () => { try { await logout(); } finally { window.location.href = "/"; } }}
                  >
                    <LogOut className="h-3.5 w-3.5 me-1" /> {t("nav.logout")}
                  </Button>
                </>
              ) : (
                <Button size="sm" className="bg-forest-900 hover:bg-forest-800 text-cream-50 shadow-sm" onClick={() => { window.location.href = getLoginUrl(); }}>
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
